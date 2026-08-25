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
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { FormSkeleton } from "@/components/layout/PageSkeleton";
import { BrandMark } from "@/components/layout/BrandMark";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/auth/register")({
  head: () => ({
    meta: [
      { title: `Tạo tài khoản — ${APP.name}` },
      { name: "description", content: "Tạo tài khoản Nine64 để chơi trực tuyến, theo dõi điểm rating và xem lại ván đấu của bạn." },
      { property: "og:title", content: `Tạo tài khoản — ${APP.name}` },
      { property: "og:description", content: "Tạo tài khoản Nine64." },
    ],
  }),
  pendingComponent: FormSkeleton,
  component: RegisterPage,
});

function RegisterPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth/register" }) as { redirect?: string };
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const redirectTo = search.redirect && search.redirect.startsWith("/") ? search.redirect : "/";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setFormError(null);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName || email.split("@")[0] },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (error) {
      setFormError(error.message || t("study.register.signUpFailed"));
      return;
    }

    if (data.user?.identities?.length === 0) {
      setFormError(t("study.register.accountExists"));
      return;
    }

    navigate({ to: redirectTo, replace: true });
  }

  return (
    <AuthModal>
      <div className="text-center">
        <BrandMark className="mx-auto mb-4 size-14" />
        <h1 className="text-2xl font-bold">{t("study.register.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("study.register.subtitle", { app: APP.name })}
        </p>
      </div>


          {formError ? (
            <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</p>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">{t("study.register.displayName")}</Label>
              <Input
                id="displayName"
                type="text"
                placeholder="KasparovFan"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                autoComplete="username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">{t("study.register.email")}</Label>
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
              <Label htmlFor="password">{t("study.register.password")}</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
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
              <p className="text-xs text-muted-foreground">{t("study.register.passwordHint")}</p>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {t("study.register.createAccount")}
            </Button>
          </form>

          <div className="mt-4 flex items-center gap-2">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">{t("study.register.or")}</span>
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
                setFormError(result.error.message || t("study.register.googleFailed"));
              }
            }}
            disabled={loading}
          >
            {t("study.register.continueWithGoogle")}
          </Button>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t("study.register.haveAccount")}{" "}
            <Link
              to="/auth/login"
              search={{ redirect: redirectTo }}
              className="text-primary hover:underline"
            >
              {t("study.register.signIn")}
            </Link>
          </p>
    </AuthModal>
  );
}
