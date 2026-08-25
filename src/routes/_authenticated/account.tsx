import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  KeyRound,
  Loader2,
  Mail,
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Trash2,
  Upload,
  User,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { APP } from "@/config/app";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { removeAvatar, uploadAvatar, useAvatarUrl } from "@/lib/avatar";
import { FormSkeleton } from "@/components/layout/PageSkeleton";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [
      { title: `Tài khoản & bảo mật — ${APP.name}` },
      {
        name: "description",
        content:
          "Quản lý hồ sơ, email, mật khẩu và xác thực hai bước TOTP cho tài khoản Nine64 của bạn.",
      },
      { property: "og:title", content: `Tài khoản & bảo mật — ${APP.name}` },
      { property: "og:description", content: "Hồ sơ, email, mật khẩu và bảo mật 2 bước." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  pendingComponent: FormSkeleton,
  component: AccountPage,
});

function useSections() {
  const { t } = useT();
  return [
    { value: "profile", label: t("study.account.sectionProfile"), hint: t("study.account.sectionProfileHint"), icon: User },
    { value: "email", label: t("study.account.sectionEmail"), hint: t("study.account.sectionEmailHint"), icon: Mail },
    { value: "password", label: t("study.account.sectionPassword"), hint: t("study.account.sectionPasswordHint"), icon: KeyRound },
    { value: "mfa", label: t("study.account.sectionMfa"), hint: t("study.account.sectionMfaHint"), icon: ShieldCheck },
  ] as const;
}

function AccountPage() {
  const { t } = useT();
  const { user } = useAuth();
  const SECTIONS = useSections();
  const name =
    (user?.user_metadata?.["display_name"] as string | undefined) ||
    user?.email?.split("@")[0] ||
    t("study.account.player");
  const initials = name.slice(0, 2).toUpperCase();

  return (
    <AppShell>
      <section className="panel relative overflow-hidden p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-primary/10 blur-3xl"
        />
        <div className="relative flex flex-wrap items-center gap-5">
          <span className="grid size-16 shrink-0 place-items-center rounded-2xl border border-primary/30 bg-primary/15 font-display text-xl font-bold text-primary">
            {initials}
          </span>
          <div className="min-w-0">
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">
              {t("study.account.headerEyebrow")}
            </p>
            <h1 className="mt-1 truncate font-display text-2xl font-bold tracking-tight sm:text-3xl">
              {name}
            </h1>
            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </div>
      </section>

      <Tabs
        defaultValue="profile"
        orientation="vertical"
        className="mt-6 gap-6 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start"
      >
        <TabsList className="h-auto w-full flex-row gap-1 overflow-x-auto rounded-xl border border-border bg-card/60 p-1.5 lg:sticky lg:top-24 lg:flex-col lg:overflow-visible">
          {SECTIONS.map((s) => (
            <TabsTrigger
              key={s.value}
              value={s.value}
              className="group w-full shrink-0 justify-start gap-3 rounded-lg px-3 py-2.5 text-left lg:shrink"
            >
              <s.icon className="size-4 shrink-0 opacity-70" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold leading-tight">
                  {s.label}
                </span>
                <span className="hidden truncate text-xs text-muted-foreground lg:block">
                  {s.hint}
                </span>
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="mt-4 lg:mt-0">
          <TabsContent value="profile">
            <ProfileCard />
          </TabsContent>
          <TabsContent value="email">
            <EmailCard />
          </TabsContent>
          <TabsContent value="password">
            <PasswordCard />
          </TabsContent>
          <TabsContent value="mfa">
            <MfaCard />
          </TabsContent>
        </div>
      </Tabs>
    </AppShell>
  );
}

function SectionHead({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="border-b border-border/70 pb-4">
      <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}


function ProfileCard() {
  const { t } = useT();
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState(
    (user?.user_metadata?.["display_name"] as string | undefined) ?? "",
  );
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const avatarUrl = useAvatarUrl(avatarPath);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    void supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive || !data) return;
        setAvatarPath(data.avatar_url);
        setDisplayName((prev) => prev || data.display_name || "");
      });
    return () => {
      alive = false;
    };
  }, [user]);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    setUploading(true);
    const res = await uploadAvatar(user.id, file);
    setUploading(false);
    if ("error" in res) toast.error(res.error);
    else {
      setAvatarPath(res.path);
      toast.success(t("study.account.avatarUpdated"));
    }
  }

  async function onRemoveAvatar() {
    if (!user) return;
    setUploading(true);
    await removeAvatar(user.id, avatarPath);
    setAvatarPath(null);
    setUploading(false);
    toast.success(t("study.account.avatarRemoved"));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const name = displayName.trim();
    if (name.length < 2 || name.length > 32) {
      toast.error(t("study.account.nameLengthError"));
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ data: { display_name: name } });
    if (!error) {
      await supabase.from("profiles").update({ display_name: name }).eq("id", user!.id);
    }
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success(t("study.account.profileUpdated"));
  }

  return (
    <form onSubmit={save} className="panel max-w-2xl space-y-5 p-6">
      <SectionHead
        title={t("study.account.profileTitle")}
        desc={t("study.account.profileDesc")}
      />

      <div className="flex flex-wrap items-center gap-5">
        <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-primary/30 bg-primary/10 font-display text-xl font-bold text-primary">
          {avatarUrl ? (
            <img src={avatarUrl} alt={t("study.account.avatarAlt")} className="size-full object-cover" />
          ) : (
            (displayName || user?.email || "P").slice(0, 2).toUpperCase()
          )}
        </span>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={onPickFile}
          />
          <Button
            type="button"
            variant="outline"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Upload className="mr-2 size-4" />
            )}
            {t("study.account.uploadPhoto")}
          </Button>
          {avatarPath && (
            <Button type="button" variant="ghost" disabled={uploading} onClick={onRemoveAvatar}>
              <Trash2 className="mr-2 size-4" />
              {t("study.account.removePhoto")}
            </Button>
          )}
          <p className="w-full text-xs text-muted-foreground">{t("study.account.photoHint")}</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="display-name">{t("study.account.displayName")}</Label>
        <Input
          id="display-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={32}
          placeholder={t("study.account.displayNamePlaceholder")}
        />
      </div>
      <Button type="submit" disabled={busy}>
        {busy && <Loader2 className="mr-2 size-4 animate-spin" />}{t("study.account.saveProfile")}
      </Button>
    </form>
  );
}


