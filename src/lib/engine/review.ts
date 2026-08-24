import { Chess } from "chess.js";
import { StockfishEngine, type PerformanceMode, type EngineLine } from "@/lib/engine/stockfish";
import type { GameReview } from "@/lib/history";
import type { MoveRecord } from "@/hooks/useChessGame";
import { cpToWinPercent, MATE_CP, ratingFromAcpl, weightedAccuracy } from "@/lib/analysis/winrate";
import { positionComplexity } from "@/lib/analysis/complexity";
import { classifyMove, summarizeLabels, type MoveLabel } from "@/lib/analysis/classify";
import { detectMotifs } from "@/lib/analysis/motifs";
import { analyseStructure, detectPhase } from "@/lib/analysis/phase";
import { see } from "@/lib/analysis/see";
import { bookMovesFor } from "@/lib/chess/openings";
import { computeSignals, fairplayReport } from "@/lib/fairplay/score";
import type { PlyAnalysis } from "@/lib/analysis/types";

/** Mover-POV evaluation of a position, plus the engine's candidate moves. */
interface PositionEval {
  /** Win percent for the side to move. */
  winPercent: number;
  /** White-POV centipawns. */
  cpWhite: number | null;
  bestUci: string | null;
  mateIn: number | null;
  candidates: number[];
  legalMoves: number;
  terminal: boolean;
}

function terminalEval(fen: string): PositionEval | null {
  let game: Chess;
  try {
    game = new Chess(fen);
  } catch {
    return null;
  }
  const legalMoves = game.moves().length;
  if (game.isCheckmate()) {
    const cpWhite = game.turn() === "w" ? -MATE_CP : MATE_CP;
    return {
      winPercent: 0,
      cpWhite,
      bestUci: null,
      mateIn: null,
      candidates: [],
      legalMoves,
      terminal: true,
    };
  }
  if (game.isGameOver()) {
    return {
      winPercent: 50,
      cpWhite: 0,
      bestUci: null,
      mateIn: null,
      candidates: [],
      legalMoves,
      terminal: true,
    };
  }
  return null;
}

function fromLines(fen: string, lines: EngineLine[], legalMoves: number): PositionEval {
  const best = lines[0];
  const scoreOf = (line: EngineLine): number =>
    line.mateIn !== null ? (line.mateIn > 0 ? MATE_CP : -MATE_CP) : (line.cp ?? 0);
  const cpMover = best ? scoreOf(best) : 0;
  const blackToMove = fen.split(" ")[1] === "b";
  return {
    winPercent: cpToWinPercent(cpMover),
    cpWhite: best ? (blackToMove ? -cpMover : cpMover) : null,
    bestUci: best?.move ?? null,
    mateIn: best?.mateIn ?? null,
    candidates: lines.map((l) => cpToWinPercent(scoreOf(l))),
    legalMoves,
    terminal: false,
  };
}

export interface ReviewOptions {
  startFen: string;
  moves: MoveRecord[];
  moveTimeMs?: number;
  performance?: PerformanceMode;
  multiPv?: number;
  onProgress?: (done: number, total: number) => void;
  signal?: { cancelled: boolean };
}

/**
 * Deep game review: evaluates every position with MultiPV, then derives
 * per-move classification, motifs, complexity-weighted accuracy, estimated
 * rating and fair-play signals. Runs entirely in the browser worker.
 */
