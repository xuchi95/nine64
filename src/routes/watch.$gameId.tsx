import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/AppShell";
import { BoardSkeleton } from "@/components/layout/PageSkeleton";
import { BroadcastBoard } from "@/components/watch/BroadcastBoard";
import { APP } from "@/config/app";
import { pageHead } from "@/lib/seo";
import { useT } from "@/lib/i18n";
import { getBroadcastGame } from "@/lib/watch/watch.functions";
import type { BroadcastGameDetail } from "@/lib/watch/types";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/watch/$gameId")({
  loader: ({ params }) => getBroadcastGame({ data: { gameId: params.gameId } }),
  head: ({ loaderData }) => {
    if (!loaderData) {
      return pageHead({
        path: "/watch",
        title: `Không tìm thấy ván đấu — ${APP.name}`,
        description: "Ván tường thuật này không tồn tại hoặc chưa được xuất bản.",
        noindex: true,
      });
    }
    const g = loaderData;
    const title = `${g.whiteName} — ${g.blackName} · ${g.eventName} | ${APP.name}`;
    return pageHead({
      path: `/watch/${g.id}`,
      title: title.slice(0, 110),
      description: `Theo dõi trực tiếp ván ${g.whiteName} vs ${g.blackName} tại ${g.eventName}${
        g.roundNumber ? `, vòng ${g.roundNumber}` : ""
      }. Bàn cờ realtime, danh sách nước đi và phân tích engine.`.slice(0, 158),
      type: "article",
    });
  },
  pendingComponent: BoardSkeleton,
  errorComponent: () => <NotFoundView />,
  notFoundComponent: () => <NotFoundView />,
  component: BroadcastGamePage,
});

function NotFoundView() {
  const { t } = useT();
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl py-16 text-center">
        <p className="text-muted-foreground">{t("wc.board.notFound")}</p>
        <Link to="/watch" className="mt-3 inline-block font-semibold text-brass underline">
          {t("wc.hub.title")}
        </Link>
      </div>
    </AppShell>
  );
}

function BroadcastGamePage() {
  const { gameId } = Route.useParams();
  const initial = Route.useLoaderData() as BroadcastGameDetail | null;
  const [game, setGame] = useState<BroadcastGameDetail | null>(initial);
  const fetchFn = useServerFn(getBroadcastGame);

  const refresh = useCallback(async () => {
    try {
      const next = (await fetchFn({ data: { gameId } })) as BroadcastGameDetail | null;
      if (next) setGame(next);
    } catch {
      // Non-fatal; realtime/interval retries.
    }
  }, [fetchFn, gameId]);

  useEffect(() => {
    const channel = supabase
      .channel(`watch:game:${gameId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "event_games", filter: `id=eq.${gameId}` },
        () => {
          void refresh();
        },
      )
      .subscribe();
    const id = window.setInterval(() => void refresh(), 15000);
    return () => {
      window.clearInterval(id);
      void supabase.removeChannel(channel);
    };
  }, [gameId, refresh]);

  if (!game) return <NotFoundView />;

  return (
    <AppShell wide>
      <div className="mx-auto max-w-6xl space-y-4">
        <h1 className="text-2xl font-bold">
          {game.whiteName} — {game.blackName}
        </h1>
        <BroadcastBoard game={game} />
      </div>
    </AppShell>
  );
}
