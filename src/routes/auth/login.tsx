import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { AuthModal } from "@/components/auth/AuthModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { APP } from "@/config/app";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { guardAuthAttempt } from "@/lib/authGuard.functions";
import { parseRateLimited, rateLimitMessage } from "@/lib/ratelimit/errors";
import { lovable } from "@/integrations/lovable";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { FormSkeleton } from "@/components/layout/PageSkeleton";
import { BrandMark } from "@/components/layout/BrandMark";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/auth/login")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
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
  const { t, locale } = useT();
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth/login" }) as { redirect?: string };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formInfo, setFormInfo] = useState<string | null>(null);
  const guard = useServerFn(guardAuthAttempt);


  const redirectTo = search.redirect && search.redirect.startsWith("/") ? search.redirect : "/";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setFormError(null);
    setFormInfo(null);
    try {
      await guard({ data: { intent: "login", email } });
    } catch (err) {
      const limited = parseRateLimited(err);
      setLoading(false);
      if (limited) {
        setFormError(rateLimitMessage(limited, "vi"));
        return;
      }
      setFormError(err instanceof Error ? err.message : "Đăng nhập thất bại");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setFormError(error.message || t("study.login.signInFailed"));
      return;
    }
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.nextLevel !== aal.currentLevel) {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const factor = factors?.totp?.[0];
      if (factor) {
        setMfaFactorId(factor.id);
        setFormInfo(t("study.login.mfaEnterToFinish"));
        return;
      }
    }
    navigate({ to: redirectTo, replace: true });
  }

  async function handleMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaFactorId) return;
    setLoading(true);
    setFormError(null);
    const challenge = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
    if (challenge.error || !challenge.data) {
      setLoading(false);
      setFormError(challenge.error?.message ?? t("study.login.mfaChallengeFailed"));
      return;
    }
    const { error } = await supabase.auth.mfa.verify({
      factorId: mfaFactorId,
      challengeId: challenge.data.id,
      code: mfaCode.trim(),
    });
    setLoading(false);
    if (error) {
      setFormError(t("study.login.mfaCodeInvalid"));
      return;
    }
    navigate({ to: redirectTo, replace: true });
  }

  if (mfaFactorId) {
    return (
      <AuthModal>
        <form onSubmit={handleMfa} className="space-y-5">
          <div className="text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
              <ShieldCheck className="size-6" />
            </div>
            <h1 className="mt-4 text-2xl font-bold tracking-tight">{t("study.login.mfaTitle")}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {t("study.login.mfaSubtitle")}
            </p>
          </div>
          {formInfo ? (
            <p className="rounded-lg border border-primary/25 bg-primary/8 px-3 py-2.5 text-center text-sm text-muted-foreground">{formInfo}</p>
          ) : null}
          {formError ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">{formError}</p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="mfa-code" className="label-caps">{t("study.login.mfaCode")}</Label>
            <Input
              id="mfa-code"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoFocus
              placeholder="000000"
              className="h-14 border-primary/25 bg-background/60 text-center font-mono text-2xl tracking-[0.5em] focus-ring-brass"
            />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={loading || mfaCode.length !== 6}>
            {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {t("study.login.verify")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full text-muted-foreground"
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
        <h1 className="text-2xl font-bold tracking-tight">{t("study.login.title")}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{t("study.login.welcomeBack", { app: APP.name })}</p>
      </div>


          {formError ? (
            <p className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">{formError}</p>
          ) : null}

          <div className="mt-5 rounded-lg border border-border/70 bg-secondary/20 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck className="mr-1.5 inline size-3.5 text-primary" />
            {locale === "vi" ? (
              <>
                Khi đăng nhập, bạn xác nhận tiếp tục đồng ý với{" "}
                <Link to="/terms" className="text-primary hover:underline">Điều khoản sử dụng</Link>,{" "}
                <Link to="/privacy" className="text-primary hover:underline">Chính sách quyền riêng tư</Link> và{" "}
                <Link to="/cookie-policy" className="text-primary hover:underline">Chính sách cookie</Link>.{" "}
                <Link to="/register-policy" search={{ redirect: redirectTo }} className="text-primary hover:underline">
                  Xem lại tóm tắt chính sách
                </Link>
                .
              </>
            ) : (
              <>
                By signing in you confirm that you still agree to our{" "}
                <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>,{" "}
                <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link> and{" "}
                <Link to="/cookie-policy" className="text-primary hover:underline">Cookie Policy</Link>.{" "}
                <Link to="/register-policy" search={{ redirect: redirectTo }} className="text-primary hover:underline">
                  Review the policy summary
                </Link>
                .
              </>
            )}
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="label-caps">{t("study.login.email")}</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="h-11 bg-background/60 focus-ring-brass"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="label-caps">{t("study.login.password")}</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="h-11 bg-background/60 pr-11 focus-ring-brass"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {t("study.login.signIn")}
            </Button>
          </form>

          <div className="mt-5 flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="label-caps">{t("study.login.or")}</span>
            <Separator className="flex-1" />
          </div>

          <Button
            type="button"
            variant="outline"
            size="lg"
            className="mt-5 w-full border-border/80 bg-surface-2/40 hover:border-primary/40"
            onClick={async () => {
              setLoading(true);
              const result = await lovable.auth.signInWithOAuth("google", {
                redirect_uri: window.location.origin,
              });
              setLoading(false);
              if (result.error) {
                setFormError(result.error.message || t("study.login.googleFailed"));
              }
            }}
            disabled={loading}
          >
            {t("study.login.continueWithGoogle")}
          </Button>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t("study.login.noAccount")}{" "}
            <Link
              to="/register-policy"
              search={{ redirect: redirectTo }}
              className="text-primary hover:underline"
            >
              {t("study.login.createOne")}
            </Link>
          </p>
    </AuthModal>
  );
}