function EmailCard() {
  const { t } = useT();
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const next = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next) || next.length > 255) {
      toast.error(t("study.account.invalidEmail"));
      return;
    }
    if (next === user?.email) {
      toast.error(t("study.account.emailSameAsCurrent"));
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser(
      { email: next },
      { emailRedirectTo: window.location.origin },
    );
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      setEmail("");
      toast.success(t("study.account.confirmationSent"));
    }
  }

  return (
    <form onSubmit={save} className="panel max-w-2xl space-y-5 p-6">
      <SectionHead title={t("study.account.emailTitle")} desc={t("study.account.emailDesc")} />
      <div className="space-y-2">
        <Label>{t("study.account.currentEmail")}</Label>
        <Input value={user?.email ?? ""} disabled />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-email">{t("study.account.newEmail")}</Label>
        <Input
          id="new-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder={t("study.account.emailPlaceholder")}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {t("study.account.emailConfirmHint")}
      </p>
      <Button type="submit" disabled={busy}>
        {busy && <Loader2 className="mr-2 size-4 animate-spin" />}{t("study.account.changeEmail")}
      </Button>
    </form>
  );
}

function PasswordCard() {
  const { t } = useT();
  const { user } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 8) {
      toast.error(t("study.account.passwordTooShort"));
      return;
    }
    if (next !== confirm) {
      toast.error(t("study.account.passwordMismatch"));
      return;
    }
    setBusy(true);
    if (user?.email && current) {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: current,
      });
      if (verifyError) {
        setBusy(false);
        toast.error(t("study.account.currentPasswordWrong"));
        return;
      }
    }
    const { error } = await supabase.auth.updateUser({ password: next });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success(t("study.account.passwordChanged"));
    }
  }

  return (
    <form onSubmit={save} className="panel max-w-2xl space-y-5 p-6">
      <SectionHead title={t("study.account.passwordTitle")} desc={t("study.account.passwordDesc")} />
      <div className="space-y-2">
        <Label htmlFor="cur-pass">{t("study.account.currentPassword")}</Label>
        <Input
          id="cur-pass"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
        />
      </div>
      <Separator />
      <div className="space-y-2">
        <Label htmlFor="new-pass">{t("study.account.newPassword")}</Label>
        <Input
          id="new-pass"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-pass">{t("study.account.confirmNewPassword")}</Label>
        <Input
          id="confirm-pass"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      <Button type="submit" disabled={busy}>
        {busy && <Loader2 className="mr-2 size-4 animate-spin" />}{t("study.account.updatePassword")}
      </Button>
    </form>
  );
}

