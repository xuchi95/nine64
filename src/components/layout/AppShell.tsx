import { Link, useLocation, useNavigate, useParams } from "@tanstack/react-router";
import {
  Moon,
  Sun,
  LogOut,
  Loader2,
  Bell,
  ChevronDown,
  Menu,
  Settings as SettingsIcon,
  ShieldCheck,
  History,
  Home,
  ChevronRight,
  Check,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { APP } from "@/config/app";
import { CREDIT } from "@/config/credit";

import { updateSettings, useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useNotifications } from "@/hooks/useNotifications";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { BrandLogo } from "@/components/layout/BrandLogo";
import { useSwipeToClose } from "@/hooks/useSwipeToClose";
import { CookieBanner } from "@/components/layout/CookieBanner";
import { resetCookieConsent } from "@/lib/cookieConsent";
import { LanguageToggle } from "@/components/layout/LanguageToggle";
import { useT } from "@/lib/i18n";
import { useServerFn } from "@tanstack/react-start";
import { getAdminAccess } from "@/lib/adminCenter.functions";

const MAIN_NAV = [
  { to: "/", labelKey: "shell.nav.home" },
  { to: "/play", labelKey: "shell.nav.play" },
  { to: "/games", labelKey: "shell.nav.games" },
  { to: "/puzzles", labelKey: "shell.nav.puzzles" },
] as const;

const MORE_NAV = [
  { to: "/skills", labelKey: "shell.nav.skills" },
  { to: "/openings", labelKey: "shell.nav.openings" },
  { to: "/drills", labelKey: "shell.nav.drills" },
  { to: "/progress", labelKey: "shell.nav.progress" },
  { to: "/insights", labelKey: "shell.nav.insights" },
  { to: "/analysis", labelKey: "shell.nav.analysis" },
] as const;

const PROFILE_MENU = [
  { to: "/account", labelKey: "shell.profile.account", icon: ShieldCheck },
  { to: "/games", labelKey: "shell.profile.games", icon: History },
  { to: "/settings", labelKey: "shell.profile.settings", icon: SettingsIcon },
] as const;

/** Normalise a URL path: no trailing slash, always leading slash. */
function normalizePath(path: string) {
  const clean = path.split("?")[0]?.split("#")[0] ?? "/";
  const trimmed = clean.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/**
 * Segment-aware active match so `/game/123` never lights up `/games`,
 * and deep links / refreshes resolve the same state as client navigation.
 */
function isRouteActive(pathname: string, to: string) {
  const current = normalizePath(pathname);
  const target = normalizePath(to);
  if (target === "/") return current === "/";
  return current === target || current.startsWith(`${target}/`);
}

export function AppShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const settings = useSettings();
  const { t } = useT();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 shadow-[0_1px_0_0_hsl(var(--border)/0.35),0_8px_24px_-20px_rgb(0_0_0/0.6)] backdrop-blur-xl">
        <div
          className={cn(
            "mx-auto grid h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-4 sm:h-[4.5rem] sm:px-6 lg:flex lg:h-[5.25rem] lg:gap-10 lg:px-8",
            wide ? "max-w-[1600px]" : "max-w-6xl",
          )}
        >
          <MobileNav />

          <Link to="/" className="group flex min-w-0 items-center">
            <BrandLogo className="h-9 transition-transform group-hover:scale-105 sm:h-10 lg:h-12" />
          </Link>


          <nav className="hidden items-center gap-1 text-sm font-medium lg:flex">
            {MAIN_NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="relative rounded-lg px-4 py-2.5 text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground after:absolute after:inset-x-4 after:-bottom-[9px] after:h-[2px] after:rounded-full after:bg-primary after:opacity-0 after:transition-opacity"
                activeProps={{ className: "bg-primary/10 text-foreground after:opacity-100" }}
                activeOptions={{ exact: item.to === "/" }}
              >
                {t(item.labelKey)}
              </Link>
            ))}
            <MoreNav />
          </nav>

          <div className="flex shrink-0 items-center gap-2 justify-self-end sm:gap-2.5 lg:ml-auto">
            <button
              type="button"
              aria-label={t("shell.aria.toggleTheme")}
              onClick={() =>
                updateSettings({ appearance: settings.appearance === "dark" ? "light" : "dark" })
              }
              className="hidden size-12 items-center justify-center rounded-xl border border-border/80 bg-secondary/30 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground sm:flex lg:size-11"
            >
              {settings.appearance === "dark" ? (
                <Sun className="size-5" />
              ) : (
                <Moon className="size-5" />
              )}
            </button>
            <LanguageToggle />
            <NotificationBell />
            <AuthHeader />
          </div>
        </div>
        <PageBreadcrumb wide={wide} />
      </header>
      <main className={cn("mx-auto w-full flex-1 px-4 py-7 sm:px-6 sm:py-8 lg:py-10", wide ? "max-w-[1600px]" : "max-w-6xl")}>
        {children}
      </main>
      <footer className="border-t border-border/70 py-5 text-center text-xs text-muted-foreground">
        <p>{APP.name} — {APP.tagline}</p>
        <p className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-2xs">
          {CREDIT.enabled && (
            <>
              {CREDIT.prefix}{" "}
              <a
                href={CREDIT.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {CREDIT.name}
              </a>
              <span aria-hidden className="text-border">|</span>
            </>
          )}
          <Link to="/privacy" className="hover:text-foreground hover:underline">
            {t("shell.footer.privacy")}
          </Link>
          <span aria-hidden className="text-border">|</span>
          <Link to="/terms" className="hover:text-foreground hover:underline">
            {t("shell.footer.terms")}
          </Link>
          <span aria-hidden className="text-border">|</span>
          <Link to="/cookie-policy" className="hover:text-foreground hover:underline">
            {t("shell.footer.cookiePolicy")}
          </Link>
          <span aria-hidden className="text-border">|</span>
          <Link to="/contact" className="hover:text-foreground hover:underline">
            {t("shell.footer.contact")}
          </Link>
          <span aria-hidden className="text-border">|</span>
          <button
            type="button"
            onClick={resetCookieConsent}
            className="hover:text-foreground hover:underline"
          >
            {t("shell.footer.cookiePrefs")}
          </button>
        </p>

      </footer>
      <CookieBanner />
    </div>
  );
}

