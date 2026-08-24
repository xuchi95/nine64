import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Move } from "chess.js";
import type { VariantId } from "@/config/variants";
import { VARIANT_RULES } from "@/lib/chess/variants";
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

function toResult(game: Chess, variantId: VariantId, history: string[]): GameResult | null {
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
  const gameRef = useRef<Chess>(null as unknown as Chess);
  if (gameRef.current === null) {
    gameRef.current = new Chess();
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
    const rules = VARIANT_RULES[variant];
    const game = new Chess();
    try {
      game.load(rules.startingFen());
    } catch {
      game.reset();
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
    lowTimeFlag.current = { w: false, b: false };
    setClock({ w: timeControl?.initial ?? 0, b: timeControl?.initial ?? 0 });
  }, [variant, timeControl]);

  /** Load an arbitrary position (analysis board). Returns false on invalid FEN. */
  const loadFen = useCallback(
    (fenString: string): boolean => {
      const game = new Chess();
      try {
        game.load(fenString);
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
    [],
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
      let move: Move | null = null;
      try {
        move = game.move({ from, to, promotion: promotion ?? "q" });
      } catch {
        move = null;
      }
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

      const history = game.history();
      const r = toResult(game, variant, history);
      if (r) {
        playSound(r.winner === "draw" ? "draw" : "checkmate");
        finish(r);
      } else if (game.isCheck()) {
        playSound("check");
      } else if (move.flags.includes("p")) {
        playSound("promotion");
      } else if (move.flags.includes("k") || move.flags.includes("q")) {
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
      try {
        return gameRef.current
          .moves({ square: square as never, verbose: true })
          .map((m) => (m as Move).to as string);
      } catch {
        return [];
      }
    },
    [fen],
  );

  const needsPromotion = useCallback(
    (from: string, to: string) => {
      const piece = gameRef.current.get(from as never);
      if (!piece || piece.type !== "p") return false;
      return (piece.color === "w" && to[1] === "8") || (piece.color === "b" && to[1] === "1");
    },
    [fen],
  );

  const board = useMemo(() => {
    const game = gameRef.current;
    return game
      .board()
      .flat()
      .filter((sq): sq is NonNullable<typeof sq> => sq !== null)
      .map((sq) => ({ square: sq.square as string, type: sq.type, color: sq.color }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen]);

  const checkSquare = useMemo(() => {
    const game = gameRef.current;
    if (!game.isCheck()) return null;
    const turn = game.turn();
    for (const row of game.board()) {
      for (const sq of row) {
        if (sq && sq.type === "k" && sq.color === turn) return sq.square as string;
      }
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen]);

  const captured = useMemo(() => {
    const start = new Chess();
    try {
      start.load(VARIANT_RULES[variant].startingFen());
    } catch {
      start.reset();
    }
    const count = (g: Chess, color: Color) => {
      const map: Record<string, number> = {};
      g.board()
        .flat()
        .forEach((sq) => {
          if (sq && sq.color === color) map[sq.type] = (map[sq.type] ?? 0) + 1;
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
    game: gameRef,
    fen,
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
  };
}

function hasMatingMaterial(game: Chess, color: Color): boolean {
  const pieces = game
    .board()
    .flat()
    .filter((sq) => sq && sq.color === color)
    .map((sq) => sq!.type);
  if (pieces.some((p) => p === "q" || p === "r" || p === "p")) return true;
  const bishops = pieces.filter((p) => p === "b").length;
  const knights = pieces.filter((p) => p === "n").length;
  return bishops >= 2 || (bishops >= 1 && knights >= 1) || knights >= 3;
}
