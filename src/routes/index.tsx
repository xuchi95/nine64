import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bot,
  Target,
  LineChart,
  Globe,
  GraduationCap,
  Play,
  Users,
  Link2,
  Share2,
  BarChart3,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { APP } from "@/config/app";
import { BOT_LEVELS, BOT_PERSONALITIES } from "@/config/bots";
import { VARIANTS } from "@/config/variants";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${APP.name} — Play Chess Online, Free` },
      { name: "description", content: APP.description },
      { property: "og:title", content: `${APP.name} — Play Chess Online, Free` },
      { property: "og:description", content: APP.description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <TooltipProvider delayDuration={200}>
      <AppShell>
      {/* ── Hero: board left, promise right (chess.com rhythm, brass palette) ── */}
      <section className="grid items-center gap-8 py-6 md:grid-cols-[minmax(0,46%)_minmax(0,1fr)] md:gap-10 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-16 lg:py-12">
        <div className="mx-auto w-full max-w-[min(420px,88vw)] md:mx-0">
          <StartBoard />
        </div>

        <div className="min-w-0 text-center md:text-left">
          <h1 className="font-display text-[clamp(1.9rem,7vw,2.25rem)] font-bold leading-[1.05] tracking-tight sm:text-5xl md:text-4xl lg:text-5xl">
            Play Chess Online
            <br />
            <span className="text-primary">on a board built to win.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm text-muted-foreground sm:text-base md:mx-0">
            Stockfish 18 in your browser, {BOT_LEVELS.length} bot levels, ranked online games and a
            review that actually teaches you.
          </p>
          <div className="mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center md:justify-start">
            <Button asChild size="lg" className="h-14 px-8 text-base font-semibold sm:px-10">
              <Link to="/play/ai" search={{ quick: true }}>
                <Play className="size-5" />
                New game
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className="h-14 px-8 text-base">
              <Link to="/online">
                <Users className="size-5" />
                Play online
              </Link>
            </Button>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            <Link to="/play/ai" className="underline underline-offset-4 hover:text-primary">
              Custom setup
            </Link>{" "}
            ·{" "}
            <Link to="/play/local" className="underline underline-offset-4 hover:text-primary">
              Pass &amp; play
            </Link>
          </p>

          <dl className="mt-8 flex flex-wrap justify-center gap-x-8 gap-y-4 md:justify-start lg:mt-9">
            <Metric value={`${BOT_LEVELS.length}`} label="Bot levels" />
            <Metric value={`${BOT_PERSONALITIES.length}`} label="Personalities" />
            <Metric value={`${VARIANTS.length}`} label="Variants" />
          </dl>
        </div>
      </section>


      {/* ── Feature rows, alternating like chess.com's home scroll ── */}
      <FeatureRow
        icon={<Bot className="size-4" />}
        title="Play Chess Bots"
        text={`Face ${BOT_PERSONALITIES.length} personalities across ${BOT_LEVELS.length} strength tiers — each one thinks with human-like pacing.`}
        cta="Challenge a bot"
        to="/play/ai"
        visual={<BotsVisual />}
      />

      <FeatureRow
        reverse
        icon={<GraduationCap className="size-4" />}
        title="Improve With Your Own Puzzles"
        text="Every review turns your real mistakes into trainable positions, scheduled by spaced repetition."
        cta="Solve a puzzle"
        to="/puzzles"
        visual={<TilesVisual />}
      />

      <FeatureRow
        icon={<LineChart className="size-4" />}
        title="Review Every Move"
        text="Brilliant, great, blunder — plus eval curve, accuracy, tactical motifs and phase-by-phase weakness."
        cta="Open insights"
        to="/insights"
        visual={<EvalVisual />}
      />

      <FeatureRow
        reverse
        icon={<Globe className="size-4" />}
        title="Ranked Online Matches"
        text="Glicko-2 rating, priority matchmaking and realtime clocks with a fallback sync that never desyncs the board."
        cta="Find a match"
        to="/online"
        visual={<OnlineVisual />}
      />

      {/* ── Quick modes strip: icon + sparkline, text in tooltip ── */}
      <section className="mt-12 grid grid-cols-2 gap-3 md:grid-cols-4 lg:mt-14">
        <ModeTile to="/play/local" icon={<Users className="size-5" />} title="Local" tooltip="Pass &amp; play on one device">
          <LocalSparkline />
        </ModeTile>
        <ModeTile to="/play/share" icon={<Share2 className="size-5" />} title="Share" tooltip="Sync moves turn-by-turn via link">
          <ShareSparkline />
        </ModeTile>
        <ModeTile to="/analysis" icon={<BarChart3 className="size-5" />} title="Analysis" tooltip="Free board with engine eval">
          <AnalysisSparkline />
        </ModeTile>
        <ModeTile to="/games" icon={<LineChart className="size-5" />} title="Games" tooltip="Review your archived games">
          <GamesSparkline />
        </ModeTile>
      </section>

      {/* ── Closing CTA ── */}
      <section className="panel mt-12 mb-4 overflow-hidden px-4 py-10 text-center sm:px-8 sm:py-12 lg:mt-14 lg:px-12">
        <div className="mx-auto max-w-xl">
          <h2 className="font-display text-[clamp(1.5rem,6vw,1.875rem)] font-bold tracking-tight sm:text-3xl">Your next game is one click away</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            No download. Offline-ready board. {APP.tagline}
          </p>
          <div className="mt-7 flex flex-col items-stretch justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-13 px-8 text-base font-semibold sm:px-10">
              <Link to="/play/ai" search={{ quick: true }}>
                <Play className="size-5" />
                New game
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className="h-13 px-8 text-base">
              <Link to="/online">Play online</Link>
            </Button>
          </div>

        </div>
      </section>
    </AppShell>
    </TooltipProvider>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dd className="font-mono text-2xl font-bold text-primary">{value}</dd>
      <dt className="mt-0.5 text-[11px] uppercase tracking-widest text-muted-foreground">{label}</dt>
    </div>
  );
}

function FeatureRow({
  icon,
  title,
  text,
  cta,
  to,
  visual,
  reverse,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  cta: string;
  to: string;
  visual: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <section className="grid items-center gap-8 border-t border-border py-10 md:grid-cols-2 md:gap-10 md:py-12 lg:gap-16 lg:py-16">
      <div className={`min-w-0 ${reverse ? "md:order-2" : ""}`}>
        <h2 className="font-display text-[clamp(1.55rem,6vw,1.875rem)] font-bold leading-tight tracking-tight sm:text-3xl lg:text-[2.1rem]">
          {title}
        </h2>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">{text}</p>
        <Button asChild variant="secondary" size="lg" className="mt-6">
          <Link to={to}>
            <span className="text-primary">{icon}</span>
            {cta}
          </Link>
        </Button>
      </div>
      <div className={`flex min-w-0 justify-center ${reverse ? "md:order-1" : ""}`}>{visual}</div>
    </section>
  );
}

function ModeTile({
  to,
  icon,
  title,
  tooltip,
  children,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  tooltip: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={to}
          className="panel group flex flex-col items-center gap-3 p-4 text-center transition-colors hover:border-primary/50"
        >
          <span className="flex size-11 items-center justify-center rounded-full bg-primary/15 text-primary transition-colors group-hover:bg-primary/25">
            {icon}
          </span>
          <span className="font-display text-sm font-semibold">{title}</span>
          <div className="h-10 w-full">{children}</div>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p dangerouslySetInnerHTML={{ __html: tooltip }} />
      </TooltipContent>
    </Tooltip>
  );
}

function LocalSparkline() {
  return (
    <div className="flex h-full items-end justify-center gap-1">
      <div className="w-2 rounded-t bg-primary/40" style={{ height: "45%" }} />
      <div className="w-2 rounded-t bg-primary" style={{ height: "70%" }} />
      <div className="w-2 rounded-t bg-primary/40" style={{ height: "45%" }} />
    </div>
  );
}

function ShareSparkline() {
  return (
    <div className="flex h-full items-center justify-center gap-0.5">
      {Array.from({ length: 8 }, (_, i) => (
        <div
          key={i}
          className={`w-1 rounded-full ${i % 2 === 0 ? "bg-primary" : "bg-primary/25"}`}
          style={{ height: `${30 + (i % 3) * 22}%` }}
        />
      ))}
    </div>
  );
}

function AnalysisSparkline() {
  const points = [20, 45, 35, 60, 55, 80, 70, 90];
  const path = points
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i / (points.length - 1)) * 100},${100 - v}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
      <path d={`${path} L100,100 L0,100 Z`} fill="var(--primary)" opacity="0.14" />
      <path d={path} fill="none" stroke="var(--primary)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function GamesSparkline() {
  return (
    <div className="flex h-full items-center justify-center gap-1">
      <div className="h-3 w-3 rounded-sm bg-primary" />
      <div className="h-5 w-3 rounded-sm bg-primary/60" />
      <div className="h-2 w-3 rounded-sm bg-primary/30" />
      <div className="h-4 w-3 rounded-sm bg-primary/80" />
    </div>
  );
}

/* ── Visuals: pure CSS/unicode so the homepage stays instant ─────────────── */

const BACK_RANK = ["♜", "♞", "♝", "♛", "♚", "♝", "♞", "♜"];

function StartBoard() {
  return (
    <div className="overflow-hidden rounded-xl border border-border shadow-2xl">
      <div className="grid grid-cols-8">
        {Array.from({ length: 64 }, (_, i) => {
          const rank = i >> 3;
          const file = i % 8;
          const dark = (rank + file) % 2 === 1;
          const piece =
            rank === 0 || rank === 7 ? BACK_RANK[file]! : rank === 1 || rank === 6 ? "♟" : null;
          const isWhitePiece = rank >= 6;
          return (
            <div
              key={i}
              className={`flex aspect-square items-center justify-center text-[clamp(1.2rem,4.2vw,2.15rem)] leading-none ${
                dark ? "bg-primary/45" : "bg-primary/15"
              } ${isWhitePiece ? "text-foreground [text-shadow:0_1px_2px_var(--background)]" : "text-background"}`}
            >
              {piece}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BotsVisual() {
  const faces = BOT_PERSONALITIES.slice(0, 6);
  return (
    <div className="grid w-full max-w-sm grid-cols-3 gap-2 sm:gap-3">
      {faces.map((p, i) => (
        <div
          key={p.id}
          className={`panel flex aspect-square flex-col items-center justify-center gap-1.5 p-2 text-center ${
            i === 1 ? "border-primary/70 shadow-[0_0_0_1px_var(--primary)]" : ""
          }`}
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-primary/15 font-display text-lg font-bold text-primary">
            {p.name[0]}
          </span>
          <span className="text-[11px] font-semibold">{p.name}</span>
          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            lvl {(i + 2) * 2}
          </span>
        </div>
      ))}
    </div>
  );
}

function TilesVisual() {
  const tiles = ["♟", "♞", "♝", "♜", "♛", "♚"];
  return (
    <div className="grid w-full max-w-[18rem] grid-cols-3 gap-2 sm:max-w-sm sm:gap-3 [perspective:900px]">
      {tiles.map((t, i) => (
        <div
          key={t}
          className={`flex aspect-square items-center justify-center rounded-xl border text-4xl transition-transform [transform:rotateX(48deg)_rotateZ(-42deg)] ${
            i === 2
              ? "border-primary bg-primary/25 text-primary shadow-[0_0_24px_-4px_var(--primary)]"
              : "border-border bg-surface-2 text-foreground/70"
          }`}
        >
          {t}
        </div>
      ))}
    </div>
  );
}

function EvalVisual() {
  const points = [50, 54, 48, 61, 58, 72, 66, 84, 78, 91, 70, 88];
  const path = points
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i / (points.length - 1)) * 100},${100 - v}`)
    .join(" ");
  return (
    <div className="panel w-full max-w-md p-4 sm:p-5">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-widest text-muted-foreground">
        <span>Eval curve</span>
        <span className="font-mono text-primary">92% accuracy</span>
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="mt-3 h-32 w-full">
        <line x1="0" y1="50" x2="100" y2="50" stroke="currentColor" strokeWidth="0.4" className="text-border" />
        <path d={`${path} L100,100 L0,100 Z`} fill="var(--primary)" opacity="0.14" />
        <path d={path} fill="none" stroke="var(--primary)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-3 flex flex-wrap gap-2">
        {[
          ["Brilliant", "bg-primary/20 text-primary"],
          ["Great", "bg-surface-2 text-foreground"],
          ["Blunder", "bg-destructive/20 text-destructive"],
        ].map(([label, cls]) => (
          <span key={label} className={`rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${cls}`}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function OnlineVisual() {
  return (
    <div className="panel w-full max-w-md p-4 sm:p-5">
      {[
        { name: "You", rating: 1842, clock: "4:58", active: true },
        { name: "Opponent", rating: 1867, clock: "5:00", active: false },
      ].map((p) => (
        <div
          key={p.name}
          className={`flex items-center gap-3 rounded-lg border p-3 ${
            p.active ? "border-primary/60 bg-primary/10" : "border-border bg-surface-2"
          } ${p.name === "Opponent" ? "mt-3" : ""}`}
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-primary/15 font-display font-bold text-primary">
            {p.name[0]}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{p.name}</span>
            <span className="block font-mono text-[11px] text-muted-foreground">{p.rating} · Glicko-2</span>
          </span>
          <span className="ml-auto font-mono text-xl font-bold tabular-nums">{p.clock}</span>
        </div>
      ))}
      <div className="mt-4 flex items-center justify-between rounded-lg border border-border px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        <span>Realtime</span>
        <span className="flex items-center gap-2 text-primary">
          <span className="size-2 animate-pulse rounded-full bg-primary" /> connected
        </span>
      </div>
    </div>
  );
}
