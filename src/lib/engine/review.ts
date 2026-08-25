import { Chess } from "chess.js";
import { StockfishEngine, type PerformanceMode, type EngineLine } from "@/lib/engine/stockfish";
import type { GameReview } from "@/lib/history";
import type { MoveRecord } from "@/hooks/useChessGame";
import {
  cpToWinPercent,
  MATE_CP,
  MAX_CP_LOSS,
  ratingFromAcpl,
  weightedAccuracy,
} from "@/lib/analysis/winrate";
import { positionComplexity } from "@/lib/analysis/complexity";
import { classifyMove, summarizeLabels, type MoveLabel } from "@/lib/analysis/classify";
import { detectMotifs } from "@/lib/analysis/motifs";
import { analyseStructure, detectPhase } from "@/lib/analysis/phase";
import { see } from "@/lib/analysis/see";
import { bookMovesFor } from "@/lib/chess/openings";
import { computeSignals, fairplayReport } from "@/lib/fairplay/score";
import type { PlyAnalysis } from "@/lib/analysis/types";
import { pvToSan, type Variation } from "@/lib/analysis/variation";

/** Win-percent loss from which deep mode attaches detailed variations. */
const DEEP_LOSS_THRESHOLD = 3;
const DEEP_LABELS = new Set(["inaccuracy", "mistake", "miss", "blunder"]);

/** Mover-POV evaluation of a position, plus the engine's candidate moves. */
interface PositionEval {
  /** Win percent for the side to move. */
  winPercent: number;
  /** White-POV centipawns. */
  cpWhite: number | null;
  /** Centipawns from the moving side's perspective. */
  cpMover: number | null;
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
      cpMover: -MATE_CP,
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
      cpMover: 0,
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
    cpMover: best ? cpMover : null,
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
  /** Deep analysis: longer search, more candidate lines and stored variations. */
  deep?: boolean;
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
  moveTimeMs,
  performance = "balanced",
  multiPv,
  deep = false,
  onProgress,
  signal,
}: ReviewOptions): Promise<GameReview> {
  const searchTime = moveTimeMs ?? (deep ? 900 : 260);
  const pvCount = multiPv ?? (deep ? 5 : 4);
  const engine = new StockfishEngine(performance);
  const positions = [startFen, ...moves.map((m) => m.fen)];
  const evals: (PositionEval | null)[] = [];
  const linesAt: EngineLine[][] = [];

  try {
    await engine.init();
    for (let i = 0; i < positions.length; i += 1) {
      if (signal?.cancelled) break;
      const fen = positions[i]!;
      const terminal = terminalEval(fen);
      if (terminal) {
        evals.push(terminal);
        linesAt.push([]);
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
            moveTimeMs: searchTime,
            multiPv: pvCount,
            skill: null,
            uciElo: null,
          });
          linesAt.push(deep ? lines : []);
          evals.push(fromLines(fen, lines, legalMoves));
        } catch {
          linesAt.push([]);
          evals.push(null);
        }
      }
      onProgress?.(i + 1, positions.length);
    }
  } finally {
    engine.destroy();
  }
  while (evals.length < positions.length) evals.push(null);
  while (linesAt.length < positions.length) linesAt.push([]);

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
    const cpBest = evalBefore?.cpMover ?? null;
    const cpAfterMover = evalAfter?.cpMover ?? null;
    const cpLoss =
      cpBest === null || cpAfterMover === null
        ? null
        : Math.min(MAX_CP_LOSS, Math.max(0, Math.round(cpBest - -cpAfterMover)));
    const uci = `${move.from}${move.to}`;
    const isBestMove = !!evalBefore?.bestUci && evalBefore.bestUci.slice(0, 4) === uci;
    const seeValue = see(fenBefore, move.from, move.to);

    const classification = classifyMove({
      before,
      after,
      bestAfter,
      isBestMove,
      secondBestAfter:
        (evalBefore?.candidates?.length ?? 0) >= 2 ? evalBefore!.candidates[1]! : null,
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

    let variations: Variation[] | undefined;
    let playedPvSan: string[] | undefined;
    if (
      deep &&
      (classification.loss >= DEEP_LOSS_THRESHOLD || DEEP_LABELS.has(classification.label))
    ) {
      const candidates = (linesAt[i] ?? []).slice(0, 3);
      const mapped = candidates
        .map((line): Variation => {
          const pvSan = pvToSan(fenBefore, line.pv, 8);
          return {
            uci: line.move,
            san: pvSan[0] ?? line.move,
            pvSan,
            cp: line.cp,
            mateIn: line.mateIn,
            depth: line.depth,
          };
        })
        .filter((v) => v.pvSan.length > 0);
      if (mapped.length > 0) variations = mapped;
      const reply = linesAt[i + 1]?.[0];
      if (reply) {
        const continuation = pvToSan(fenAfter, reply.pv, 6);
        playedPvSan = [move.san, ...continuation];
      }
    }

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
      cpLoss,
      accuracy: Math.round(classification.accuracy * 10) / 10,
      weight: classification.weight,
      complexity,
      see: seeValue,
      motifs,
      phase: detectPhase(fenAfter, Math.floor(i / 2) + 1),
      spentMs: null,
      ...(variations ? { variations } : {}),
      ...(playedPvSan ? { playedPvSan } : {}),
    });
  }

  /* -------------------------------- summary -------------------------------- */

  const bySide = (color: "w" | "b") => plies.filter((p) => p.color === color);
  const accuracyFor = (color: "w" | "b") =>
    weightedAccuracy(bySide(color).map((p) => ({ accuracy: p.accuracy, weight: p.weight })));
  /** Average centipawn loss — the metric `ratingFromAcpl` is calibrated on. */
  const acplFor = (color: "w" | "b") => {
    const own = bySide(color).filter((p) => p.cpLoss !== null && p.cpLoss !== undefined);
    if (own.length === 0) return 0;
    return Math.round((own.reduce((a, p) => a + (p.cpLoss ?? 0), 0) / own.length) * 10) / 10;
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
    depth: deep ? "deep" : "quick",
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
