import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VariantId } from "@/config/variants";
import { VARIANT_RULES } from "@/lib/chess/variants";
import { rulesFor } from "@/lib/chess/rules";
import type { AppliedMove, RulesPosition } from "@/lib/chess/rules";
import type { TimeControl } from "@/config/app";
import { playSound } from "@/lib/sound";
import { detectOpening } from "@/lib/chess/openings";

export type Color = "w" | "b";

export interface GameResult {
  winner: Color | "draw";
  reason: string;
}

export interface ClockState {
  w: number;
  b: number;
}

export interface GameSnapshot {
  startFen: string;
  finalFen: string;
  moves: MoveRecord[];
}

export interface UseChessGameOptions {
  variant: VariantId;
  timeControl: TimeControl | null;
  onGameEnd?: (result: GameResult, snapshot: GameSnapshot) => void;
}

export interface MoveRecord {
  san: string;
  from: string;
  to: string;
  color: Color;
  fen: string;
}

function toResult(
  game: RulesPosition,
  variantId: VariantId,
  history: string[],
): GameResult | null {
  const variantResult = VARIANT_RULES[variantId].checkResult(game, history);
  if (variantResult.over && variantResult.winner) {
    return { winner: variantResult.winner, reason: variantResult.reason ?? "Variant objective" };
  }
  if (game.isCheckmate()) {
    return { winner: game.turn() === "w" ? "b" : "w", reason: "Checkmate" };
  }
  if (game.isStalemate()) return { winner: "draw", reason: "Stalemate" };
  if (game.isInsufficientMaterial()) return { winner: "draw", reason: "Insufficient material" };
  if (game.isThreefoldRepetition()) return { winner: "draw", reason: "Threefold repetition" };
  if (game.isDraw()) return { winner: "draw", reason: "Fifty-move rule" };
  return null;
}

