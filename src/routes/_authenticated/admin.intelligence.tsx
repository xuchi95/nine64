import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card, CardContent } from "@/components/ui/card";
import { APP } from "@/config/app";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/intelligence")({
  head: () => ({
    meta: [
      { title: `Trí tuệ AI · ${APP.name}` },
      { name: "description", content: "Quản trị prompt và phiên bản AI Coach của Nine64." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: `Trí tuệ AI · ${APP.name}` },
      { property: "og:description", content: "Quản trị prompt và phiên bản AI Coach của Nine64." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminIntelligencePage,
});

function AdminIntelligencePage() {
  const { t } = useT();
  return (
    <AdminShell module="intelligence" title={t("adminc.intel.title")}>
      <h1 className="text-2xl font-bold">{t("adminc.intel.title")}</h1>
      <Card className="mt-4">
        <CardContent className="p-5 text-sm text-muted-foreground">{t("adminc.intel.soon")}</CardContent>
      </Card>
    </AdminShell>
  );
}
