import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, Users, LineChart, Swords, Globe, Trophy } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { APP } from "@/config/app";

export const Route = createFileRoute("/play/")({
  head: () => ({
    meta: [
      { title: `Play — ${APP.name}` },
      {
        name: "description",
        content:
          "Choose how to play: Stockfish engine levels, local two-player, variants, or the analysis board.",
      },
      { property: "og:title", content: `Play — ${APP.name}` },
      {
        property: "og:description",
        content: "Engine matches, local play and variants on the Nexus Chess board.",
      },
    ],
  }),
  component: PlayHub,
});

const AVAILABLE = [
  {
    to: "/play/ai",
    icon: Bot,
    title: "Play AI",
    text: "15 levels, 7 personalities, human-like pacing.",
  },
  {
    to: "/play/local",
    icon: Users,
    title: "Local game",
    text: "Two players, one device, real clocks.",
  },
  {
    to: "/online",
    icon: Globe,
    title: "Online & ranked",
    text: "Realtime matchmaking with Elo rating.",
  },
  {
    to: "/play/ai",
    icon: Swords,
    title: "Variants",
    text: "Chess960, Three-Check, King of the Hill and more.",
  },
  {
    to: "/analysis",
    icon: LineChart,
    title: "Analysis board",
    text: "Free board with engine evaluation on demand.",
  },
] as const;

const SOON = [{ icon: Trophy, title: "Tournaments", text: "Arenas, brackets and leaderboards." }] as const;

function PlayHub() {
  return (
    <AppShell>
      <h1 className="text-2xl font-bold">Play</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Everything below is live and fully playable offline.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {AVAILABLE.map((card) => (
          <Link
            key={card.title}
            to={card.to}
            className="panel flex items-start gap-4 p-5 transition-colors hover:border-primary/50"
          >
            <span className="flex size-10 items-center justify-center rounded-md bg-primary/15 text-primary">
              <card.icon className="size-5" />
            </span>
            <span>
              <span className="block font-semibold">{card.title}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{card.text}</span>
            </span>
          </Link>
        ))}
      </div>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Coming soon
      </h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {SOON.map((card) => (
          <div key={card.title} className="panel flex items-start gap-4 p-5 opacity-60">
            <span className="flex size-10 items-center justify-center rounded-md bg-secondary text-muted-foreground">
              <card.icon className="size-5" />
            </span>
            <span>
              <span className="flex items-center gap-2 font-semibold">
                {card.title}
                <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  Soon
                </span>
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">{card.text}</span>
            </span>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
