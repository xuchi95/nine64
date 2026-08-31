import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Trophy,
  LayoutDashboard,
  Users,
  KeyRound,
  Cpu,
  Sparkles,
  Puzzle,
  BookOpen,
  GraduationCap,
  ShieldCheck,
  ScrollText,
  ListChecks,
  ShieldAlert,
  Menu,
  ArrowLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { BrandLogo } from "@/components/layout/BrandLogo";
import { AdminMfaGate } from "@/components/admin/AdminMfaGate";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { getAdminAccess, type AdminAccess } from "@/lib/adminCenter.functions";
import { ADMIN_MODULE_PATHS, type AdminModule } from "@/lib/admin/permissions";

const NAV: { module: AdminModule; icon: typeof Users; labelKey: string }[] = [
  { module: "dashboard", icon: LayoutDashboard, labelKey: "adminc.nav.dashboard" },
  { module: "users", icon: Users, labelKey: "adminc.nav.users" },
  { module: "fairplay", icon: ShieldCheck, labelKey: "adminc.nav.fairplay" },
  { module: "fairplayLog", icon: ScrollText, labelKey: "adminc.nav.fairplayLog" },
  { module: "audit", icon: ListChecks, labelKey: "adminc.nav.audit" },
  { module: "security", icon: ShieldAlert, labelKey: "adminc.nav.security" },
  { module: "system", icon: KeyRound, labelKey: "adminc.nav.system" },
  { module: "engine", icon: Cpu, labelKey: "adminc.nav.engine" },
  { module: "intelligence", icon: Sparkles, labelKey: "adminc.nav.intelligence" },
  { module: "puzzles", icon: Puzzle, labelKey: "adminc.nav.puzzles" },
  { module: "openings", icon: BookOpen, labelKey: "adminc.nav.openings" },
  { module: "learn", icon: GraduationCap, labelKey: "adminc.nav.learn" },
  { module: "tournaments", icon: Trophy, labelKey: "adminc.nav.tournaments" },
];

function isActive(pathname: string, to: string) {
  const clean = pathname.replace(/\/+$/, "") || "/";
  if (to === "/admin") return clean === "/admin";
  return clean === to || clean.startsWith(`${to}/`);
}

function NavList({ access, onNavigate }: { access: AdminAccess | null; onNavigate?: () => void }) {
  const { t } = useT();
  const { pathname } = useLocation();
  const visible = useMemo(
    () => NAV.filter((n) => (access ? access.modules.includes(n.module) : n.module === "dashboard")),
    [access],
  );

  return (
    <nav aria-label={t("adminc.nav.aria")} className="flex flex-col gap-1">
      {visible.map(({ module, icon: Icon, labelKey }) => {
        const to = ADMIN_MODULE_PATHS[module];
        const active = isActive(pathname, to);
        return (
          <Link
            key={module}
            to={to}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-primary/10 font-semibold text-primary"
                : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {t(labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}

export interface AdminShellProps {
  children: ReactNode;
  module: AdminModule;
  /** Breadcrumb tail label (page title). */
  title: string;
}

/**
 * Shared chrome for every Admin Center page: desktop sidebar, mobile drawer,
 * header with the admin's name / MFA state / back-to-site link, breadcrumb and
 * the MFA gate. Never nested inside AppShell.
 */
export function AdminShell({ children, module, title }: AdminShellProps) {
  const { t } = useT();
  const accessFn = useServerFn(getAdminAccess);
  const [access, setAccess] = useState<AdminAccess | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        setAccess((await accessFn()) as AdminAccess);
      } catch {
        setAccess({ role: null, modules: [] });
      } finally {
        setLoaded(true);
      }
    })();
  }, [accessFn]);

  const allowed = access ? access.modules.includes(module) : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-3 sm:px-5">
          <Sheet open={drawer} onOpenChange={setDrawer}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t("adminc.nav.open")}>
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-4">
              <SheetTitle className="mb-4 text-sm">{t("adminc.title")}</SheetTitle>
              <NavList access={access} onNavigate={() => setDrawer(false)} />
            </SheetContent>
          </Sheet>

          <Link to="/admin" className="flex items-center gap-2">
            <BrandLogo className="h-6 w-auto" />
            <span className="hidden text-sm font-semibold sm:inline">{t("adminc.title")}</span>
          </Link>

          <div className="ml-auto flex items-center gap-2 text-xs">
            <span className="hidden rounded-full border border-border/60 px-2 py-1 text-muted-foreground sm:inline">
              {access?.role ? t(`adminc.role.${access.role}`) : t("adminc.role.unknown")}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 px-2 py-1 text-primary">
              <ShieldCheck className="size-3" />
              {t("adminc.mfaOn")}
            </span>
            <Button asChild variant="ghost" size="sm">
              <Link to="/">
                <ArrowLeft className="mr-1 size-4" />
                {t("adminc.backToSite")}
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        <aside className="hidden w-64 shrink-0 border-r border-border/60 p-3 lg:block">
          <NavList access={access} />
        </aside>

        <main className="min-w-0 flex-1 px-3 py-5 sm:px-6">
          <nav aria-label="breadcrumb" className="mb-4 flex items-center gap-1 text-xs text-muted-foreground">
            <Link to="/admin" className="hover:text-foreground">
              {t("adminc.title")}
            </Link>
            {module !== "dashboard" && (
              <>
                <ChevronRight className="size-3" />
                <span className="text-foreground">{title}</span>
              </>
            )}
          </nav>

          <AdminMfaGate>
            {!loaded ? (
              <div className="py-16 text-center text-sm text-muted-foreground">{t("adminc.loading")}</div>
            ) : allowed ? (
              children
            ) : (
              <div className="mx-auto max-w-md py-16 text-center text-sm text-muted-foreground">
                {t("adminc.denied")}
              </div>
            )}
          </AdminMfaGate>
        </main>
      </div>
    </div>
  );
}
