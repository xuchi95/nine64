import { createFileRoute, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/AppShell";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { GameLayout, GameNotice, StatusPill } from "@/components/game/GameLayout";
import { GamePanel, StatRow } from "@/components/game/GamePanel";
import { PlayerCard } from "@/components/game/PlayerCard";
import { MoveJournal, buildJournalEntries } from "@/components/game/MoveJournal";
import { BoardSkeleton } from "@/components/layout/PageSkeleton";
import { APP } from "@/config/app";
import { useT } from "@/lib/i18n";
import { rulesFor, type RulesPosition } from "@/lib/chess/rules";
import type { VariantId } from "@/config/variants";
import { getSpectatorView, type SpectatorView } from "@/lib/online.challenges.functions";
import { parseTimeControl } from "@/lib/online/timeControl";
import { deriveDisplayClock } from "@/lib/online/clock";
import type { PieceColor } from "@/components/chess/Piece";
import type { GameMove } from "@/lib/database.types";

export const Route = createFileRoute("/_authenticated/watch/platform/$gameId")({
  head: () => ({
    meta: [
      { title: `Xem ván đấu — ${APP.name}` },
      { name: "description", content: "Chế độ khán giả chỉ đọc trên Nine64." },
    ],
  }),
  pendingComponent: BoardSkeleton,
  component: SpectatorPage,
});

/**
 * Read-only spectator board.
 *
 * The server decides what a spectator may see: private games are refused and a
 * broadcast delay hides recent moves and even the final result until the delay
 * has passed. There is no code path here that can submit a move.
 */
function SpectatorPage() {
  const { gameId } = useParams({ from: "/_authenticated/watch/$gameId" });
  const { t } = useT();
  const viewFn = useServerFn(getSpectatorView);
  const [view, setView] = useState<SpectatorView | null>(null);
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState({ w: 0, b: 0 });
  const positionRef = useRef<RulesPosition>(rulesFor("standard").createPosition());
  const [boardRev, setBoardRev] = useState(0);
  const clockBaseRef = useRef({ w: 0, b: 0, active: "w" as "w" | "b", elapsed: 0, at: 0, running: false });

  const refresh = useCallback(async () => {
    try {
      const res = (await viewFn({ data: { gameId } })) as SpectatorView;
      setView(res);
      if (res.game) {
        const rules = rulesFor((res.game.variant ?? "standard") as VariantId);
        try {
          positionRef.current = rules.createPosition(res.game.current_fen);
        } catch {
          positionRef.current = rules.createPosition();
        }
        const active = res.game.current_fen.split(" ")[1] === "b" ? "b" : "w";
        const running = res.game.status === "active" && res.game.clock_state === "running";
        const anchor = res.game.turn_started_at;
        const elapsed =
          running && anchor && res.server_now
            ? Math.max(0, Date.parse(res.server_now) - Date.parse(anchor))
            : 0;
        clockBaseRef.current = {
          w: res.game.white_time_ms,
          b: res.game.black_time_ms,
          active,
          elapsed,
          at: performance.now(),
          running,
        };
        setClock({
          w: active === "w" ? Math.max(0, res.game.white_time_ms - elapsed) : res.game.white_time_ms,
          b: active === "b" ? Math.max(0, res.game.black_time_ms - elapsed) : res.game.black_time_ms,
        });
        setBoardRev((v) => v + 1);
      }
    } finally {
      setLoading(false);
    }
  }, [gameId, viewFn]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const base = clockBaseRef.current;
      if (!base.running) return;
      const next = deriveDisplayClock(
        {
          whiteTimeMs: base.w,
          blackTimeMs: base.b,
          activeSide: base.active,
          elapsedAtSyncMs: base.elapsed,
          running: base.running,
        },
        performance.now() - base.at,
      );
      setClock({ w: next.w, b: next.b });
    }, 200);
    return () => window.clearInterval(id);
  }, [boardRev]);

  const pieces = useMemo(() => positionRef.current.boardPieces(), [boardRev]);
  const turn = useMemo(() => positionRef.current.turn() as PieceColor, [boardRev]);

  const journal = useMemo(() => {
    const g = view?.game;
    const spec = parseTimeControl(g?.time_control ?? "300+0");
    return buildJournalEntries((view?.moves ?? []) as unknown as GameMove[], {
      baseMs: spec.baseMs,
      incrementMs: spec.incMs,
    });
  }, [view]);

  if (loading) {
    return (
      <AppShell wide>
        <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
          {t("play.watch.loading")}
        </div>
      </AppShell>
    );
  }

  if (!view?.allowed || !view.game) {
    return (
      <AppShell wide>
        <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
          <p>{view?.code === "SPECTATE_DISABLED" ? t("play.watch.private") : t("play.watch.notFound")}</p>
        </div>
      </AppShell>
    );
  }

  const g = view.game;
  const live = g.status === "active";

  return (
    <AppShell wide>
      <GameLayout
        left={
          <>
            <PlayerCard
              player={{ name: g.black_name, subtitle: `Rating ${g.black_rating ?? "—"}`, color: "b" }}
              seconds={clock.b / 1000}
              active={turn === "b" && live}
              clockEnabled={g.pace !== "daily"}
              captured={[]}
            />
            <PlayerCard
              player={{ name: g.white_name, subtitle: `Rating ${g.white_rating ?? "—"}`, color: "w" }}
              seconds={clock.w / 1000}
              active={turn === "w" && live}
              clockEnabled={g.pace !== "daily"}
              captured={[]}
            />
            <GamePanel
              title={t("play.watch.title")}
              meta={<StatusPill tone={live ? "live" : "neutral"}>{live ? "Live" : g.result}</StatusPill>}
              bodyClassName="space-y-3.5 p-4"
            >
              <StatRow label={t("play.online.variant")} value={g.variant} />
              <StatRow
                label={t("play.online.timeControl")}
                value={parseTimeControl(g.time_control).label}
                mono
              />
              <StatRow label="Pool" value={g.pool} />
              {!live && <StatRow label="Result" value={`${g.end_reason ?? "—"} · ${g.result}`} />}
            </GamePanel>
            {view.delayed && (
              <GameNotice tone="info">
                {t("play.watch.delayNotice", { n: view.delay_seconds ?? 0 })}
              </GameNotice>
            )}
            <GameNotice tone="info">{t("play.watch.readOnly")}</GameNotice>
          </>
        }
        board={
          <ChessBoard
            pieces={pieces}
            orientation="w"
            legalTargets={() => []}
            canMoveFrom={() => false}
            onMove={() => false}
            needsPromotion={() => false}
            turn={turn}
            interactive={false}
          />
        }
        right={
          <GamePanel title={t("play.watch.moves")} className="max-h-[420px]" bodyClassName="overflow-hidden p-4">
            <MoveJournal entries={journal} statusLine={`${journal.length} ply`} />
          </GamePanel>
        }
      />
    </AppShell>
  );
}
