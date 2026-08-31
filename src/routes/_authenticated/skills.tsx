import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Brain, ArrowRight } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { APP } from "@/config/app";
import { useT } from "@/lib/i18n";
import { pageHead } from "@/lib/seo";
import { getSkillGraph, resetSkillGraph } from "@/lib/skills.functions";
import { buildSkillGraph, focusSkills, type SkillNode } from "@/lib/skills/graph";
import { PRACTICE_ROUTE, skillMeta, type SkillCategory } from "@/lib/skills/catalog";

export const Route = createFileRoute("/_authenticated/skills")({
  head: () =>
    pageHead({
      path: "/skills",
      title: `Bản đồ kỹ năng — ${APP.name}`,
      description:
        "Theo dõi điểm mạnh và điểm yếu cờ vua của bạn: kỹ năng được nhận diện tự động từ dữ liệu engine trong các ván đã phân tích.",
    }),
  component: SkillsPage,
});

const CATEGORY_ORDER: SkillCategory[] = [
  "fundamentals",
  "opening",
  "tactics",
  "strategy",
  "endgame",
  "calculation",
  "time_management",
];

function SkillsPage() {
  const { t, locale } = useT();
  const fetchGraph = useServerFn(getSkillGraph);
  const reset = useServerFn(resetSkillGraph);
  const [resetDone, setResetDone] = useState(false);

  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["skill-graph"],
    queryFn: () => fetchGraph(),
  });

  const nodes = useMemo(() => buildSkillGraph(data?.rows ?? []), [data]);
  const focus = useMemo(() => focusSkills(nodes), [nodes]);
  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of data?.definitions ?? []) {
      map.set(d.key, locale === "en" ? d.name_en : d.name_vi);
    }
    return map;
  }, [data, locale]);

  const label = (node: SkillNode) => names.get(node.skillKey) ?? node.skillKey;

  return (
    <AppShell wide>
      <div className="flex items-center gap-2">
        <Brain className="size-5 text-primary" aria-hidden />
        <h1 className="font-display text-2xl font-bold">{t("skills.title")}</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{t("skills.subtitle")}</p>

      {error && <p className="mt-4 text-sm text-destructive">{t("skills.loadError")}</p>}
      {isLoading && <p className="mt-4 text-sm text-muted-foreground">…</p>}

      {focus.length > 0 && (
        <section className="panel mt-4 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {t("skills.focus")}
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
            {focus.map((node) => (
              <li key={node.skillKey} className="rounded-md bg-surface-2 p-3">
                <p className="font-semibold">{label(node)}</p>
                <p className="text-xs text-muted-foreground">
                  {t("skills.successRate", { n: node.successRate })}
                </p>
                <Button asChild variant="link" size="sm" className="mt-1 h-auto px-0">
                  <Link to={PRACTICE_ROUTE[skillMeta(node.skillKey).practice]}>
                    {t("skills.practice")} <ArrowRight className="size-3" />
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {CATEGORY_ORDER.map((category) => {
          const rows = nodes.filter((n) => n.category === category);
          if (rows.length === 0) return null;
          return (
            <section key={category} className="panel p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {t(`skills.category.${category}`)}
              </h2>
              <ul className="mt-3 space-y-2">
                {rows.map((node) => (
                  <li key={node.skillKey} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{label(node)}</span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{t("skills.level", { n: node.level })}</span>
                      <span className="rounded bg-surface-2 px-2 py-0.5 font-medium">
                        {t(`skills.status.${node.status}`)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {nodes.every((n) => n.status === "unseen") && !isLoading && (
        <p className="mt-4 text-sm text-muted-foreground">{t("skills.empty")}</p>
      )}

      <section className="panel mt-4 p-4">
        <p className="text-sm font-semibold">{t("skills.reset")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("skills.resetDesc")}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={async () => {
            await reset();
            setResetDone(true);
            void refetch();
          }}
        >
          {t("skills.reset")}
        </Button>
        {resetDone && <p className="mt-2 text-sm">{t("skills.resetDone")}</p>}
      </section>
    </AppShell>
  );
}
