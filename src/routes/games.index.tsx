import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bot, Globe, Users } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { APP } from "@/config/app";
import {
  historyStats,

  outcomeLabel,
  useGameHistory,
  type SavedGame,
} from "@/lib/history";
import { useOnlineGames, type OnlineGameDetail } from "@/hooks/useOnlineGames";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { ListSkeleton } from "@/components/layout/PageSkeleton";
import { BoardThemePicker } from "@/components/chess/BoardThemePicker";
import { pageHead } from "@/lib/seo";
import { useT } from "@/lib/i18n";


export const Route = createFileRoute("/games/")({
  head: () =>
    pageHead({
      path: "/games",
      title: `Ván đấu của tôi — ${APP.name}`,
      description:
        "Mọi ván bạn hoàn thành trên Nine64 đều được lưu: kết quả, khai cuộc, độ chính xác và toàn bộ danh sách nước đi.",
    }),
  pendingComponent: ListSkeleton,
  component: GamesPage,
});

type Filter = "all" | "ai" | "local" | "online";
type ListItem =
  | { kind: "local"; game: SavedGame }
  | { kind: "online"; game: OnlineGameDetail };

function GamesPage() {
  const { t } = useT();
  const { user } = useAuth();
  const localGames = useGameHistory();
  const { games: onlineGames, loading: onlineLoading } = useOnlineGames();
  const [filter, setFilter] = useState<Filter>("all");

  const items: ListItem[] = useMemo(() => {
    const localItems: ListItem[] = localGames.map((g) => ({ kind: "local", game: g }));
    const onlineItems: ListItem[] = onlineGames.map((g) => ({ kind: "online", game: g as OnlineGameDetail }));
    const gameDate = (item: ListItem) =>
      new Date(item.kind === "local" ? item.game.playedAt : item.game.created_at).getTime();
    const all = [...localItems, ...onlineItems].sort((a, b) => gameDate(b) - gameDate(a));
    if (filter === "all") return all;
    return all.filter((item) =>
      filter === "online"
        ? item.kind === "online"
        : item.kind === "local" && item.game.mode === filter,
    );
  }, [localGames, onlineGames, filter]);

  const stats = useMemo(() => historyStats(localGames.filter((g) => g.mode === "ai")), [localGames]);

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("play.games.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("play.games.subtitleCount", { n: items.length })}{" "}
            {user ? t("play.games.syncedNote") : t("play.games.localOnlyNote")}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">{t("play.games.archiveNote")}</p>
      </div>


      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <Stat label={t("play.games.statTotal")} value={String(items.length)} />
        <Stat label={t("play.games.statWins")} value={String(stats.wins)} />
        <Stat label={t("play.games.statDraws")} value={String(stats.draws)} />
        <Stat label={t("play.games.statLosses")} value={String(stats.losses)} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {(["all", "ai", "local", "online"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm transition-colors",
              filter === f
                ? "border-primary/60 bg-primary/15"
                : "border-border bg-surface-2 hover:border-primary/40",
            )}
          >
            {f === "all"
              ? t("play.games.filterAll")
              : f === "ai"
                ? t("play.games.filterAi")
                : f === "local"
                  ? t("play.games.filterLocal")
                  : t("play.games.filterOnline")}
          </button>
        ))}
      </div>

      <BoardThemePicker className="mt-5" />

      {onlineLoading && (
        <p className="mt-4 text-sm text-muted-foreground">{t("play.games.loadingOnline")}</p>
      )}

      {items.length === 0 && !onlineLoading ? (
        <div className="panel mt-5 p-8 text-center">
          <p className="font-display text-lg font-semibold">{t("play.games.emptyTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("play.games.emptyText")}
          </p>
          <Button asChild className="mt-4">
            <Link to="/play">{t("play.games.startPlaying")}</Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-5 space-y-2">
          {items.map((item) =>
            item.kind === "local" ? (
              <LocalGameRow key={item.game.id} game={item.game} />
            ) : (
              <OnlineGameRow key={item.game.id} game={item.game} />
            ),
          )}
        </ul>
      )}
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tabular">{value}</p>
    </div>
  );
}

function LocalGameRow({ game }: { game: SavedGame }) {
  const { t } = useT();
  const moveCount = Array.isArray(game.moves) ? game.moves.length : 0;
  const label = outcomeLabel(game);
  const labelText =
    label === "Win"
      ? t("play.games.win")
      : label === "Loss"
        ? t("play.games.loss")
        : label === "Draw"
          ? t("play.games.draw")
          : t("play.games.inProgress");
  const tone =
    label === "Win"
      ? "bg-primary/20 text-primary"
      : label === "Loss"
        ? "bg-destructive/20 text-destructive"
        : "bg-secondary text-muted-foreground";

  return (
    <li className="panel flex items-center gap-3 p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted-foreground">
        {game.mode === "ai" ? <Bot className="size-4" /> : <Users className="size-4" />}
      </span>
      <Link to="/games/$gameId" params={{ gameId: game.id }} className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {game.white.name} <span className="text-muted-foreground">{t("play.games.vsBadge")}</span> {game.black.name}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {game.variantName} · {game.timeControl} · {t("play.games.movesCount", { n: moveCount })} ·{" "}
          {game.opening ?? t("play.games.unknownOpening")} · {new Date(game.playedAt).toLocaleString()}
        </p>
      </Link>
      {game.review && (
        <span className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
          <span className="block">{t("play.games.accuracy")}</span>
          <span className="tabular text-foreground">
            {game.review.accuracy.w} / {game.review.accuracy.b}
          </span>
        </span>
      )}
      <span className={cn("shrink-0 rounded px-2 py-1 text-xs font-semibold", tone)}>{labelText}</span>
    </li>
  );
}


function OnlineGameRow({ game }: { game: OnlineGameDetail }) {
  const { t } = useT();
  const { user } = useAuth();
  const isWhite = game.white_id === user?.id;
  const opponentId = isWhite ? game.black_id : game.white_id;
  const moveCount = Array.isArray(game.moves) ? game.moves.length : 0;
  const opponentName = t("play.games.opponentName", { id: opponentId.slice(0, 6) });
  const myName = user?.email?.split("@")[0] ?? t("play.games.you");
  const whiteName = isWhite ? myName : opponentName;
  const blackName = isWhite ? opponentName : myName;

  let label = t("play.games.inProgress");
  let tone = "bg-secondary text-muted-foreground";
  if (game.status === "completed") {
    if (game.result === "1/2-1/2") {
      label = t("play.games.draw");
    } else if ((game.result === "1-0" && isWhite) || (game.result === "0-1" && !isWhite)) {
      label = t("play.games.win");
      tone = "bg-primary/20 text-primary";
    } else {
      label = t("play.games.loss");
      tone = "bg-destructive/20 text-destructive";
    }
  }

  return (
    <li className="panel flex items-center gap-3 p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted-foreground">
        <Globe className="size-4" />
      </span>
      <Link to="/games/online/$gameId" params={{ gameId: game.id }} className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {whiteName} <span className="text-muted-foreground">{t("play.games.vsBadge")}</span> {blackName}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {game.variant} · {game.time_control} · {t("play.games.movesCount", { n: moveCount })} ·{" "}
          {new Date(game.created_at).toLocaleString()}
        </p>
      </Link>
      <span className={cn("shrink-0 rounded px-2 py-1 text-xs font-semibold", tone)}>{label}</span>
    </li>
  );
}
