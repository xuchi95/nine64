import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, Users, LineChart, Swords, Globe, Trophy, Link2, GraduationCap } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { APP } from "@/config/app";
import { GenericSkeleton } from "@/components/layout/PageSkeleton";
import { pageHead } from "@/lib/seo";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/play/")({
  head: () =>
    pageHead({
      path: "/play",
      title: `Chơi cờ — ${APP.name}`,
      description:
        "Chọn cách chơi trên Nine64: đấu engine Stockfish 15 mức, chơi 2 người trên một máy, biến thể cờ hoặc bàn phân tích.",
    }),
  pendingComponent: GenericSkeleton,
  component: PlayHub,
});

const AVAILABLE = [
  {
    to: "/play/ai",
    icon: Bot,
    titleKey: "play.hub.card.ai.title",
    textKey: "play.hub.card.ai.text",
  },
  {
    to: "/play/coach",
    icon: GraduationCap,
    titleKey: "play.hub.card.coach.title",
    textKey: "play.hub.card.coach.text",
  },
  {
    to: "/play/local",
    icon: Users,
    titleKey: "play.hub.card.local.title",
    textKey: "play.hub.card.local.text",
  },
  {
    to: "/online",
    icon: Globe,
    titleKey: "play.hub.card.online.title",
    textKey: "play.hub.card.online.text",
  },
  {
    to: "/play/share",
    icon: Link2,
    titleKey: "play.hub.card.share.title",
    textKey: "play.hub.card.share.text",
  },
  {
    to: "/play/variants",
    icon: Swords,
    titleKey: "play.hub.card.variants.title",
    textKey: "play.hub.card.variants.text",
  },

  {
    to: "/tournaments",
    icon: Trophy,
    titleKey: "tourney.title",
    textKey: "tourney.subtitle",
  },
  {
    to: "/analysis",
    icon: LineChart,
    titleKey: "play.hub.card.analysis.title",
    textKey: "play.hub.card.analysis.text",
  },
] as const;

function PlayHub() {
  const { t } = useT();
  return (
    <AppShell>
      <h1 className="text-2xl font-bold">{t("play.hub.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("play.hub.subtitle")}</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {AVAILABLE.map((card) => (
          <Link
            key={card.titleKey}
            to={card.to}
            className="panel flex items-start gap-4 p-5 transition-colors hover:border-primary/50"
          >
            <span className="flex size-10 items-center justify-center rounded-md bg-primary/15 text-primary">
              <card.icon className="size-5" />
            </span>
            <span>
              <span className="block font-semibold">{t(card.titleKey)}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{t(card.textKey)}</span>
            </span>
          </Link>
        ))}
      </div>

    </AppShell>
  );
}
