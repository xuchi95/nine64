import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Mail, Send, CheckCircle } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { submitContactRequest } from "@/lib/contact.functions";
import { TurnstileWidget, resetTurnstile } from "@/components/security/TurnstileWidget";
import { parseRateLimited, rateLimitMessage, isCaptchaFailure, captchaMessage } from "@/lib/ratelimit/errors";
import { pageHead } from "@/lib/seo";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/contact")({
  head: () =>
    pageHead({
      path: "/contact",
      title: "Liên hệ — Nine64",
      description:
        "Gửi yêu cầu hỗ trợ, báo lỗi, góp ý hoặc yêu cầu về dữ liệu cá nhân cho đội ngũ Nine64.",
    }),
  component: ContactPage,
});

function useRequestTypes() {
  const { t } = useT();
  return [
    { value: "support", label: t("study.contact.typeSupport") },
    { value: "data", label: t("study.contact.typeData") },
    { value: "bug", label: t("study.contact.typeBug") },
    { value: "feedback", label: t("study.contact.typeFeedback") },
    { value: "general", label: t("study.contact.typeGeneral") },
  ];
}

function ContactPage() {
  const { t } = useT();
  const REQUEST_TYPES = useRequestTypes();
  const { user } = useAuth();
  const submit = useServerFn(submitContactRequest);

  const [form, setForm] = useState({
    name: (user?.user_metadata?.["full_name"] as string) ?? "",
    email: user?.email ?? "",
    requestType: "support",
    subject: "",
    message: "",
  });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    if (!captchaToken) {
      setStatus("error");
      setErrorMsg(captchaMessage("vi"));
      return;
    }
    try {
      await submit({ data: { ...form, captchaToken, idempotencyKey } as any });
      setStatus("success");
      setForm((f) => ({ ...f, subject: "", message: "" }));
    } catch (err) {
      const limited = parseRateLimited(err);
      setStatus("error");
      setErrorMsg(
        limited
          ? rateLimitMessage(limited, "vi")
          : isCaptchaFailure(err)
            ? captchaMessage("vi")
            : err instanceof Error
              ? err.message
              : t("study.contact.genericError"),
      );
    } finally {
      // Turnstile tokens are single-use: always mint a fresh challenge.
      setCaptchaToken(null);
      setIdempotencyKey(crypto.randomUUID());
      resetTurnstile();
    }
  };

  if (status === "success") {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl py-12 text-center">
          <CheckCircle className="mx-auto size-16 text-primary" />
          <h1 className="mt-6 text-3xl font-bold tracking-tight">{t("study.contact.successTitle")}</h1>
          <p className="mt-3 text-muted-foreground">
            {t("study.contact.successBody")}
          </p>
          <Button className="mt-8" onClick={() => setStatus("idle")}>
            {t("study.contact.sendAnother")}
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("study.contact.title")}</h1>
          <p className="mt-3 text-muted-foreground">
            {t("study.contact.subtitle")}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Mail className="size-5 text-primary" />
              {t("study.contact.sendMessage")}
            </CardTitle>
            <CardDescription>
              {t("study.contact.cardDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">{t("study.contact.fullName")}</Label>
                  <Input
                    id="name"
                    required
                    maxLength={120}
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{t("study.contact.email")}</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    maxLength={255}
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">{t("study.contact.requestType")}</Label>
                <Select
                  value={form.requestType}
                  onValueChange={(v) => setForm((f) => ({ ...f, requestType: v }))}
                >
                  <SelectTrigger id="type">
                    <SelectValue placeholder={t("study.contact.chooseType")} />
                  </SelectTrigger>
                  <SelectContent>
                    {REQUEST_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">{t("study.contact.subject")}</Label>
                <Input
                  id="subject"
                  required
                  maxLength={200}
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">{t("study.contact.message")}</Label>
                <Textarea
                  id="message"
                  required
                  minLength={10}
                  maxLength={5000}
                  rows={6}
                  value={form.message}
                  onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                />
                <p className="text-2xs text-muted-foreground">
                  {t("study.contact.messageHint")}
                </p>
              </div>

              {status === "error" && (
                <p className="text-sm text-destructive">{errorMsg}</p>
              )}

              <Button type="submit" disabled={status === "loading"} className="w-full sm:w-auto">
                {status === "loading" ? (
                  <span className="flex items-center gap-2">
                    <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    {t("study.contact.sending")}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Send className="size-4" />
                    {t("study.contact.send")}
                  </span>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
