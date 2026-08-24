import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, Users, Swords, LineChart, ArrowRight } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { APP } from "@/config/app";
import { BOT_LEVELS } from "@/config/bots";
import { VARIANTS } from "@/config/variants";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${APP.name} — Premium 2D Chess Platform` },
      { name: "description", content: APP.description },
      { property: "og:title", content: `${APP.name} — Premium 2D Chess Platform` },
      { property: "og:description", content: APP.description },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <AppShell>
      <section className="panel relative overflow-hidden px-6 py-12 sm:px-10 sm:py-16">
        <div className="relative z-10 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            {APP.tagline}
          </p>
          <h1 className="mt-3 text-4xl font-bold sm:text-5xl">
            Play chess against a real engine.
          </h1>
          <p className="mt-4 text-muted-foreground">
            {APP.name} runs Stockfish in your browser — fifteen calibrated levels from Beginner up to
            Engine Max, human-like thinking time, seven bot personalities, and a board built for
            60&nbsp;FPS input.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/play/ai">
                Play the engine <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link to="/play/local">Local two player</Link>
            </Button>
          </div>
        </div>
        <div
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 opacity-[0.07] lg:block"
          style={{
            backgroundImage:
              "repeating-conic-gradient(currentColor 0% 25%, transparent 0% 50%)",
            backgroundSize: "96px 96px",
          }}
        />
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Engine levels" value={String(BOT_LEVELS.length)} hint="Beginner → Engine Max" />
        <Stat label="Variants" value={String(VARIANTS.length)} hint="Standard, 960, KotH…" />
        <Stat label="Board themes" value="6" hint="Walnut, Green, Midnight…" />
        <Stat label="Piece sets" value="5" hint="Vector, crisp at any size" />
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <ModeCard
          to="/play/ai"
          icon={<Bot className="size-5" />}
          title="Play AI"
          text="Stockfish 18 WASM in a web worker, with personalities and realistic thinking time."
        />
        <ModeCard
          to="/play/local"
          icon={<Users className="size-5" />}
          title="Local two player"
          text="Pass-and-play on one device with full clock support and board flipping."
        />
        <ModeCard
          to="/analysis"
          icon={<LineChart className="size-5" />}
          title="Analysis board"
          text="Set up any position, step through moves and query the engine for the best line."
        />
      </section>

      <section className="panel mt-6 p-6">
        <div className="flex items-center gap-2">
          <Swords className="size-4 text-primary" />
          <h2 className="text-lg font-semibold">Variants</h2>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {VARIANTS.map((v) => (
            <div key={v.id} className="rounded-md border border-border bg-surface-2 p-3">
              <p className="text-sm font-semibold">{v.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{v.blurb}</p>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="panel p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-primary">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function ModeCard({
  to,
  icon,
  title,
  text,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <Link
      to={to}
      className="panel group flex flex-col p-5 transition-colors hover:border-primary/50"
    >
      <span className="flex size-9 items-center justify-center rounded-md bg-primary/15 text-primary">
        {icon}
      </span>
      <span className="mt-3 font-semibold">{title}</span>
      <span className="mt-1 text-sm text-muted-foreground">{text}</span>
      <span className="mt-4 inline-flex items-center gap-1 text-sm text-primary opacity-0 transition-opacity group-hover:opacity-100">
        Open <ArrowRight className="size-3.5" />
      </span>
    </Link>
  );
}