export function useChessGame({ variant, timeControl, onGameEnd }: UseChessGameOptions) {
  const gameRef = useRef<RulesPosition>(null as unknown as RulesPosition);
  if (gameRef.current === null) {
    gameRef.current = rulesFor(variant).createPosition(VARIANT_RULES[variant].startingFen());
  }

  const [fen, setFen] = useState(() => gameRef.current.fen());
  const [moves, setMoves] = useState<MoveRecord[]>([]);
  const [result, setResult] = useState<GameResult | null>(null);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [clock, setClock] = useState<ClockState>(() => ({
    w: timeControl?.initial ?? 0,
    b: timeControl?.initial ?? 0,
  }));
  const [started, setStarted] = useState(false);
  const resultRef = useRef<GameResult | null>(null);
  const lowTimeFlag = useRef<{ w: boolean; b: boolean }>({ w: false, b: false });
  // Mirrors of state used to build a snapshot synchronously when the game ends.
  const movesRef = useRef<MoveRecord[]>([]);
  const startFenRef = useRef<string>(gameRef.current.fen());

  const reset = useCallback(() => {
    // No silent fallback: an invalid variant FEN is a rule-engine integrity
    // bug and must surface, never be downgraded to standard chess.
    const game = rulesFor(variant).createPosition(VARIANT_RULES[variant].startingFen());
    gameRef.current = game;
    startFenRef.current = game.fen();
    movesRef.current = [];
    setFen(game.fen());
    setMoves([]);
    setResult(null);
    resultRef.current = null;
    setLastMove(null);
    setStarted(false);
    lowTimeFlag.current = { w: false, b: false };
    setClock({ w: timeControl?.initial ?? 0, b: timeControl?.initial ?? 0 });
  }, [variant, timeControl]);

  /** Load an arbitrary position (analysis board). Returns false on invalid FEN. */
  const loadFen = useCallback(
    (fenString: string): boolean => {
      let game: RulesPosition;
      try {
        game = rulesFor(variant).createPosition(fenString);
      } catch {
        return false;
      }
      gameRef.current = game;
      startFenRef.current = game.fen();
      movesRef.current = [];
      setFen(game.fen());
      setMoves([]);
      setResult(null);
      resultRef.current = null;
      setLastMove(null);
      setStarted(false);
      return true;
    },
    [variant],
  );


  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, timeControl?.id]);

  const finish = useCallback(
    (r: GameResult) => {
      if (resultRef.current) return;
      resultRef.current = r;
      setResult(r);
      onGameEnd?.(r, {
        startFen: startFenRef.current,
        finalFen: gameRef.current.fen(),
        moves: [...movesRef.current],
      });
    },
    [onGameEnd],
  );

  // Clock ticking — a single interval mutates only clock state.
  useEffect(() => {
    if (!timeControl || !started || result) return;
    const id = window.setInterval(() => {
      const turn = gameRef.current.turn();
      setClock((prev) => {
        const next = { ...prev, [turn]: Math.max(0, prev[turn] - 0.1) } as ClockState;
        if (next[turn] <= 10 && !lowTimeFlag.current[turn]) {
          lowTimeFlag.current[turn] = true;
          playSound("lowTime");
        }
        if (next[turn] <= 0) {
          const loser = turn;
          const winner: Color = loser === "w" ? "b" : "w";
          // Timeout vs insufficient mating material is a draw.
          const opponentHasMaterial = hasMatingMaterial(gameRef.current, winner);
          finish(
            opponentHasMaterial
              ? { winner, reason: "Timeout" }
              : { winner: "draw", reason: "Timeout vs insufficient material" },
          );
        }
        return next;
      });
    }, 100);
    return () => window.clearInterval(id);
  }, [timeControl, started, result, finish]);

  const makeMove = useCallback(
    (from: string, to: string, promotion?: "q" | "r" | "b" | "n"): boolean => {
      if (resultRef.current) return false;
      const game = gameRef.current;
      const move: AppliedMove | null = game.move(from, to, promotion);
      if (!move) {
        playSound("illegal");
        return false;
      }

      if (timeControl) {
        setClock((prev) => ({ ...prev, [move!.color]: prev[move!.color] + timeControl.increment }));
      }
      setStarted(true);
      setFen(game.fen());
      setLastMove({ from: move.from, to: move.to });
      const record: MoveRecord = {
        san: move.san,
        from: move.from,
        to: move.to,
        color: move.color,
        fen: game.fen(),
      };
      movesRef.current = [...movesRef.current, record];
      setMoves((prev) => [...prev, record]);

      const history = game.historySan();
      const r = toResult(game, variant, history);
      if (r) {
        playSound(r.winner === "draw" ? "draw" : "checkmate");
        finish(r);
      } else if (game.isCheck()) {
        playSound("check");
      } else if (move.promotion) {
        playSound("promotion");
      } else if (move.castle) {
        playSound("castle");
      } else if (move.captured) {
        playSound("capture");
      } else {
        playSound("move");
      }
      return true;
    },
    [finish, timeControl, variant],
  );

  /**
   * Rewinds `plies` half-moves by replaying the remaining move list from the
   * start position. Replay keeps the rules engine authoritative (no ad-hoc
   * board surgery) and preserves variant metadata such as 960 castling rights.
   * Used by the Live Play Coach "retry this move" flow.
   */
  const takeback = useCallback(
    (plies = 1): boolean => {
      if (resultRef.current) return false;
      const keep = movesRef.current.length - plies;
      if (keep < 0) return false;
      const game = rulesFor(variant).createPosition(startFenRef.current);
      const replayed: MoveRecord[] = [];
      for (const m of movesRef.current.slice(0, keep)) {
        const applied = game.move(m.from, m.to, m.san.includes("=")
          ? (m.san.split("=")[1]?.[0]?.toLowerCase() as "q" | "r" | "b" | "n")
          : undefined);
        if (!applied) return false;
        replayed.push({
          san: applied.san,
          from: applied.from,
          to: applied.to,
          color: applied.color,
          fen: game.fen(),
        });
      }
      gameRef.current = game;
      movesRef.current = replayed;
      setMoves(replayed);
      setFen(game.fen());
      const last = replayed[replayed.length - 1];
      setLastMove(last ? { from: last.from, to: last.to } : null);
      return true;
    },
    [variant],
  );

  const resign = useCallback(
    (color: Color) => {
      finish({ winner: color === "w" ? "b" : "w", reason: "Resignation" });
    },
    [finish],
  );

  const declareDraw = useCallback(
    (reason = "Agreement") => {
      finish({ winner: "draw", reason });
    },
    [finish],
  );

  const legalTargets = useCallback(
    (square: string) => {
      if (resultRef.current) return [];
      return gameRef.current.legalTargets(square);
    },
    [fen],
  );

  const needsPromotion = useCallback(
    (from: string, to: string) => {
      return gameRef.current.needsPromotion(from, to);
    },
    [fen],
  );

  const board = useMemo(() => {
    return gameRef.current.boardPieces().map((p) => ({
      square: p.square,
      type: p.type,
      color: p.color,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen]);

  const checkSquare = useMemo(() => {
    const game = gameRef.current;
    if (!game.isCheck()) return null;
    return game.kingSquare(game.turn());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen]);

  const captured = useMemo(() => {
    // Compare the canonical starting array of *this* game against the current
    // board — no chess.js reconstruction, which would destroy 960 metadata.
    const start = rulesFor(variant).createPosition(startFenRef.current);
    const count = (g: RulesPosition, color: Color) => {
      const map: Record<string, number> = {};
      g.boardPieces().forEach((p) => {
        if (p.color === color) map[p.type] = (map[p.type] ?? 0) + 1;
      });
      return map;
    };
    const diff = (color: Color) => {
      const a = count(start, color);
      const b = count(gameRef.current, color);
      const out: { type: string; count: number }[] = [];
      Object.keys(a).forEach((t) => {
        const missing = (a[t] ?? 0) - (b[t] ?? 0);
        if (missing > 0) out.push({ type: t, count: missing });
      });
      return out;
    };
    return { w: diff("w"), b: diff("b") };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, variant]);

  const opening = useMemo(() => detectOpening(moves.map((m) => m.san)), [moves]);

  return {
    /** Rule-neutral position accessors — never a raw engine instance. */
    pieceAt: (square: string) => gameRef.current.pieceAt(square),
    legalMoveCount: () => gameRef.current.legalMoves().length,
    fen,
    /** Position the current game started from (variant-aware). */
    startFen: startFenRef.current,
    moves,
    board,
    result,
    lastMove,
    clock,
    started,
    turn: gameRef.current.turn() as Color,
    checkSquare,
    captured,
    opening,
    makeMove,
    resign,
    declareDraw,
    legalTargets,
    needsPromotion,
    reset,
    loadFen,
    takeback,
  };
}

function hasMatingMaterial(game: RulesPosition, color: Color): boolean {
  const pieces = game
    .boardPieces()
    .filter((p) => p.color === color)
    .map((p) => p.type as string);
  if (pieces.some((p) => p === "q" || p === "r" || p === "p")) return true;
  const bishops = pieces.filter((p) => p === "b").length;
  const knights = pieces.filter((p) => p === "n").length;
  return bishops >= 2 || (bishops >= 1 && knights >= 1) || knights >= 3;
}
