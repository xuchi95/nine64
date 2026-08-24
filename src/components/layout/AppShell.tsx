import { Link } from "@tanstack/react-router";
import { Moon, Sun, Crown, User, LogOut, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { APP } from "@/config/app";
import { updateSettings, useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/play", label: "Play" },
  { to: "/games", label: "My games" },
  { to: "/analysis", label: "Analysis" },
  { to: "/settings", label: "Settings" },
] as const;

export function AppShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const settings = useSettings();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur">
        <div className={cn("mx-auto flex h-14 items-center gap-6 px-4", wide ? "max-w-[1600px]" : "max-w-6xl")}>
          <Link to="/" className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Crown className="size-4" />
            </span>
            <span className="font-display text-sm font-semibold tracking-tight">
              {APP.name.toUpperCase()}
            </span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                activeProps={{ className: "bg-secondary text-foreground" }}
                activeOptions={{ exact: item.to === "/" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              aria-label="Toggle colour mode"
              onClick={() =>
                updateSettings({ appearance: settings.appearance === "dark" ? "light" : "dark" })
              }
              className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground"
            >
              {settings.appearance === "dark" ? (
                <Sun className="size-4" />
              ) : (
                <Moon className="size-4" />
              )}
            </button>
            <AuthHeader />
          </div>
        </div>
      </header>
      <main className={cn("mx-auto w-full flex-1 px-4 py-6", wide ? "max-w-[1600px]" : "max-w-6xl")}>
        {children}
      </main>
      <footer className="border-t border-border/70 py-5 text-center text-xs text-muted-foreground">
        {APP.name} — {APP.tagline}
      </footer>
    </div>
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

  const displayName = user.user_metadata?.display_name || user.email || "Player";

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
          <Link to="/profile" className="cursor-pointer">
            Profile
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
