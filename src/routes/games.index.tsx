import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bot, Trash2, Users } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { APP } from "@/config/app";
import {
  clearHistory,
  deleteGame,
  historyStats,
  outcomeLabel,
  useGameHistory,
  type SavedGame,
} from "@/lib/history";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/games/")({
  head: () => ({
    meta: [
      { title: `My games — ${APP.name}` },
      {
        name: "description",
        content:
          "Every game you finish on Nexus Chess is saved on your device: browse results, openings, accuracy and full move lists.",
      },
      { property: "og:title", content: `My games — ${APP.name}` },
      {
        property: "og:description",
        content: "Your saved chess games with results, openings and engine accuracy.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GamesPage,
});

type Filter = "all" | "ai" | "local";

function GamesPage() {
  const games = useGameHistory();
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(
    () => (filter === "all" ? games : games.filter((g) => g.mode === filter)),
    [games, filter],
  );
  const stats = useMemo(() => historyStats(games.filter((g) => g.mode === "ai")), [games]);

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">My games</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Saved on this device — {games.length} game{games.length === 1 ? "" : "s"} in your archive.
          </p>
        </div>
        {games.length > 0 && (
          <Button
            variant="outline"
            onClick={() => {
              if (window.confirm("Delete every saved game? This cannot be undone.")) clearHistory();
            }}
          >
            <Trash2 className="size-4" /> Clear archive
          </Button>
        )}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <Stat label="Total" value={String(games.length)} />
        <Stat label="Wins vs bots" value={String(stats.wins)} />
        <Stat label="Draws vs bots" value={String(stats.draws)} />
        <Stat label="Losses vs bots" value={String(stats.losses)} />
      </div>

      <div className="mt-5 flex gap-2">
        {(["all", "ai", "local"] as const).map((f) => (
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
            {f === "all" ? "All" : f === "ai" ? "Vs engine" : "Local"}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="panel mt-5 p-8 text-center">
          <p className="font-display text-lg font-semibold">No games saved yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Finish a game against the engine or a friend and it lands here automatically.
          </p>
          <Button asChild className="mt-4">
            <Link to="/play">Start playing</Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-5 space-y-2">
          {filtered.map((game) => (
            <GameRow key={game.id} game={game} />
          ))}
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

function GameRow({ game }: { game: SavedGame }) {
  const label = outcomeLabel(game);
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
          {game.white.name} <span className="text-muted-foreground">vs</span> {game.black.name}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {game.variantName} · {game.timeControl} · {game.moves.length} moves ·{" "}
          {game.opening ?? "Unknown opening"} · {new Date(game.playedAt).toLocaleString()}
        </p>
      </Link>
      {game.review && (
        <span className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
          <span className="block">Accuracy</span>
          <span className="tabular text-foreground">
            {game.review.accuracy.w} / {game.review.accuracy.b}
          </span>
        </span>
      )}
      <span className={cn("shrink-0 rounded px-2 py-1 text-xs font-semibold", tone)}>{label}</span>
      <button
        type="button"
        aria-label="Delete game"
        onClick={() => deleteGame(game.id)}
        className="shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:text-destructive"
      >
        <Trash2 className="size-4" />
      </button>
    </li>
  );
}
