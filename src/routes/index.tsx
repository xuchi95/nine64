import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, Users, LineChart, ArrowRight, Swords, Link2 } from "lucide-react";
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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:description", content: APP.description },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <AppShell>
      {/* Hero */}
      <section className="panel relative overflow-hidden">
        <div className="grid items-stretch gap-0 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="px-6 py-14 sm:px-12 sm:py-20">
            <p className="font-mono text-[11px] uppercase tracking-[0.4em] text-primary">
              {APP.tagline}
            </p>
            <h1 className="mt-5 text-5xl font-bold leading-[0.95] tracking-tight sm:text-6xl">
              Chess, at
              <br />
              engine level.
            </h1>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/play/ai">
                  Play now <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link to="/play">All modes</Link>
              </Button>
            </div>

            <dl className="mt-12 grid max-w-md grid-cols-3 gap-6 border-t border-border pt-6">
              <Metric value={String(BOT_LEVELS.length)} label="Levels" />
              <Metric value={String(VARIANTS.length)} label="Variants" />
              <Metric value="18" label="Stockfish" />
            </dl>
          </div>

          <div className="relative hidden items-center justify-center overflow-hidden border-l border-border bg-surface-2 lg:flex">
            <BoardGlyph />
          </div>
        </div>
      </section>

      {/* Modes */}
      <section className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ModeCard to="/play/ai" icon={<Bot className="size-5" />} title="Play AI" meta="15 levels" />
        <ModeCard to="/play/local" icon={<Users className="size-5" />} title="Local" meta="Pass & play" />
        <ModeCard to="/analysis" icon={<LineChart className="size-5" />} title="Analysis" meta="Engine eval" />
        <ModeCard to="/play/share" icon={<Link2 className="size-5" />} title="Share link" meta="Turn by turn" />
      </section>

      {/* Variants */}
      <section className="panel mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 px-6 py-5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Swords className="size-4 text-primary" />
          Variants
        </div>
        <div className="flex flex-wrap gap-2">
          {VARIANTS.map((v) => (
            <span
              key={v.id}
              className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-muted-foreground"
            >
              {v.name}
            </span>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-display text-3xl font-bold text-primary">{value}</dd>
    </div>
  );
}

function ModeCard({
  to,
  icon,
  title,
  meta,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  meta: string;
}) {
  return (
    <Link
      to={to}
      className="panel group flex items-center gap-4 p-5 transition-colors hover:border-primary/50"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="block font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          {meta}
        </span>
      </span>
      <ArrowRight className="ml-auto size-4 shrink-0 text-primary opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

function BoardGlyph() {
  const squares = Array.from({ length: 64 }, (_, i) => i);
  return (
    <div className="relative aspect-square w-[78%] max-w-[420px] rotate-[-8deg] overflow-hidden rounded-xl border border-border shadow-2xl">
      <div className="grid h-full w-full grid-cols-8">
        {squares.map((i) => {
          const dark = ((i >> 3) + (i % 8)) % 2 === 1;
          return (
            <div
              key={i}
              className={dark ? "bg-primary/10" : "bg-surface-1"}
            />
          );
        })}
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-background/70 via-transparent to-primary/10" />
    </div>
  );
}
