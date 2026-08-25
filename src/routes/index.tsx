import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bot,
  LineChart,
  Globe,
  GraduationCap,
  Play,
  Users,
  Share2,
  BarChart3,
  ChevronRight,
  Swords,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { APP } from "@/config/app";
import { BOT_LEVELS, BOT_PERSONALITIES } from "@/config/bots";
import { VARIANTS } from "@/config/variants";
import { Button } from "@/components/ui/button";
import { GenericSkeleton } from "@/components/layout/PageSkeleton";
import { useBoardStyle } from "@/components/chess/useBoardStyle";
import { StaticBoard, START_PIECES } from "@/components/chess/StaticBoard";
import { pageHead } from "@/lib/seo";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () =>
    pageHead({
      path: "/",
      title: `${APP.name} — Chơi cờ vua online miễn phí`,
      description:
        "Nine64: chơi cờ với engine Stockfish, đấu online xếp hạng Glicko-2, phân tích từng nước đi và luyện tập theo lỗi của chính bạn.",
    }),
  pendingComponent: GenericSkeleton,
  component: Home,
});

function Home() {
  const { t } = useT();
  return (
    <AppShell>
      <div className="relative">
        {/* Architectural dot-grid: brass on graphite, sits behind everything */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-8 h-[320px] opacity-[0.18] [mask-image:linear-gradient(to_bottom,black,transparent)] sm:h-[560px]"
          style={{
            backgroundImage:
              "radial-gradient(var(--primary) 0.5px, transparent 0.5px)",
            backgroundSize: "24px 24px",
          }}
        />

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="relative grid items-center gap-10 py-6 md:grid-cols-[minmax(0,48%)_minmax(0,1fr)] lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:gap-16 lg:py-12">
          <div className="relative mx-auto w-full max-w-[min(520px,92vw)] md:mx-0">
            {/* Halo: a radial gradient instead of a blurred layer — no filter
                pass on mobile, and it never repaints while scrolling. */}
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-2 hidden md:block"
              style={{
                background:
                  "radial-gradient(closest-side, color-mix(in oklab, var(--primary) 22%, transparent), transparent 100%)",
              }}
            />
            {/* Square box reserved up-front so the board can never shift layout. */}
            <div className="relative aspect-square w-full">
              <StartBoard />
            </div>
            {/* Architect's corner brackets */}
            <span
              aria-hidden
              className="absolute -right-2 -top-2 size-10 border-r-2 border-t-2 border-primary/40"
            />
            <span
              aria-hidden
              className="absolute -bottom-2 -left-2 size-10 border-b-2 border-l-2 border-primary/40"
            />
          </div>

          <div className="min-w-0">
            <h1 className="font-display text-[clamp(2.15rem,7.5vw,2.75rem)] font-extrabold leading-[1.03] tracking-tight sm:text-[3.25rem] md:text-[2.75rem] lg:text-[3.5rem]">
              {t("play.home.title1")}
              <br />
              <span className="text-primary">{t("play.home.title2")}</span>
            </h1>
            <p className="mt-5 max-w-md text-sm text-muted-foreground sm:text-base">
              {t("play.home.subtitle", { n: BOT_LEVELS.length })}
            </p>


            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="h-14 rounded-sm px-8 font-display text-sm font-extrabold uppercase tracking-[0.16em] shadow-[4px_4px_0_color-mix(in_oklab,var(--primary)_45%,black)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_color-mix(in_oklab,var(--primary)_45%,black)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
              >
                <Link to="/play/ai" search={{ quick: true }}>
                  <Play className="size-5" />
                  {t("play.home.newGame")}
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-14 rounded-sm border-primary px-8 font-display text-sm font-extrabold uppercase tracking-[0.16em] text-primary hover:bg-primary/10"
              >
                <Link to="/online">
                  <Users className="size-5" />
                  {t("play.home.playOnline")}
                </Link>
              </Button>
            </div>

            <p className="mt-4 text-sm text-muted-foreground">
              <Link
                to="/play/ai"
                className="underline underline-offset-4 hover:text-primary"
              >
                {t("play.home.customSetup")}
              </Link>{" "}
              ·{" "}
              <Link
                to="/play/local"
                className="underline underline-offset-4 hover:text-primary"
              >
                {t("play.home.passAndPlay")}
              </Link>
            </p>
          </div>
        </section>

        {/* ── Stats rail ───────────────────────────────────────────────── */}
        <section className="relative mt-6 flex items-stretch justify-between border-y border-border bg-surface-2/60 px-2 py-5 sm:px-8">
          <Metric value={`${BOT_LEVELS.length}`} label={t("play.home.stat.botLevels")} />
          <span aria-hidden className="w-px bg-border" />
          <Metric
            value={`${BOT_PERSONALITIES.length}`.padStart(2, "0")}
            label={t("play.home.stat.personalities")}
          />
          <span aria-hidden className="w-px bg-border" />
          <Metric
            value={`${VARIANTS.length}`.padStart(2, "0")}
            label={t("play.home.stat.variants")}
          />
        </section>

        {/* ── Feature rules ────────────────────────────────────────────── */}
        <section className="relative mt-12 space-y-1 [contain-intrinsic-size:auto_460px] [content-visibility:auto]">
          <FeatureRule
            to="/play/ai"
            icon={<Bot className="size-5" />}
            title={t("play.home.feature.bots.title")}
            text={t("play.home.feature.bots.text", {
              personalities: BOT_PERSONALITIES.length,
              levels: BOT_LEVELS.length,
            })}
            accent
          />
          <FeatureRule
            to="/puzzles"
            icon={<GraduationCap className="size-5" />}
            title={t("play.home.feature.puzzles.title")}
            text={t("play.home.feature.puzzles.text")}
          />
          <FeatureRule
            to="/insights"
            icon={<LineChart className="size-5" />}
            title={t("play.home.feature.review.title")}
            text={t("play.home.feature.review.text")}
          />
          <FeatureRule
            to="/online"
            icon={<Globe className="size-5" />}
            title={t("play.home.feature.online.title")}
            text={t("play.home.feature.online.text")}
          />
        </section>

        {/* ── Mode grid ────────────────────────────────────────────────── */}
        <section className="relative mt-12 [contain-intrinsic-size:auto_220px] [content-visibility:auto]">
          <h2 className="font-mono text-2xs uppercase tracking-[0.28em] text-muted-foreground">
            {t("play.home.quickModes")}
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <ModeTile to="/play/local" icon={<Users className="size-6" />} title={t("play.home.mode.local")} />
            <ModeTile to="/play/share" icon={<Share2 className="size-6" />} title={t("play.home.mode.share")} />
            <ModeTile to="/analysis" icon={<BarChart3 className="size-6" />} title={t("play.home.mode.analysis")} />
            <ModeTile to="/games" icon={<LineChart className="size-6" />} title={t("play.home.mode.games")} />
          </div>
        </section>

        {/* ── Closing CTA ──────────────────────────────────────────────── */}
        <section className="relative mb-4 mt-12 overflow-hidden border border-border bg-surface-2/60 px-5 py-10 [contain-intrinsic-size:auto_320px] [content-visibility:auto] sm:px-10 sm:py-12">
          <span
            aria-hidden
            className="absolute left-0 top-0 h-full w-1 bg-primary"
          />
          <div className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-display text-[clamp(1.5rem,6vw,1.875rem)] font-extrabold tracking-tight sm:text-3xl">
                {t("play.home.closing.title")}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("play.home.closing.text", { tagline: APP.tagline })}
              </p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:flex-row md:w-auto">
              <Button
                asChild
                size="lg"
                className="h-13 rounded-sm px-8 font-display text-sm font-extrabold uppercase tracking-[0.16em] shadow-[4px_4px_0_color-mix(in_oklab,var(--primary)_45%,black)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_color-mix(in_oklab,var(--primary)_45%,black)]"
              >
                <Link to="/play/ai" search={{ quick: true }}>
                  <Swords className="size-5" />
                  {t("play.home.closing.newGame")}
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-13 rounded-sm border-primary px-8 font-display text-sm font-extrabold uppercase tracking-[0.16em] text-primary hover:bg-primary/10"
              >
                <Link to="/online">{t("play.home.closing.playOnline")}</Link>
              </Button>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex-1 text-center">
      <dd className="font-mono text-2xl font-bold tabular-nums text-foreground">
        {value}
      </dd>
      <dt className="mt-1 text-2xs font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
    </div>
  );
}