interface Factor {
  id: string;
  friendly_name?: string | undefined;
  status: string;
}

function MfaCard() {
  const { t } = useT();
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      toast.error(error.message);
      setFactors([]);
      return;
    }
    setFactors(
      (data.all ?? []).map((f) => ({
        id: f.id,
        friendly_name: f.friendly_name,
        status: f.status,
      })),
    );
  };

  useEffect(() => {
    void refresh();
  }, []);

  const verified = (factors ?? []).filter((f) => f.status === "verified");

  async function startEnroll() {
    setBusy(true);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Authenticator ${new Date().toLocaleDateString()}`,
    });
    setBusy(false);
    if (error || !data) {
      toast.error(error?.message ?? t("study.account.mfaCreateFailed"));
      return;
    }
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function verifyEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (!enroll) return;
    setBusy(true);
    const challenge = await supabase.auth.mfa.challenge({ factorId: enroll.id });
    if (challenge.error || !challenge.data) {
      setBusy(false);
      toast.error(challenge.error?.message ?? t("study.account.mfaChallengeFailed"));
      return;
    }
    const { error } = await supabase.auth.mfa.verify({
      factorId: enroll.id,
      challengeId: challenge.data.id,
      code: code.trim(),
    });
    setBusy(false);
    if (error) {
      toast.error(t("study.account.mfaCodeInvalid"));
      return;
    }
    setEnroll(null);
    setCode("");
    toast.success(t("study.account.mfaEnabled"));
    void refresh();
  }

  async function removeFactor(id: string) {
    setBusy(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success(t("study.account.mfaDisabled"));
      void refresh();
    }
  }

  return (
    <div className="panel max-w-2xl space-y-5 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={
            verified.length > 0
              ? "flex size-10 items-center justify-center rounded-lg bg-primary/15 text-primary"
              : "flex size-10 items-center justify-center rounded-lg bg-secondary text-muted-foreground"
          }
        >
          {verified.length > 0 ? (
            <ShieldCheck className="size-5" />
          ) : (
            <ShieldAlert className="size-5" />
          )}
        </span>
        <div className="min-w-0">
          <p className="font-semibold">{t("study.account.mfaTitle")}</p>
          <p className="text-sm text-muted-foreground">
            {t("study.account.mfaDesc")}
          </p>
        </div>
        <Badge variant={verified.length > 0 ? "default" : "secondary"} className="ml-auto">
          {factors === null ? t("study.account.mfaLoading") : verified.length > 0 ? t("study.account.mfaOn") : t("study.account.mfaOff")}
        </Badge>
      </div>

      {verified.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {verified.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2.5">
              <Smartphone className="size-4 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm">
                {f.friendly_name || t("study.account.authenticatorDefault")}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={busy}
                onClick={() => void removeFactor(f.id)}
              >
                <Trash2 className="mr-1.5 size-4" />
                {t("study.account.turnOff")}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {!enroll ? (
        <Button onClick={() => void startEnroll()} disabled={busy}>
          {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
          {verified.length > 0 ? t("study.account.addNewDevice") : t("study.account.enableMfa")}
        </Button>
      ) : (
        <form onSubmit={verifyEnroll} className="space-y-4 rounded-lg border border-border p-4">
          <div className="flex flex-wrap items-start gap-4">
            <img
              src={enroll.qr}
              alt={t("study.account.qrAlt")}
              className="size-40 rounded-md bg-white p-2"
            />
            <div className="min-w-0 space-y-2 text-sm">
              <p>{t("study.account.mfaStep1")}</p>
              <p className="text-muted-foreground">{t("study.account.mfaOrManual")}</p>
              <code className="block break-all rounded bg-secondary px-2 py-1 font-mono text-xs">
                {enroll.secret}
              </code>
              <p>{t("study.account.mfaStep2")}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="totp-code">{t("study.account.verificationCode")}</Label>
              <Input
                id="totp-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                placeholder="000000"
                className="w-32 font-mono tracking-[0.3em]"
              />
            </div>
            <Button type="submit" disabled={busy || code.length !== 6}>
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}{t("study.account.confirm")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEnroll(null);
                setCode("");
              }}
            >
              {t("study.account.cancel")}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
