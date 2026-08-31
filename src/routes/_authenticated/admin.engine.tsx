import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card, CardContent } from "@/components/ui/card";
import { APP } from "@/config/app";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/engine")({
  head: () => ({
    meta: [
      { title: `Máy cờ · ${APP.name}` },
      { name: "description", content: "Quản trị hồ sơ máy cờ và benchmark của Nine64." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: `Máy cờ · ${APP.name}` },
      { property: "og:description", content: "Quản trị hồ sơ máy cờ và benchmark của Nine64." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminEnginePage,
});

function AdminEnginePage() {
  const { t } = useT();
  return (
    <AdminShell module="engine" title={t("adminc.engine.title")}>
      <h1 className="text-2xl font-bold">{t("adminc.engine.title")}</h1>
      <Card className="mt-4">
        <CardContent className="p-5 text-sm text-muted-foreground">{t("adminc.engine.soon")}</CardContent>
      </Card>
    </AdminShell>
  );
}