function FeatureRule({
  to,
  icon,
  title,
  text,
  accent,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  text: string;
  accent?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`group flex items-center gap-4 border-l-2 py-5 pl-5 pr-3 transition-colors hover:bg-surface-2/50 ${
        accent ? "border-primary" : "border-border hover:border-primary/60"
      }`}
    >
      <span className="flex size-11 shrink-0 items-center justify-center bg-primary/15 text-primary transition-colors group-hover:bg-primary/25">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-lg font-bold leading-snug">
          {title}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground sm:text-sm">
          {text}
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-primary" />
    </Link>
  );
}

function ModeTile({
  to,
  icon,
  title,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col items-center justify-center gap-2.5 border border-border bg-surface-2/50 p-5 text-center transition-colors hover:border-primary"
    >
      <span className="text-muted-foreground transition-colors group-hover:text-primary">
        {icon}
      </span>
      <span className="font-display text-2xs font-bold uppercase tracking-wider">
        {title}
      </span>
    </Link>
  );
}

/* ── Hero board: shares the real board surface via <StaticBoard /> ─────── */

function StartBoard() {
  const { boardThemeId, pieceSetId } = useBoardStyle();
  return (
    <StaticBoard
      pieces={START_PIECES}
      boardTheme={boardThemeId}
      pieceSet={pieceSetId}
      className="shadow-lg sm:shadow-2xl"
    />
  );
}
