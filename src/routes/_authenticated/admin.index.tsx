import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, ScrollText, KeyRound, ShieldAlert, ListChecks } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { AdminMfaGate } from "@/components/admin/AdminMfaGate";
import { Card, CardContent } from "@/components/ui/card";
import { APP } from "@/config/app";
import { useT } from "@/lib/i18n";
import { hasRole } from "@/lib/auth.functions";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: `Quản trị · ${APP.name}` },
      { name: "description", content: "Trung tâm quản trị Nine64: Fair Play, bảo mật, hệ thống." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: `Quản trị · ${APP.name}` },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminHubPage,
});

function AdminHubPage() {
  const { t } = useT();
  const roleFn = useServerFn(hasRole);
  const [admin, setAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setAdmin((await roleFn({ data: { role: "admin" } })) as boolean);
      } catch {
        setAdmin(false);
      }
    })();
  }, [roleFn]);

  if (admin === false) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md py-16 text-center text-muted-foreground">
          {t("admin.adminOnly")}
        </div>
      </AppShell>
    );
  }

  const sections = [
    {
      to: "/admin/fairplay",
      icon: ShieldCheck,
      title: t("admin.fairplay.title"),
      desc: t("admin.hub.fairplayDesc"),
    },
    {
      to: "/admin/fairplay/log",
      icon: ScrollText,
      title: t("admin.log.title"),
      desc: t("admin.hub.logDesc"),
    },
    {
      to: "/admin/audit",
      icon: ListChecks,
      title: t("admin.audit.title"),
      desc: t("admin.hub.auditDesc"),
    },
    {
      to: "/admin/security",
      icon: ShieldAlert,
      title: t("admin.security.title"),
      desc: t("admin.hub.securityDesc"),
    },
    {
      to: "/admin/system",
      icon: KeyRound,
      title: t("admin.system.title"),
      desc: t("admin.hub.systemDesc"),
    },
  ] as const;

  return (
    <AppShell wide>
      <AdminMfaGate>
        <div className="mx-auto max-w-4xl">
          <h1 className="text-2xl font-bold">{t("admin.hub.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("admin.hub.subtitle")}</p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {sections.map(({ to, icon: Icon, title, desc }) => (
              <Link key={to} to={to}>
                <Card className="h-full transition-colors hover:border-primary/50 hover:bg-accent/30">
                  <CardContent className="flex items-start gap-3 p-5">
                    <Icon className="mt-0.5 size-6 shrink-0 text-primary" />
                    <div>
                      <p className="font-semibold">{title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </AdminMfaGate>
    </AppShell>
  );
}
