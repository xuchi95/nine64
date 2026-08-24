import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  Moon,
  Sun,
  Crown,
  User,
  LogOut,
  Loader2,
  Bell,
  ChevronDown,
} from "lucide-react";
import type { ReactNode } from "react";
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

const MAIN_NAV = [
  { to: "/", label: "Home" },
  { to: "/play", label: "Play" },
  { to: "/games", label: "My games" },
  { to: "/puzzles", label: "Puzzles" },
] as const;

const MORE_NAV = [
  { to: "/drills", label: "Bài tập" },
  { to: "/progress", label: "Tiến bộ" },
  { to: "/insights", label: "Insights" },
  { to: "/analysis", label: "Analysis" },
] as const;

export function AppShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const settings = useSettings();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 shadow-[0_1px_0_0_hsl(var(--border)/0.35),0_8px_24px_-20px_rgb(0_0_0/0.6)] backdrop-blur-xl">
        <div
          className={cn(
            "mx-auto flex h-16 items-center gap-4 px-4 sm:px-6 lg:h-20 lg:gap-8",
            wide ? "max-w-[1600px]" : "max-w-6xl",
          )}
        >
          <Link to="/" className="group flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm transition-transform group-hover:scale-105 lg:size-11">
              <Crown className="size-5 lg:size-6" />
            </span>
            <span className="flex flex-col leading-none">
              <span className="font-display text-base font-bold tracking-[0.16em] lg:text-lg">
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
                className="relative rounded-lg px-3.5 py-2 text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground after:absolute after:inset-x-3.5 after:-bottom-[7px] after:h-[2px] after:rounded-full after:bg-primary after:opacity-0 after:transition-opacity"
                activeProps={{ className: "text-foreground after:opacity-100" }}
                activeOptions={{ exact: item.to === "/" }}
              >
                {item.label}
              </Link>
            ))}
            <MoreNav />
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              type="button"
              aria-label="Toggle colour mode"
              onClick={() =>
                updateSettings({ appearance: settings.appearance === "dark" ? "light" : "dark" })
              }
              className="flex size-10 items-center justify-center rounded-xl border border-border/80 bg-secondary/30 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {settings.appearance === "dark" ? (
                <Sun className="size-[18px]" />
              ) : (
                <Moon className="size-[18px]" />
              )}
            </button>
            <NotificationBell />
            <AuthHeader />
          </div>
        </div>
        <nav className="flex items-center gap-1.5 overflow-x-auto border-t border-border/60 px-4 py-2 text-sm font-medium [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
          {MAIN_NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="shrink-0 rounded-lg px-3 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              activeProps={{ className: "bg-primary/15 text-primary" }}
              activeOptions={{ exact: item.to === "/" }}
            >
              {item.label}
            </Link>
          ))}
          <MoreNav mobile />
        </nav>
      </header>
      <main className={cn("mx-auto w-full flex-1 px-4 py-6 sm:px-6", wide ? "max-w-[1600px]" : "max-w-6xl")}>
        {children}
      </main>
      <footer className="border-t border-border/70 py-5 text-center text-xs text-muted-foreground">
        {APP.name} — {APP.tagline}
      </footer>
    </div>
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
            "flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground",
            mobile && "shrink-0 px-3 py-1.5",
            active && "bg-primary/10 text-primary",
          )}
        >
          More
          <ChevronDown className="size-3.5 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48 rounded-xl p-1.5">
        {MORE_NAV.map((item) => {
          const isActive = pathname.startsWith(item.to);
          return (
            <DropdownMenuItem
              key={item.to}
              asChild
              className={cn(
                "cursor-pointer rounded-lg px-3 py-2",
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
          className="relative flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground"
        >
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
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
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">No notifications yet.</div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {notifications.slice(0, 20).map((n) => (
              <DropdownMenuItem
                key={n.id}
                className={cn(
                  "cursor-pointer flex-col items-start gap-0.5 px-3 py-2",
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
      <span className="flex size-8 items-center justify-center text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </span>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/auth/login">Sign in</Link>
        </Button>
        <Button asChild size="sm">
          <Link to="/auth/register">Register</Link>
        </Button>
      </div>
    );
  }

  const displayName = user.user_metadata?.["display_name"] || user.email || "Player";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-primary">
            <User className="size-3.5" />
          </span>
          <span className="hidden max-w-[120px] truncate sm:inline">{displayName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <div className="px-2 py-1.5 text-sm font-medium">{displayName}</div>
        <div className="px-2 pb-1.5 text-xs text-muted-foreground">{user.email}</div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings" className="cursor-pointer">
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={signOut} className="cursor-pointer text-destructive focus:text-destructive">
          <LogOut className="mr-2 size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
