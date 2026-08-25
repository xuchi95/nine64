import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { AuthModal } from "@/components/auth/AuthModal";
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
import { BrandMark } from "@/components/layout/BrandMark";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/auth/login")({
  head: () => ({
    meta: [
      { title: `Đăng nhập — ${APP.name}` },
      { name: "description", content: "Đăng nhập vào tài khoản Nine64 để chơi trực tuyến và theo dõi điểm rating." },
      { property: "og:title", content: `Đăng nhập — ${APP.name}` },
      { property: "og:description", content: "Đăng nhập vào tài khoản Nine64 của bạn." },
    ],
  }),
  pendingComponent: FormSkeleton,
  component: LoginPage,
});

function LoginPage() {
  const { t } = useT();
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
      toast.error(error.message || t("study.login.signInFailed"));
      return;
    }
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.nextLevel !== aal.currentLevel) {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const factor = factors?.totp?.[0];
      if (factor) {
        setMfaFactorId(factor.id);
        toast.info(t("study.login.mfaEnterToFinish"));
        return;
      }
    }
    toast.success(t("study.login.welcomeToast"));
    navigate({ to: redirectTo, replace: true });
  }

  async function handleMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaFactorId) return;
    setLoading(true);
    const challenge = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
    if (challenge.error || !challenge.data) {
      setLoading(false);
      toast.error(challenge.error?.message ?? t("study.login.mfaChallengeFailed"));
      return;
    }
    const { error } = await supabase.auth.mfa.verify({
      factorId: mfaFactorId,
      challengeId: challenge.data.id,
      code: mfaCode.trim(),
    });
    setLoading(false);
    if (error) {
      toast.error(t("study.login.mfaCodeInvalid"));
      return;
    }
    toast.success(t("study.login.welcomeToast"));
    navigate({ to: redirectTo, replace: true });
  }

  if (mfaFactorId) {
    return (
      <AuthModal>
        <form onSubmit={handleMfa} className="space-y-4">
          <div className="text-center">
            <h1 className="text-2xl font-bold">{t("study.login.mfaTitle")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("study.login.mfaSubtitle")}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="mfa-code">{t("study.login.mfaCode")}</Label>
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
            {t("study.login.verify")}
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
            {t("study.login.cancel")}
          </Button>
        </form>
      </AuthModal>
    );
  }

  return (
    <AuthModal>
      <div className="text-center">
        <BrandMark className="mx-auto mb-4 size-14" />
        <h1 className="text-2xl font-bold">{t("study.login.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("study.login.welcomeBack", { app: APP.name })}</p>
      </div>


          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t("study.login.email")}</Label>
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
              <Label htmlFor="password">{t("study.login.password")}</Label>
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
              {t("study.login.signIn")}
            </Button>
          </form>

          <div className="mt-4 flex items-center gap-2">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">{t("study.login.or")}</span>
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
                toast.error(result.error.message || t("study.login.googleFailed"));
              }
            }}
            disabled={loading}
          >
            {t("study.login.continueWithGoogle")}
          </Button>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t("study.login.noAccount")}{" "}
            <Link
              to="/auth/register"
              search={{ redirect: redirectTo }}
              className="text-primary hover:underline"
            >
              {t("study.login.createOne")}
            </Link>
          </p>
    </AuthModal>
  );
}

