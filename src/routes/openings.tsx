import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/AppShell";
import { DashboardSkeleton } from "@/components/layout/PageSkeleton";
import { Button } from "@/components/ui/button";
import { ExplorerTab } from "@/components/openings/ExplorerTab";
import { RepertoireTab, type RepertoireData } from "@/components/openings/RepertoireTab";
import { PracticeTab } from "@/components/openings/PracticeTab";
import { PerformanceTab } from "@/components/openings/PerformanceTab";
import { listRepertoires } from "@/lib/openings/repertoire.functions";
import { APP } from "@/config/app";
import { pageHead } from "@/lib/seo";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/openings")({
  head: () =>
    pageHead({
      path: "/openings",
      title: `Opening Lab — ${APP.name}`,
      description:
        "Duyệt cơ sở dữ liệu khai cuộc, xây bộ khai cuộc riêng, luyện nhớ theo lịch lặp lại ngắt quãng và soi rò rỉ điểm số từ các ván đã chơi.",
    }),
  pendingComponent: DashboardSkeleton,
  component: OpeningLab,
});

type TabKey = "explorer" | "repertoire" | "practice" | "performance";

const TABS: TabKey[] = ["explorer", "repertoire", "practice", "performance"];

function OpeningLab() {
  const { t } = useT();
  const { user } = useAuth();
  const signedIn = Boolean(user);
  const [tab, setTab] = useState<TabKey>("explorer");
  const [data, setData] = useState<RepertoireData | null>(null);
  const listFn = useServerFn(listRepertoires);

  const reload = useCallback(() => {
    if (!signedIn) {
      setData(null);
      return;
    }
    void listFn({})
      .then((res) => setData({ repertoires: res.repertoires, lines: res.lines }))
      .catch(() => setData(null));
  }, [listFn, signedIn]);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">{t("lab.title")}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t("lab.subtitle")}</p>
        </header>

        <nav className="flex flex-wrap gap-2" aria-label={t("lab.title")}>
          {TABS.map((key) => (
            <Button
              key={key}
              size="sm"
              variant={tab === key ? "default" : "outline"}
              onClick={() => setTab(key)}
            >
              {t(`lab.tab.${key}`)}
            </Button>
          ))}
        </nav>

        {tab === "explorer" ? <ExplorerTab signedIn={signedIn} /> : null}
        {tab === "repertoire" ? (
          <RepertoireTab signedIn={signedIn} data={data} onReload={reload} />
        ) : null}
        {tab === "practice" ? <PracticeTab signedIn={signedIn} /> : null}
        {tab === "performance" ? <PerformanceTab repertoireLines={data?.lines ?? []} /> : null}
      </div>
    </AppShell>
  );
}
