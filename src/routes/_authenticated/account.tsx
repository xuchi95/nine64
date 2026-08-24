import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  KeyRound,
  Loader2,
  Mail,
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Trash2,
  User,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { APP } from "@/config/app";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { FormSkeleton } from "@/components/layout/PageSkeleton";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [
      { title: `Tài khoản & bảo mật — ${APP.name}` },
      {
        name: "description",
        content:
          "Quản lý hồ sơ, email, mật khẩu và xác thực hai bước TOTP cho tài khoản Nexus Chess của bạn.",
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

const SECTIONS = [
  { value: "profile", label: "Hồ sơ", hint: "Tên hiển thị", icon: User },
  { value: "email", label: "Email", hint: "Địa chỉ đăng nhập", icon: Mail },
  { value: "password", label: "Mật khẩu", hint: "Đổi mật khẩu", icon: KeyRound },
  { value: "mfa", label: "Xác thực 2 bước", hint: "TOTP", icon: ShieldCheck },
] as const;

function AccountPage() {
  const { user } = useAuth();
  const name =
    (user?.user_metadata?.["display_name"] as string | undefined) ||
    user?.email?.split("@")[0] ||
    "Player";
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
            <p className="font-mono text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground">
              Tài khoản &amp; bảo mật
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
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState(
    (user?.user_metadata?.["display_name"] as string | undefined) ?? "",
  );
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const name = displayName.trim();
    if (name.length < 2 || name.length > 32) {
      toast.error("Tên hiển thị cần 2–32 ký tự.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ data: { display_name: name } });
    if (!error) {
      await supabase.from("profiles").update({ display_name: name }).eq("id", user!.id);
    }
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Đã cập nhật hồ sơ.");
  }

  return (
    <form onSubmit={save} className="panel max-w-2xl space-y-5 p-6">
      <SectionHead title="Hồ sơ" desc="Tên này xuất hiện trên bàn cờ và bảng xếp hạng." />
      <div className="space-y-2">
        <Label htmlFor="display-name">Tên hiển thị</Label>
        <Input
          id="display-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={32}
          placeholder="Nexus player"
        />
      </div>
      <Button type="submit" disabled={busy}>
        {busy && <Loader2 className="mr-2 size-4 animate-spin" />}Lưu hồ sơ
      </Button>
    </form>
  );
}

function EmailCard() {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const next = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next) || next.length > 255) {
      toast.error("Email không hợp lệ.");
      return;
    }
    if (next === user?.email) {
      toast.error("Email mới trùng email hiện tại.");
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
      toast.success("Đã gửi email xác nhận tới địa chỉ mới. Hãy bấm liên kết để hoàn tất.");
    }
  }

  return (
    <form onSubmit={save} className="panel max-w-2xl space-y-5 p-6">
      <SectionHead title="Email" desc="Đổi địa chỉ đăng nhập, cần xác nhận qua liên kết." />
      <div className="space-y-2">
        <Label>Email hiện tại</Label>
        <Input value={user?.email ?? ""} disabled />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-email">Email mới</Label>
        <Input
          id="new-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="ban@example.com"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Chúng tôi sẽ gửi liên kết xác nhận. Email chỉ đổi sau khi bạn xác nhận.
      </p>
      <Button type="submit" disabled={busy}>
        {busy && <Loader2 className="mr-2 size-4 animate-spin" />}Đổi email
      </Button>
    </form>
  );
}

function PasswordCard() {
  const { user } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 8) {
      toast.error("Mật khẩu mới cần tối thiểu 8 ký tự.");
      return;
    }
    if (next !== confirm) {
      toast.error("Xác nhận mật khẩu không khớp.");
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
        toast.error("Mật khẩu hiện tại không đúng.");
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
      toast.success("Đã đổi mật khẩu.");
    }
  }

  return (
    <form onSubmit={save} className="panel max-w-xl space-y-4 p-5">
      <div className="space-y-2">
        <Label htmlFor="cur-pass">Mật khẩu hiện tại</Label>
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
        <Label htmlFor="new-pass">Mật khẩu mới</Label>
        <Input
          id="new-pass"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-pass">Nhập lại mật khẩu mới</Label>
        <Input
          id="confirm-pass"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      <Button type="submit" disabled={busy}>
        {busy && <Loader2 className="mr-2 size-4 animate-spin" />}Cập nhật mật khẩu
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
      toast.error(error?.message ?? "Không tạo được mã TOTP.");
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
      toast.error(challenge.error?.message ?? "Không tạo được phiên xác thực.");
      return;
    }
    const { error } = await supabase.auth.mfa.verify({
      factorId: enroll.id,
      challengeId: challenge.data.id,
      code: code.trim(),
    });
    setBusy(false);
    if (error) {
      toast.error("Mã không đúng hoặc đã hết hạn.");
      return;
    }
    setEnroll(null);
    setCode("");
    toast.success("Đã bật xác thực hai bước.");
    void refresh();
  }

  async function removeFactor(id: string) {
    setBusy(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Đã tắt thiết bị xác thực.");
      void refresh();
    }
  }

  return (
    <div className="panel max-w-2xl space-y-5 p-5">
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
          <p className="font-semibold">Xác thực hai bước (TOTP)</p>
          <p className="text-sm text-muted-foreground">
            Dùng Google Authenticator, Authy hoặc 1Password để tạo mã 6 số khi đăng nhập.
          </p>
        </div>
        <Badge variant={verified.length > 0 ? "default" : "secondary"} className="ml-auto">
          {factors === null ? "Đang tải" : verified.length > 0 ? "Đang bật" : "Chưa bật"}
        </Badge>
      </div>

      {verified.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {verified.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2.5">
              <Smartphone className="size-4 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm">
                {f.friendly_name || "Authenticator"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={busy}
                onClick={() => void removeFactor(f.id)}
              >
                <Trash2 className="mr-1.5 size-4" />
                Tắt
              </Button>
            </li>
          ))}
        </ul>
      )}

      {!enroll ? (
        <Button onClick={() => void startEnroll()} disabled={busy}>
          {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
          {verified.length > 0 ? "Thêm thiết bị mới" : "Bật xác thực hai bước"}
        </Button>
      ) : (
        <form onSubmit={verifyEnroll} className="space-y-4 rounded-lg border border-border p-4">
          <div className="flex flex-wrap items-start gap-4">
            <img
              src={enroll.qr}
              alt="Mã QR để thêm tài khoản vào ứng dụng xác thực"
              className="size-40 rounded-md bg-white p-2"
            />
            <div className="min-w-0 space-y-2 text-sm">
              <p>1. Quét mã QR bằng ứng dụng xác thực.</p>
              <p className="text-muted-foreground">Hoặc nhập khoá thủ công:</p>
              <code className="block break-all rounded bg-secondary px-2 py-1 font-mono text-xs">
                {enroll.secret}
              </code>
              <p>2. Nhập mã 6 số hiện trên ứng dụng.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="totp-code">Mã xác thực</Label>
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
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}Xác nhận
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEnroll(null);
                setCode("");
              }}
            >
              Huỷ
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
