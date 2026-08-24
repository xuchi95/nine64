import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { APP } from "@/config/app";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { FormSkeleton } from "@/components/layout/PageSkeleton";

export const Route = createFileRoute("/auth/login")({
  head: () => ({
    meta: [
      { title: `Sign in — ${APP.name}` },
      { name: "description", content: "Sign in to your Nexus Chess account to play online and track your rating." },
      { property: "og:title", content: `Sign in — ${APP.name}` },
      { property: "og:description", content: "Sign in to your Nexus Chess account." },
    ],
  }),
  pendingComponent: FormSkeleton,
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth/login" }) as { redirect?: string };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  const redirectTo = search.redirect && search.redirect.startsWith("/") ? search.redirect : "/";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message || "Sign in failed");
      return;
    }
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.nextLevel !== aal.currentLevel) {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const factor = factors?.totp?.[0];
      if (factor) {
        setMfaFactorId(factor.id);
        toast.info("Nhập mã xác thực 2 bước để hoàn tất đăng nhập.");
        return;
      }
    }
    toast.success("Welcome back!");
    navigate({ to: redirectTo, replace: true });
  }

  async function handleMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaFactorId) return;
    setLoading(true);
    const challenge = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
    if (challenge.error || !challenge.data) {
      setLoading(false);
      toast.error(challenge.error?.message ?? "Không tạo được phiên xác thực.");
      return;
    }
    const { error } = await supabase.auth.mfa.verify({
      factorId: mfaFactorId,
      challengeId: challenge.data.id,
      code: mfaCode.trim(),
    });
    setLoading(false);
    if (error) {
      toast.error("Mã không đúng hoặc đã hết hạn.");
      return;
    }
    toast.success("Welcome back!");
    navigate({ to: redirectTo, replace: true });
  }

  if (mfaFactorId) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md">
          <form onSubmit={handleMfa} className="panel space-y-4 p-6 sm:p-8">
            <div className="text-center">
              <h1 className="text-2xl font-bold">Xác thực hai bước</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Nhập mã 6 số từ ứng dụng xác thực của bạn.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mfa-code">Mã xác thực</Label>
              <Input
                id="mfa-code"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoFocus
                placeholder="000000"
                className="text-center font-mono text-lg tracking-[0.4em]"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || mfaCode.length !== 6}>
              {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Verify
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={async () => {
                await supabase.auth.signOut();
                setMfaFactorId(null);
                setMfaCode("");
              }}
            >
              Huỷ
            </Button>
          </form>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-md">
        <div className="panel p-6 sm:p-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold">Sign in</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Welcome back to {APP.name}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Sign in
            </Button>
          </form>

          <div className="mt-4 flex items-center gap-2">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">or</span>
            <Separator className="flex-1" />
          </div>

          <Button
            type="button"
            variant="outline"
            className="mt-4 w-full"
            onClick={async () => {
              setLoading(true);
              const result = await lovable.auth.signInWithOAuth("google", {
                redirect_uri: window.location.origin,
              });
              setLoading(false);
              if (result.error) {
                toast.error(result.error.message || "Google sign in failed");
              }
            }}
            disabled={loading}
          >
            Continue with Google
          </Button>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link
              to="/auth/register"
              search={{ redirect: redirectTo }}
              className="text-primary hover:underline"
            >
              Create one
            </Link>
          </p>
        </div>
      </div>
    </AppShell>
  );
}
