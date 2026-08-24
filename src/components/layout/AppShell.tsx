import { Link, useLocation, useNavigate, useParams } from "@tanstack/react-router";
import {
  Moon,
  Sun,
  Crown,
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
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { APP } from "@/config/app";
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
import { useSwipeToClose } from "@/hooks/useSwipeToClose";

const MAIN_NAV = [
  { to: "/", label: "Home" },
  { to: "/play", label: "Play" },
  { to: "/games", label: "Games" },
  { to: "/puzzles", label: "Puzzles" },
] as const;

const MORE_NAV = [
  { to: "/drills", label: "Drills" },
  { to: "/progress", label: "Progress" },
  { to: "/insights", label: "Insights" },
  { to: "/analysis", label: "Analysis" },
] as const;

const PROFILE_MENU = [
  { to: "/account", label: "Account", icon: ShieldCheck },
  { to: "/games", label: "Games", icon: History },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

export function AppShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const settings = useSettings();

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

          <Link to="/" className="group flex min-w-0 items-center gap-2 sm:gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm transition-transform group-hover:scale-105 sm:size-11 lg:size-12">
              <Crown className="size-5 sm:size-6" />
            </span>
            <span className="flex min-w-0 flex-col leading-none">
              <span className="truncate text-[13px] font-bold tracking-[0.14em] sm:text-base sm:tracking-[0.16em] lg:text-lg">
                {APP.name.toUpperCase()}
              </span>
              <span className="mt-1 hidden text-[10px] uppercase tracking-[0.24em] text-muted-foreground sm:block">
                {APP.tagline}
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 text-sm font-medium lg:flex">
            {MAIN_NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="relative rounded-lg px-4 py-2.5 text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground after:absolute after:inset-x-4 after:-bottom-[9px] after:h-[2px] after:rounded-full after:bg-primary after:opacity-0 after:transition-opacity"
                activeProps={{ className: "text-foreground after:opacity-100" }}
                activeOptions={{ exact: item.to === "/" }}
              >
                {item.label}
              </Link>
            ))}
            <MoreNav />
          </nav>

          <div className="flex shrink-0 items-center gap-2 justify-self-end sm:gap-2.5 lg:ml-auto">
            <button
              type="button"
              aria-label="Toggle colour mode"
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
        {APP.name} — {APP.tagline}
      </footer>
    </div>
  );
}

