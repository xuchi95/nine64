import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card, CardContent } from "@/components/ui/card";
import { APP } from "@/config/app";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({
    meta: [
      { title: `Quản lý người dùng · ${APP.name}` },
      { name: "description", content: "Khu vực quản trị người dùng Nine64." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: `Quản lý người dùng · ${APP.name}` },
      { property: "og:description", content: "Khu vực quản trị người dùng Nine64." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const { t } = useT();
  return (
    <AdminShell module="users" title={t("adminc.users.title")}>
      <h1 className="text-2xl font-bold">{t("adminc.users.title")}</h1>
      <Card className="mt-4">
        <CardContent className="p-5 text-sm text-muted-foreground">{t("adminc.users.soon")}</CardContent>
      </Card>
    </AdminShell>
  );
}
