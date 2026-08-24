import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { Flag, Handshake, RefreshCw, FlipVertical2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { MoveList } from "@/components/game/MoveList";
import { PlayerCard } from "@/components/game/PlayerCard";
import { ResultModal } from "@/components/game/ResultModal";
import { TimeControlPicker } from "@/components/game/TimeControlPicker";
import { Button } from "@/components/ui/button";
import { APP, type TimeControl } from "@/config/app";
import { VARIANTS, type VariantId } from "@/config/variants";
import { useChessGame, type Color } from "@/hooks/useChessGame";
import { playSound } from "@/lib/sound";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/play/local")({
  head: () => ({
    meta: [
      { title: `Local two player — ${APP.name}` },
      {
        name: "description",
        content:
          "Pass-and-play chess on a single device with real clocks, board flipping and full rule validation.",
      },
      { property: "og:title", content: `Local two player — ${APP.name}` },
      {
        property: "og:description",
        content: "Two players, one board, complete FIDE rules and clocks.",
      },
    ],
  }),
  component: LocalGame,
});

function LocalGame() {
  const navigate = useNavigate();
  const settings = useSettings();
  const [variant, setVariant] = useState<VariantId>("standard");
  const [timeControl, setTimeControl] = useState<TimeControl | null>(null);
  const [phase, setPhase] = useState<"setup" | "playing">("setup");
  const [orientation, setOrientation] = useState<Color>("w");
  const [autoFlip, setAutoFlip] = useState(false);
  const [showResult, setShowResult] = useState(false);

  const game = useChessGame({
    variant,
    timeControl,
    onGameEnd: (r, snapshot) => {
      setShowResult(true);
      playSound(r.winner === "draw" ? "draw" : "victory");
      if (snapshot.moves.length === 0) return;
      const saved = saveGame({
        mode: "local",
        variant,
        variantName: VARIANTS.find((v) => v.id === variant)?.name ?? variant,
        timeControl: timeControl?.label ?? "Unlimited",
        startFen: snapshot.startFen,
        finalFen: snapshot.finalFen,
        moves: snapshot.moves,
        result: r,
        playerColor: null,
        white: { name: "White", subtitle: "Local player" },
        black: { name: "Black", subtitle: "Local player" },
        opening: detectOpening(snapshot.moves.map((m) => m.san))?.name ?? null,
      });
      toast.success("Game saved to your archive", {
        action: {
          label: "View",
          onClick: () => void navigate({ to: "/games/$gameId", params: { gameId: saved.id } }),
        },
      });
    },
  });

  const canMoveFrom = useCallback(
    (square: string) => {
      if (game.result) return false;
      const piece = game.game.current.get(square as never);
      return !!piece && piece.color === game.turn;
    },
    [game],
  );

  if (phase === "setup") {
    return (
      <AppShell>
        <h1 className="text-2xl font-bold">Local two player</h1>
        <p className="mt-1 text-sm text-muted-foreground">Share one device and take turns.</p>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="panel p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Variant
            </h2>
            <div className="mt-3 grid gap-2">
              {VARIANTS.filter((v) => v.enabled).map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVariant(v.id)}
                  className={cn(
                    "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    variant === v.id
                      ? "border-primary/60 bg-primary/10"
                      : "border-border bg-surface-2 hover:border-primary/40",
                  )}
                >
                  <span className="font-medium">{v.name}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{v.blurb}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <div className="panel p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Time control
              </h2>
              <TimeControlPicker value={timeControl} onChange={setTimeControl} />
            </div>
            <label className="panel flex items-center justify-between p-4 text-sm">
              <span>Flip board automatically each turn</span>
              <input
                type="checkbox"
                checked={autoFlip}
                onChange={(e) => setAutoFlip(e.target.checked)}
                className="size-4 accent-[var(--color-primary)]"
              />
            </label>
            <Button
              size="lg"
              className="w-full"
              onClick={() => {
                game.reset();
                setPhase("playing");
              }}
            >
              Start game
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  const boardOrientation: Color = autoFlip ? game.turn : orientation;

  return (
    <AppShell wide>
      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)_320px]">
        <div className="order-2 space-y-3 lg:order-1">
          <PlayerCard
            player={{ name: "Black", subtitle: "Local player", color: "b" }}
            seconds={game.clock.b}
            active={game.turn === "b" && !game.result}
            clockEnabled={!!timeControl}
            captured={game.captured.w}
          />
          <PlayerCard
            player={{ name: "White", subtitle: "Local player", color: "w" }}
            seconds={game.clock.w}
            active={game.turn === "w" && !game.result}
            clockEnabled={!!timeControl}
            captured={game.captured.b}
          />
          <div className="panel p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Opening</span>
              <span className="truncate font-medium">{game.opening?.name ?? "—"}</span>
            </div>
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <div className="mx-auto w-full max-w-[720px]">
            <ChessBoard
              pieces={game.board}
              orientation={boardOrientation}
              legalTargets={game.legalTargets}
              canMoveFrom={canMoveFrom}
              onMove={(from, to, promo) => game.makeMove(from, to, promo)}
              needsPromotion={game.needsPromotion}
              lastMove={game.lastMove}
              checkSquare={game.checkSquare}
              interactive={!game.result}
              turn={game.turn}
            />
          </div>
        </div>

        <div className="order-3 space-y-3">
          <div className="panel flex max-h-[420px] flex-col overflow-hidden">
            <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Moves
            </div>
            <MoveList moves={game.moves} />
          </div>
          <div className="panel grid grid-cols-2 gap-2 p-3">
            <Button
              variant="secondary"
              disabled={!!game.result}
              onClick={() => {
                if (!settings.confirmResign || window.confirm(`Resign as ${game.turn === "w" ? "White" : "Black"}?`)) {
                  game.resign(game.turn);
                }
              }}
            >
              <Flag className="size-4" /> Resign
            </Button>
            <Button variant="secondary" disabled={!!game.result} onClick={() => game.declareDraw()}>
              <Handshake className="size-4" /> Draw
            </Button>
            <Button
              variant="outline"
              onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))}
              disabled={autoFlip}
            >
              <FlipVertical2 className="size-4" /> Flip
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                game.reset();
                setShowResult(false);
              }}
            >
              <RefreshCw className="size-4" /> Restart
            </Button>
          </div>
        </div>
      </div>

      <ResultModal
        result={game.result}
        playerColor={null}
        open={showResult}
        onOpenChange={setShowResult}
        onRematch={() => {
          game.reset();
          setShowResult(false);
        }}
        onNewGame={() => {
          setShowResult(false);
          setPhase("setup");
        }}
        onAnalyse={() => navigate({ to: "/analysis", search: { fen: game.fen } })}
      />
    </AppShell>
  );
}