function MobileNav() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const settings = useSettings();
  const { user, signOut } = useAuth();
  const swipe = useSwipeToClose({
    side: "left",
    enabled: open,
    onClose: () => setOpen(false),
  });

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  return (
    <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label="Mở menu"
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
        <div className="flex items-center gap-4 border-b border-border/70 px-6 py-6">
          <span className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground">
            <Crown className="size-7" />
          </span>
          <SheetTitle className="text-xl tracking-[0.14em]">{APP.name.toUpperCase()}</SheetTitle>
        </div>

        <nav className="flex-1 overflow-y-auto p-5">
          <div className="flex flex-col gap-2">
            {MAIN_NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex min-h-[3.75rem] items-center rounded-xl px-6 text-base font-semibold text-muted-foreground transition-colors active:bg-secondary",
                  isActive(item.to) && "bg-primary/15 text-primary",
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>

          <p className="px-6 pb-2.5 pt-7 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Train
          </p>
          <div className="flex flex-col gap-2">
            {MORE_NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex min-h-[3.75rem] items-center rounded-xl px-6 text-base font-medium text-muted-foreground transition-colors active:bg-secondary",
                  isActive(item.to) && "bg-primary/15 text-primary",
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {user && (
            <>
              <p className="px-6 pb-2.5 pt-7 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Account
              </p>
              <div className="flex flex-col gap-2">
                {PROFILE_MENU.map((item) => (
                  <Link
                    key={item.to + item.label}
                    to={item.to}
                    className="flex min-h-[3.75rem] items-center gap-4 rounded-xl px-6 text-base font-medium text-muted-foreground transition-colors active:bg-secondary"
                  >
                    <item.icon className="size-5 shrink-0" />
                    {item.label}
                  </Link>
                ))}
              </div>
            </>
          )}
        </nav>

        <div className="flex items-center gap-3 border-t border-border/70 p-5">
          <Button
            variant="outline"
            className="h-14 flex-1 justify-center gap-2 text-base"
            onClick={() =>
              updateSettings({ appearance: settings.appearance === "dark" ? "light" : "dark" })
            }
          >
            {settings.appearance === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
            {settings.appearance === "dark" ? "Sáng" : "Tối"}
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
              Đăng xuất
            </Button>
          ) : (
            <Button asChild className="h-14 flex-1 justify-center text-base">
              <Link to="/auth/login">Đăng nhập</Link>
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}


function MoreNav({ mobile }: { mobile?: boolean }) {
  const { pathname } = useLocation();
  const active = MORE_NAV.some((item) => pathname.startsWith(item.to));

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
          More
          <ChevronDown className="size-4 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48 rounded-xl p-2">
        {MORE_NAV.map((item) => {
          const isActive = pathname.startsWith(item.to);
          return (
            <DropdownMenuItem
              key={item.to}
              asChild
              className={cn(
                "cursor-pointer rounded-lg px-3.5 py-2.5",
                isActive && "bg-secondary text-foreground",
              )}
            >
              <Link to={item.to}>{item.label}</Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


function NotificationBell() {
  const { user } = useAuth();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const navigate = useNavigate();

  if (!user) return null;

  return (
    <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Notifications"
            className="relative flex size-12 items-center justify-center rounded-xl border border-border/80 bg-secondary/30 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground lg:size-11"
          >
            <Bell className="size-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80 rounded-xl p-2">

        <div className="flex items-center justify-between px-2.5 py-2">
          <span className="text-sm font-medium">Notifications</span>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="text-xs text-primary hover:underline"
            >
              Mark all read
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <div className="px-2.5 py-4 text-center text-sm text-muted-foreground">No notifications yet.</div>
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
                  const gameId = (n.data as { game_id?: string } | null)?.game_id;
                  if (gameId) {
                    void navigate({ to: "/game/$gameId", params: { gameId } });
                  }
                }}
              >
                <span className="text-sm font-medium">{n.title}</span>
                <span className="text-xs text-muted-foreground">{n.body}</span>
                <span className="text-[10px] text-muted-foreground">
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

function AuthHeader() {
  const { user, isLoading, signOut } = useAuth();

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
          <Link to="/auth/login">Sign in</Link>
        </Button>
        <Button asChild className="h-12 px-4 lg:h-11">
          <Link to="/auth/register">
            <span className="sm:hidden">Đăng nhập</span>
            <span className="hidden sm:inline">Register</span>
          </Link>
        </Button>
      </div>
    );
  }

  const displayName = (user.user_metadata?.["display_name"] as string) || user.email || "Player";
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
        {PROFILE_MENU.map((item) => (
          <DropdownMenuItem key={item.to + item.label} asChild className="cursor-pointer rounded-lg px-3.5 py-2.5">
            <Link to={item.to}>
              <item.icon className="mr-3 size-4 text-muted-foreground" />
              <span className="flex-1">{item.label}</span>
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={signOut}
          className="cursor-pointer rounded-lg px-3.5 py-2.5 text-destructive focus:text-destructive"
        >
          <LogOut className="mr-3 size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

}

const ROUTE_LABELS: Record<string, string> = {
  "/": "Home",
  "/play": "Play",
  "/play/ai": "vs Bot",
  "/play/local": "Local",
  "/play/share": "Share",
  "/online": "Play online",
  "/game": "Live game",
  "/games": "My games",
  "/puzzles": "Puzzles",
  "/drills": "Bài tập",
  "/progress": "Tiến bộ",
  "/insights": "Insights",
  "/analysis": "Analysis",
  "/account": "Account",
  "/settings": "Settings",
  "/admin": "Admin",
  "/admin/fairplay": "Fair Play",
  "/admin/fairplay/log": "Nhật ký",
  "/admin/audit": "Audit log",

};

function PageBreadcrumb({ wide }: { wide?: boolean | undefined }) {
  const { pathname } = useLocation();
  const params = useParams({ strict: false });
  const gameId = (params as { gameId?: string }).gameId;

  if (pathname === "/") return null;

  const exact = ROUTE_LABELS[pathname];
  const parentKey = pathname.split("/").slice(0, -1).join("/") || "/";
  const parentLabel = ROUTE_LABELS[parentKey] || ROUTE_LABELS[`/${pathname.split("/")[1]}`];

  const currentLabel = exact || (gameId ? `Game ${gameId.slice(0, 6)}` : pathname.split("/").pop() || "");

  return (
    <div className="border-t border-border/40 bg-secondary/20">
      <div
        className={cn(
          "mx-auto flex min-w-0 items-center gap-1 px-4 py-2 text-xs text-muted-foreground sm:gap-1.5 sm:px-6",
          wide ? "max-w-[1600px]" : "max-w-6xl",
        )}
      >
        <Link to="/" className="flex shrink-0 items-center gap-1 hover:text-foreground">
          <Home className="size-3" />
          <span className="hidden sm:inline">Home</span>
        </Link>
        {parentLabel && parentKey !== "/" && (
          <>
            <ChevronRight className="size-3 shrink-0 opacity-50" />
            <span className="hidden max-w-[100px] truncate sm:inline md:max-w-[180px]">{parentLabel}</span>
          </>
        )}
        <ChevronRight className="size-3 shrink-0 opacity-50" />
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">{currentLabel}</span>
      </div>
    </div>
  );
}