export async function reviewGame({
  startFen,
  moves,
  moveTimeMs = 260,
  performance = "balanced",
  multiPv = 4,
  onProgress,
  signal,
}: ReviewOptions): Promise<GameReview> {
  const engine = new StockfishEngine(performance);
  const positions = [startFen, ...moves.map((m) => m.fen)];
  const evals: (PositionEval | null)[] = [];

  try {
    await engine.init();
    for (let i = 0; i < positions.length; i += 1) {
      if (signal?.cancelled) break;
      const fen = positions[i]!;
      const terminal = terminalEval(fen);
      if (terminal) {
        evals.push(terminal);
      } else {
        let legalMoves = 0;
        try {
          legalMoves = new Chess(fen).moves().length;
        } catch {
          legalMoves = 0;
        }
        try {
          const lines = await engine.search({
            fen,
            moveTimeMs,
            multiPv,
            skill: null,
            uciElo: null,
          });
          evals.push(fromLines(fen, lines, legalMoves));
        } catch {
          evals.push(null);
        }
      }
      onProgress?.(i + 1, positions.length);
    }
  } finally {
    engine.destroy();
  }
  while (evals.length < positions.length) evals.push(null);

  /* ------------------------- derive per-ply analysis ------------------------ */

  const plies: PlyAnalysis[] = [];
  const sans: string[] = [];
  for (let i = 0; i < moves.length; i += 1) {
    const move = moves[i]!;
    const fenBefore = positions[i]!;
    const fenAfter = positions[i + 1]!;
    const evalBefore = evals[i];
    const evalAfter = evals[i + 1];
    const book = bookMovesFor(sans);
    sans.push(move.san);

    const complexity = evalBefore
      ? positionComplexity({
          candidateWinPercents: evalBefore.candidates,
          legalMoves: evalBefore.legalMoves,
        })
      : 0.5;
    const before = evalBefore?.winPercent ?? 50;
    const bestAfter = before; // engine best keeps the mover at its evaluated win%
    const after = evalAfter ? 100 - evalAfter.winPercent : before;
    const uci = `${move.from}${move.to}`;
    const isBestMove = !!evalBefore?.bestUci && evalBefore.bestUci.slice(0, 4) === uci;
    const seeValue = see(fenBefore, move.from, move.to);

    const classification = classifyMove({
      before,
      after,
      bestAfter,
      isBestMove,
      secondBestAfter: evalBefore?.candidates?.[1] ?? null,
      see: seeValue,
      complexity,
      inBook: book.includes(move.san),
      hadWinningTactic: (evalBefore?.mateIn ?? null) !== null,
    });

    const motifs = detectMotifs({
      fenBefore,
      fenAfter,
      from: move.from,
      to: move.to,
      san: move.san,
      mateIn: evalAfter ? (evalAfter.mateIn !== null ? -evalAfter.mateIn : null) : null,
    }).map((m) => m.motif);

    plies.push({
      index: i,
      color: move.color,
      san: move.san,
      uci,
      fenBefore,
      fenAfter,
      cpAfter: evalAfter?.cpWhite ?? null,
      bestUci: evalBefore?.bestUci ?? null,
      label: classification.label,
      loss: Math.round(classification.loss * 10) / 10,
      accuracy: Math.round(classification.accuracy * 10) / 10,
      weight: classification.weight,
      complexity,
      see: seeValue,
      motifs,
      phase: detectPhase(fenAfter, Math.floor(i / 2) + 1),
      spentMs: null,
    });
  }

  /* -------------------------------- summary -------------------------------- */

  const bySide = (color: "w" | "b") => plies.filter((p) => p.color === color);
  const accuracyFor = (color: "w" | "b") =>
    weightedAccuracy(bySide(color).map((p) => ({ accuracy: p.accuracy, weight: p.weight })));
  const acplFor = (color: "w" | "b") => {
    const own = bySide(color);
    if (own.length === 0) return 0;
    return Math.round((own.reduce((a, p) => a + p.loss, 0) / own.length) * 10) / 10;
  };
  const labelsFor = (color: "w" | "b") =>
    summarizeLabels(bySide(color).map((p) => p.label as MoveLabel));

  const acpl = { w: acplFor("w"), b: acplFor("b") };
  const structure = analyseStructure(
    positions[positions.length - 1]!,
    Math.ceil(moves.length / 2),
  );

  return {
    evals: plies.map((p) => p.cpAfter),
    startEval: evals[0]?.cpWhite ?? 0,
    accuracy: { w: accuracyFor("w"), b: accuracyFor("b") },
    reviewedAt: new Date().toISOString(),
    plies,
    summary: {
      acpl,
      estimatedRating: { w: ratingFromAcpl(acpl.w), b: ratingFromAcpl(acpl.b) },
      labels: { w: labelsFor("w"), b: labelsFor("b") },
      complexityAvg:
        plies.length === 0
          ? 0
          : Math.round((plies.reduce((a, p) => a + p.complexity, 0) / plies.length) * 1000) / 1000,
      plans: structure.plans,
    },
    fairplay: {
      w: fairplayReport(computeSignals(plies, "w")),
      b: fairplayReport(computeSignals(plies, "b")),
    },
  };
}