function MobileNav() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const settings = useSettings();
  const { user, signOut } = useAuth();
  const { t } = useT();
  const swipe = useSwipeToClose({
    side: "left",
    enabled: open,
    onClose: () => setOpen(false),
  });

  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Khi mở drawer: cuộn tới mục đang active để luôn nhìn thấy vị trí hiện tại.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      const el = navRef.current?.querySelector<HTMLElement>('[data-active="true"]');
      el?.scrollIntoView({ block: "center", behavior: "auto" });
    }, 60);
    return () => window.clearTimeout(id);
  }, [open]);

  const isActive = (to: string) => isRouteActive(pathname, to);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label={t("shell.aria.openMenu")}
            className="flex size-12 items-center justify-center rounded-xl border border-border/80 bg-secondary/30 text-muted-foreground transition-colors active:bg-secondary lg:hidden"
          >
            <Menu className="size-6" />
          </button>
        </SheetTrigger>
      <SheetContent
        ref={swipe.ref}
        side="left"
        className="flex w-[88vw] max-w-sm flex-col gap-0 p-0"
        style={swipe.style}
        {...swipe.handlers}
      >
        {/* Drag affordance: vuốt sang trái để đóng menu */}
        <span
          aria-hidden
          className="absolute right-2 top-1/2 h-20 w-1.5 -translate-y-1/2 rounded-full bg-border/80"
        />
        <div className="flex items-center border-b border-border/70 px-6 py-6">
          <BrandLogo className="h-10" />
          <SheetTitle className="sr-only">{APP.name}</SheetTitle>
        </div>


        <nav
          ref={navRef}
          className="flex-1 overflow-y-auto overscroll-contain scroll-smooth p-5 [-webkit-overflow-scrolling:touch]"
        >
          <div className="flex flex-col gap-2">
            {MAIN_NAV.map((item) => {
              const active = isActive(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  data-active={active ? "true" : undefined}
                  className={cn(
                    "flex min-h-[3.75rem] scroll-mt-6 items-center justify-between rounded-xl px-6 text-base font-semibold text-muted-foreground transition-colors active:bg-secondary",
                    active && "bg-primary/15 text-primary",
                  )}
                >
                  {t(item.labelKey)}
                  {active && <Check className="size-5 text-primary" />}
                </Link>
              );
            })}
          </div>

          <p className="px-6 pb-2.5 pt-7 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {t("shell.nav.train")}
          </p>
          <div className="flex flex-col gap-2">
            {MORE_NAV.map((item) => {
              const active = isActive(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  data-active={active ? "true" : undefined}
                  className={cn(
                    "flex min-h-[3.75rem] scroll-mt-6 items-center justify-between rounded-xl px-6 text-base font-medium text-muted-foreground transition-colors active:bg-secondary",
                    active && "bg-primary/15 text-primary",
                  )}
                >
                  {t(item.labelKey)}
                  {active && <Check className="size-5 text-primary" />}
                </Link>
              );
            })}
          </div>

          {user && (
            <>
              <p className="px-6 pb-2.5 pt-7 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {t("shell.nav.account")}
              </p>
              <div className="flex flex-col gap-2">
                {PROFILE_MENU.map((item) => {
                  const active = isActive(item.to);
                  return (
                    <Link
                      key={item.to + item.labelKey}
                      to={item.to}
                      data-active={active ? "true" : undefined}
                      className={cn(
                        "flex min-h-[3.75rem] scroll-mt-6 items-center gap-4 rounded-xl px-6 text-base font-medium text-muted-foreground transition-colors active:bg-secondary",
                        active && "bg-primary/15 text-primary",
                      )}
                    >
                      <item.icon className={cn("size-5 shrink-0", active && "text-primary")} />
                      {t(item.labelKey)}
                      {active && <Check className="ml-auto size-5 text-primary" />}
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </nav>


        <div className="flex flex-col gap-3 border-t border-border/70 p-5">
          <LanguageToggle variant="inline" />
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="h-14 flex-1 justify-center gap-2 text-base"
              onClick={() =>
                updateSettings({ appearance: settings.appearance === "dark" ? "light" : "dark" })
              }
            >
              {settings.appearance === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
              {settings.appearance === "dark" ? t("shell.mobile.themeLight") : t("shell.mobile.themeDark")}
            </Button>
            {user ? (
              <Button
                variant="outline"
                className="h-14 flex-1 justify-center gap-2 text-base text-destructive"
                onClick={() => {
                  setOpen(false);
                  void signOut();
                }}
              >
                <LogOut className="size-5" />
                {t("shell.mobile.signOut")}
              </Button>
            ) : (
              <Button asChild className="h-14 flex-1 justify-center text-base">
                <Link to="/auth/login">{t("shell.mobile.signIn")}</Link>
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}


function MoreNav({ mobile }: { mobile?: boolean }) {
  const { pathname } = useLocation();
  const { t } = useT();
  const active = MORE_NAV.some((item) => isRouteActive(pathname, item.to));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground",
            mobile && "shrink-0 px-3.5 py-2",
            active && "bg-primary/10 text-primary",
          )}
        >
          {t("shell.nav.more")}
          <ChevronDown className="size-4 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48 rounded-xl p-2">
        {MORE_NAV.map((item) => {
          const isActive = isRouteActive(pathname, item.to);
          return (
            <DropdownMenuItem
              key={item.to}
              asChild
              className={cn(
                "cursor-pointer rounded-lg px-3.5 py-2.5",
                isActive && "bg-primary/10 text-foreground",
              )}
            >
              <Link to={item.to} className="flex items-center justify-between">
                {t(item.labelKey)}
                {isActive && <Check className="size-4 text-primary" />}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


function NotificationBell() {
  const { user } = useAuth();
  const { notifications, unreadCount, error, markRead, markAllRead } = useNotifications();
  const navigate = useNavigate();
  const { t } = useT();

  if (!user) return null;

  return (
    <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t("shell.aria.notifications")}
            className="relative flex size-12 items-center justify-center rounded-xl border border-border/80 bg-secondary/30 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground lg:size-11"
          >
            <Bell className="size-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-2xs font-bold text-primary-foreground">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80 rounded-xl p-2">

        <div className="flex items-center justify-between px-2.5 py-2">
          <span className="text-sm font-medium">{t("shell.notifications.title")}</span>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="text-xs text-primary hover:underline"
            >
              {t("shell.notifications.markAllRead")}
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {error && (
          <div className="mx-2 mb-1 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
            {t("shell.notifications.error")}
          </div>
        )}
        {notifications.length === 0 ? (
          <div className="px-2.5 py-4 text-center text-sm text-muted-foreground">{t("shell.notifications.empty")}</div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {notifications.slice(0, 20).map((n) => (
              <DropdownMenuItem
                key={n.id}
                className={cn(
                  "cursor-pointer flex-col items-start gap-1 px-3.5 py-2.5",
                  !n.read && "bg-primary/5",
                )}
                onClick={() => {
                  void markRead(n.id);
                  const gameId = (n.data as { game_id?: string | null } | null)?.game_id;
                  if (gameId) {
                    void navigate({ to: "/game/$gameId", params: { gameId } });
                  }
                }}
              >
                <span className="text-sm font-medium">{n.title}</span>
                <span className="text-xs text-muted-foreground">{n.body}</span>
                <span className="text-2xs text-muted-foreground">
                  {new Date(n.created_at).toLocaleString()}
                </span>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * "Quản trị" entry — only rendered when the server says the caller holds an
 * admin-capable role. Frontend hiding is UX only: `/admin/*` server functions
 * re-check the role and MFA level, so a typed URL is still rejected.
 */
function AdminMenuItem() {
  const { t } = useT();
  const accessFn = useServerFn(getAdminAccess);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const access = (await accessFn()) as { role: string | null };
        if (alive) setAllowed(access.role === "admin" || access.role === "moderator");
      } catch {
        if (alive) setAllowed(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [accessFn]);

  if (!allowed) return null;

  return (
    <DropdownMenuItem asChild className="cursor-pointer rounded-lg px-3.5 py-2.5">
      <Link to="/admin" className="flex items-center">
        <ShieldCheck className="mr-3 size-4 text-primary" />
        <span className="flex-1">{t("adminc.title")}</span>
      </Link>
    </DropdownMenuItem>
  );
}

function AuthHeader() {

  const { pathname } = useLocation();
  const { user, isLoading, signOut } = useAuth();
  const { t } = useT();

  if (isLoading) {
    return (
      <span className="flex size-10 items-center justify-center text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </span>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" className="hidden h-12 px-4 sm:inline-flex lg:h-11">
          <Link to="/auth/login">{t("shell.auth.signIn")}</Link>
        </Button>
        <Button asChild className="h-12 px-4 lg:h-11">
          <Link to="/auth/register">
            <span className="sm:hidden">{t("shell.auth.signIn")}</span>
            <span className="hidden sm:inline">{t("shell.auth.register")}</span>
          </Link>
        </Button>
      </div>
    );
  }

  const displayName = (user.user_metadata?.["display_name"] as string) || user.email || t("shell.auth.defaultName");
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-12 items-center gap-2 rounded-xl border border-border/80 bg-secondary/30 pl-2 pr-2.5 text-sm font-medium transition-colors hover:border-primary/40 lg:h-11 lg:gap-2.5 lg:pr-3"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70 text-xs font-bold text-primary-foreground lg:size-8">
            {initials}
          </span>
          <span className="hidden max-w-[130px] truncate lg:inline">{displayName}</span>
          <ChevronDown className="size-4 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 rounded-xl p-2">
        <div className="flex items-center gap-3 rounded-lg bg-secondary/40 px-3.5 py-3.5">
          <span className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 font-mono text-sm font-bold text-primary-foreground">
            {initials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{displayName}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <DropdownMenuSeparator />
        {PROFILE_MENU.map((item) => {
          const active = isRouteActive(pathname, item.to);
          return (
            <DropdownMenuItem
              key={item.to + item.labelKey}
              asChild
              className={cn(
                "cursor-pointer rounded-lg px-3.5 py-2.5",
                active && "bg-primary/10 text-foreground",
              )}
            >
              <Link to={item.to} className="flex items-center justify-between">
                <span className="flex items-center">
                  <item.icon className={cn("mr-3 size-4", active ? "text-primary" : "text-muted-foreground")} />
                  <span className="flex-1">{t(item.labelKey)}</span>
                </span>
                {active && <Check className="size-4 text-primary" />}
              </Link>
            </DropdownMenuItem>
          );
        })}
        <AdminMenuItem />
        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={signOut}
          className="cursor-pointer rounded-lg px-3.5 py-2.5 text-destructive focus:text-destructive"
        >
          <LogOut className="mr-3 size-4" />
          {t("shell.auth.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

}

const ROUTE_LABEL_KEYS: Record<string, string> = {
  "/": "shell.nav.home",
  "/play": "shell.nav.play",
  "/play/ai": "shell.route.playAi",
  "/play/local": "shell.route.playLocal",
  "/play/share": "shell.route.playShare",
  "/online": "shell.route.online",
  "/game": "shell.route.liveGame",
  "/games": "shell.route.myGames",
  "/puzzles": "shell.nav.puzzles",
  "/skills": "shell.nav.skills",
  "/openings": "shell.nav.openings",
  "/drills": "shell.nav.drills",
  "/progress": "shell.nav.progress",
  "/insights": "shell.nav.insights",
  "/analysis": "shell.nav.analysis",
  "/account": "shell.profile.account",
  "/settings": "shell.profile.settings",
  "/admin": "shell.route.admin",
  "/admin/fairplay": "shell.route.fairplay",
  "/admin/fairplay/log": "shell.route.fairplayLog",
  "/admin/audit": "shell.route.auditLog",
  "/admin/security": "shell.route.security",
  "/admin/system": "shell.route.system",

};

function PageBreadcrumb({ wide }: { wide?: boolean | undefined }) {
  const location = useLocation();
  const { t } = useT();
  const pathname = normalizePath(location.pathname);
  const params = useParams({ strict: false });
  const gameId = (params as { gameId?: string }).gameId;

  if (pathname === "/") return null;

  const segments = pathname.split("/").filter(Boolean);

  // Build every ancestor crumb that has a known label and is a real route.
  const crumbs = segments.slice(0, -1).map((_, index) => {
    const to = "/" + segments.slice(0, index + 1).join("/");
    const key = ROUTE_LABEL_KEYS[to];
    return { to, label: key ? t(key) : undefined };
  }).filter((c): c is { to: string; label: string } => Boolean(c.label));

  const currentLabel =
    (ROUTE_LABEL_KEYS[pathname] ? t(ROUTE_LABEL_KEYS[pathname]!) : "") ||
    (gameId ? t("shell.route.game", { id: gameId.slice(0, 6) }) : segments[segments.length - 1] || "");

  return (
    <div className="border-t border-border/40 bg-secondary/20">
      <div
        className={cn(
          "mx-auto flex min-w-0 items-center gap-1 px-4 py-1 text-2xs leading-tight text-muted-foreground sm:gap-1.5 sm:px-6 sm:py-2 sm:text-xs",
          wide ? "max-w-[1600px]" : "max-w-6xl",
        )}
      >
        <Link to="/" className="flex shrink-0 items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:bg-secondary/60 hover:text-foreground">
          <Home className="size-3" />
          <span className="hidden sm:inline">{t("shell.breadcrumb.home")}</span>
        </Link>
        {crumbs.map((crumb) => (
          <span key={crumb.to} className="flex min-w-0 shrink-0 items-center gap-1 sm:gap-1.5">
            <ChevronRight className="size-3 shrink-0 opacity-50" />
            <Link
              to={crumb.to}
              className="hidden max-w-[100px] truncate rounded-md px-1.5 py-0.5 transition-colors hover:bg-secondary/60 hover:text-foreground sm:inline-block md:max-w-[180px]"
            >
              {crumb.label}
            </Link>
          </span>
        ))}
        <ChevronRight className="size-3 shrink-0 opacity-50" />
        <span
          aria-current="page"
          className="min-w-0 flex-1 truncate rounded-md bg-primary/10 px-1.5 py-0.5 text-2xs font-semibold text-primary sm:px-2 sm:text-xs"
        >
          {currentLabel}
        </span>
      </div>
    </div>
  );
}

