import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { Chess, type Move } from "chess.js";
import { AppShell } from "@/components/layout/AppShell";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { APP } from "@/config/app";
import { playSound } from "@/lib/sound";
import type { PieceColor } from "@/components/chess/Piece";
import { MoveJournal, type JournalEntry } from "@/components/game/MoveJournal";
import { buildPgn, decodeShare, encodeShare, parsePgn, replayMoves, shareUrl } from "@/lib/chess/share";
import { normalizeResult, resultLabel } from "@/lib/chess/gameResult";
import { Copy, Link2, RotateCcw, FlipVertical2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BoardSkeleton } from "@/components/layout/PageSkeleton";

export const Route = createFileRoute("/play/share")({
  validateSearch: (search: Record<string, unknown>): { g?: string } => {
    const g = typeof search["g"] === "string" ? (search["g"] as string) : undefined;
    return g ? { g } : {};
  },
  head: () => ({
    meta: [
      { title: `Share a game by link — ${APP.name}` },
      {
        name: "description",
        content:
          "Play chess turn by turn across two devices: every move produces a PGN and a share link you send to your opponent.",
      },
      { property: "og:title", content: `Share a game by link — ${APP.name}` },
      {
        property: "og:description",
        content: "Correspondence chess without a server: sync moves via PGN or a share URL.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  pendingComponent: BoardSkeleton,
  component: SharePage,
});

function SharePage() {
  const { g } = Route.useSearch();
  const navigate = useNavigate({ from: "/play/share" });

  const payload = useMemo(() => (g ? decodeShare(g) : null), [g]);
  const startFen = payload?.startFen;
  const [pgnInput, setPgnInput] = useState("");
  const [flipped, setFlipped] = useState(false);

  const { chess, applied } = useMemo(
    () => replayMoves(payload?.moves ?? [], startFen),
    [payload?.moves, startFen],
  );

  const turn = chess.turn() as PieceColor;
  const orientation: PieceColor = flipped ? (turn === "w" ? "b" : "w") : turn;

  const gameOver = chess.isGameOver();
  const result = useMemo(() => {
    if (!gameOver) return null;
    if (chess.isCheckmate()) {
      const winner = chess.turn() === "w" ? "0-1" : "1-0";
      return normalizeResult({ result: winner, end_reason: "Checkmate" });
    }
    return normalizeResult({
      result: "1/2-1/2",
      end_reason: chess.isStalemate() ? "Stalemate" : "Draw",
    });
  }, [chess, gameOver]);
  const resultView = resultLabel(result, null);

  const pushMoves = useCallback(
    (moves: string[], nextTurn: "w" | "b") => {
      const token = encodeShare({
        moves,
        turnFor: nextTurn,
        ...(startFen ? { startFen } : {}),
      });
      void navigate({ search: { g: token }, replace: false });
    },
    [navigate, startFen],
  );

  const handleMove = useCallback(
    (from: string, to: string, promotion?: "q" | "r" | "b" | "n") => {
      if (gameOver) return false;
      const probe = new Chess();
      if (startFen) {
        try {
          probe.load(startFen);
        } catch {
          probe.reset();
        }
      }
      for (const san of applied) {
        try {
          probe.move(san);
        } catch {
          break;
        }
      }
      let move: Move | null = null;
      try {
        move = probe.move({ from, to, promotion: promotion ?? "q" });
      } catch {
        move = null;
      }
      if (!move) {
        playSound("illegal");
        return false;
      }
      playMoveSound(probe, move);
      pushMoves([...applied, move.san], probe.turn() as "w" | "b");
      return true;
    },
    [applied, gameOver, pushMoves, startFen],
  );

  const canMoveFrom = useCallback(
    (square: string) => {
      if (gameOver) return false;
      const piece = chess.get(square as never);
      return piece?.color === chess.turn();
    },
    [chess, gameOver],
  );

  const legalTargets = useCallback(
    (square: string) => {
      try {
        return chess
          .moves({ square: square as never, verbose: true })
          .map((m) => (m as Move).to as string);
      } catch {
        return [];
      }
    },
    [chess],
  );

  const needsPromotion = useCallback(
    (from: string, to: string) => {
      const piece = chess.get(from as never);
      if (!piece || piece.type !== "p") return false;
      return (piece.color === "w" && to[1] === "8") || (piece.color === "b" && to[1] === "1");
    },
    [chess],
  );

  const pieces = useMemo(
    () =>
      chess
        .board()
        .flat()
        .filter((sq): sq is NonNullable<typeof sq> => sq !== null)
        .map((sq) => ({
          square: sq.square as string,
          type: sq.type,
          color: sq.color as PieceColor,
        })),
    [chess],
  );

  const checkSquare = useMemo(() => {
    if (!chess.isCheck()) return null;
    for (const row of chess.board()) {
      for (const sq of row) {
        if (sq && sq.type === "k" && sq.color === chess.turn()) return sq.square as string;
      }
    }
    return null;
  }, [chess]);

  const lastMove = useMemo(() => {
    const history = chess.history({ verbose: true }) as Move[];
    const last = history[history.length - 1];
    return last ? { from: last.from, to: last.to } : null;
  }, [chess]);

  const entries: JournalEntry[] = useMemo(
    () =>
      applied.map((san, i) => ({
        ply: i + 1,
        san,
        color: i % 2 === 0 ? ("w" as const) : ("b" as const),
      })),
    [applied],
  );

  const pgn = useMemo(
    () =>
      buildPgn(applied, {
        event: "Nexus Chess link match",
        white: payload?.white ?? "White",
        black: payload?.black ?? "Black",
        result: result?.code ?? "*",
        ...(startFen ? { startFen } : {}),
      }),
    [applied, payload?.black, payload?.white, result, startFen],
  );

  const link = useMemo(
    () =>
      shareUrl({
        moves: applied,
        turnFor: turn,
        ...(startFen ? { startFen } : {}),
      }),
    [applied, startFen, turn],
  );

  const copy = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Clipboard unavailable");
    }
  }, []);

  const importPgn = useCallback(() => {
    const parsed = parsePgn(pgnInput);
    if (parsed.moves.length === 0) {
      toast.error("No moves found in that PGN");
      return;
    }
    const replayed = replayMoves(parsed.moves, parsed.startFen);
    if (replayed.applied.length === 0) {
      toast.error("PGN could not be replayed");
      return;
    }
    const token = encodeShare({
      moves: replayed.applied,
      turnFor: replayed.chess.turn() as "w" | "b",
      ...(parsed.startFen ? { startFen: parsed.startFen } : {}),
    });
    void navigate({ search: { g: token } });
    setPgnInput("");
    toast.success(`Loaded ${replayed.applied.length} moves`);
  }, [navigate, pgnInput]);

  const reset = useCallback(() => {
    void navigate({ search: {} });
  }, [navigate]);

  const statusLine = gameOver
    ? `${resultView.title} — ${result?.reason ?? "finished"} (${result?.code ?? "*"})`
    : `${turn === "w" ? "White" : "Black"} to move · ply ${applied.length + 1} · manual sync`;

  return (
    <AppShell wide>
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_340px]">
        <div>
          <div className="mb-2 flex items-center justify-between rounded-md border border-border/70 bg-surface-1 px-3 py-2 text-sm">
            <span className="font-medium">
              {gameOver ? resultView.title : `${turn === "w" ? "White" : "Black"} to move`}
            </span>
            <span
              className={cn(
                "rounded px-2 py-0.5 text-xs font-medium",
                gameOver ? "bg-muted text-muted-foreground" : "bg-amber-500/15 text-amber-400",
              )}
            >
              Manual sync
            </span>
          </div>
          <ChessBoard
            pieces={pieces}
            orientation={orientation}
            legalTargets={legalTargets}
            canMoveFrom={canMoveFrom}
            onMove={handleMove}
            needsPromotion={needsPromotion}
            lastMove={lastMove}
            checkSquare={checkSquare}
            turn={turn}
            interactive={!gameOver}
          />
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" size="sm" className="gap-2" onClick={() => setFlipped((f) => !f)}>
              <FlipVertical2 className="size-4" />
              Flip board
            </Button>
            <Button variant="ghost" size="sm" className="gap-2" onClick={reset}>
              <RotateCcw className="size-4" />
              New game
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <Card className="space-y-2 p-4">
            <h3 className="text-sm font-semibold">Turn-by-turn link</h3>
            <p className="text-xs text-muted-foreground">
              Play your move, then send this link. Your opponent opens it, plays their reply and
              sends the new link back — no server needed.
            </p>
            <div className="break-all rounded bg-surface-2/60 p-2 font-mono text-[11px] text-muted-foreground">
              {link}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 gap-2"
                onClick={() => void copy(link, "Share link")}
              >
                <Link2 className="size-4" />
                Copy link
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="flex-1 gap-2"
                onClick={() => void copy(pgn, "PGN")}
              >
                <Copy className="size-4" />
                Copy PGN
              </Button>
            </div>
          </Card>

          <Card className="p-4">
            <MoveJournal entries={entries} statusLine={statusLine} />
          </Card>

          <Card className="space-y-2 p-4">
            <h3 className="text-sm font-semibold">Load a PGN</h3>
            <Textarea
              value={pgnInput}
              onChange={(e) => setPgnInput(e.target.value)}
              placeholder="Paste PGN or a move list (1. e4 e5 2. Nf3 …)"
              className="min-h-[110px] font-mono text-xs"
            />
            <Button size="sm" className="w-full" onClick={importPgn}>
              Load moves
            </Button>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function playMoveSound(game: Chess, move: Move) {
  if (game.isCheck()) playSound("check");
  else if (move.flags.includes("p")) playSound("promotion");
  else if (move.flags.includes("k") || move.flags.includes("q")) playSound("castle");
  else if (move.captured) playSound("capture");
  else playSound("move");
}
