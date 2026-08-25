import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { Flag, Handshake, RefreshCw, FlipVertical2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { MoveList } from "@/components/game/MoveList";
import { GamePanel, StatRow } from "@/components/game/GamePanel";
import { GameLayout, GameActions, StatusPill } from "@/components/game/GameLayout";
import { PlayerCard } from "@/components/game/PlayerCard";
import { ResultModal } from "@/components/game/ResultModal";
import { TimeControlPicker } from "@/components/game/TimeControlPicker";
import { Button } from "@/components/ui/button";
import { APP, type TimeControl } from "@/config/app";
import { VARIANTS, type VariantId, variantName, variantBlurb } from "@/config/variants";
import { useChessGame, type Color } from "@/hooks/useChessGame";
import { playSound } from "@/lib/sound";
import { useSettings } from "@/lib/settings";
import { saveGame } from "@/lib/history";
import { detectOpening } from "@/lib/chess/openings";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BoardSkeleton } from "@/components/layout/PageSkeleton";
import { pageHead } from "@/lib/seo";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/play/local")({
  head: () =>
    pageHead({
      path: "/play/local",
      title: `Chơi 2 người trên một máy — ${APP.name}`,
      description:
        "Cờ vua pass-and-play trên cùng một thiết bị: đồng hồ thật, xoay bàn cờ và đầy đủ luật FIDE.",
    }),
  pendingComponent: BoardSkeleton,
  component: LocalGame,
});

function LocalGame() {
  const { t } = useT();
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
        variantName: variantName(variant),
        timeControl: timeControl?.label ?? t("play.local.standard"),
        startFen: snapshot.startFen,
        finalFen: snapshot.finalFen,
        moves: snapshot.moves,
        result: r,
        playerColor: null,
        white: { name: t("play.local.white"), subtitle: t("play.local.localPlayer") },
        black: { name: t("play.local.black"), subtitle: t("play.local.localPlayer") },
        opening: detectOpening(snapshot.moves.map((m) => m.san))?.name ?? null,
      });
      toast.success(t("play.local.gameSaved"), {
        action: {
          label: t("play.local.viewAction"),
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
        <h1 className="text-2xl font-bold">{t("play.local.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("play.local.subtitle")}</p>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="panel p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t("play.local.variant")}
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
                  <span className="font-medium">{variantName(v.id)}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{variantBlurb(v.id)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <div className="panel p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {t("play.local.timeControl")}
              </h2>
              <TimeControlPicker value={timeControl} onChange={setTimeControl} />
            </div>
            <label className="panel flex items-center justify-between p-4 text-sm">
              <span>{t("play.local.autoFlip")}</span>
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
              {t("play.local.startGame")}
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  const boardOrientation: Color = autoFlip ? game.turn : orientation;

  return (
    <AppShell wide>
      <GameLayout
        left={
          <>
          <PlayerCard
            player={{ name: t("play.local.black"), subtitle: t("play.local.localPlayer"), color: "b" }}
            seconds={game.clock.b}
            active={game.turn === "b" && !game.result}
            clockEnabled={!!timeControl}
            captured={game.captured.w}
          />
          <PlayerCard
            player={{ name: t("play.local.white"), subtitle: t("play.local.localPlayer"), color: "w" }}
            seconds={game.clock.w}
            active={game.turn === "w" && !game.result}
            clockEnabled={!!timeControl}
            captured={game.captured.b}
          />
          <GamePanel
            title={t("play.local.gameStatus")}
            meta={
              <StatusPill tone={game.result ? "neutral" : "live"}>
                {game.result ? t("play.local.finished") : t("play.local.live")}
              </StatusPill>
            }
            bodyClassName="space-y-3.5 p-4"
          >
            <StatRow label={t("play.local.variantLabel")} value={variant ? variantName(variant) : t("play.local.standard")} />
            <StatRow label={t("play.local.openingLabel")} value={game.opening?.name ?? "—"} />
            <StatRow label={t("play.local.movesLabel")} value={String(game.moves.length)} mono />
          </GamePanel>
          </>
        }
        board={
            <ChessBoard
              pieces={game.board}
              orientation={boardOrientation}
              legalTargets={game.legalTargets}
              canMoveFrom={canMoveFrom}
              onMove={(from, to, promo) => game.makeMove(from, to, promo)}
              needsPromotion={game.needsPromotion}
              lastMove={game.lastMove}
              checkSquare={game.checkSquare}
              checkmate={game.result?.reason === "Checkmate"}
              interactive={!game.result}
              turn={game.turn}
            />
        }
        right={
          <>
          <GamePanel
            title={t("play.local.notation")}
            meta={game.moves.length > 0 ? t("play.local.move", { n: Math.ceil(game.moves.length / 2) }) : undefined}
            className="max-h-[420px]"
            bodyClassName="overflow-hidden"
          >
            <MoveList moves={game.moves} />
          </GamePanel>
          <GameActions>
            <Button
              variant="outline"
              disabled={!!game.result}
              onClick={() => {
                if (!settings.confirmResign || window.confirm(t("play.local.resignConfirm", { color: game.turn === "w" ? t("play.local.white") : t("play.local.black") }))) {
                  game.resign(game.turn);
                }
              }}
            >
              <Flag className="size-4" /> {t("play.local.resign")}
            </Button>
            <Button variant="outline" disabled={!!game.result} onClick={() => game.declareDraw()}>
              <Handshake className="size-4" /> {t("play.local.draw")}
            </Button>
            <Button
              variant="outline"
              onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))}
              disabled={autoFlip}
            >
              <FlipVertical2 className="size-4" /> {t("play.local.flip")}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                game.reset();
                setShowResult(false);
              }}
            >
              <RefreshCw className="size-4" /> {t("play.local.restart")}
            </Button>
          </GameActions>
          </>
        }
      />

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
