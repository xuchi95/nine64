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
import { pageHead } from "@/lib/seo";

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

const REQUEST_TYPES = [
  { value: "support", label: "Hỗ trợ chung" },
  { value: "data", label: "Yêu cầu dữ liệu cá nhân" },
  { value: "bug", label: "Báo lỗi" },
  { value: "feedback", label: "Góp ý" },
  { value: "general", label: "Khác" },
];

function ContactPage() {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    try {
      await submit({ data: form as any });
      setStatus("success");
      setForm((f) => ({ ...f, subject: "", message: "" }));
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Đã xảy ra lỗi. Vui lòng thử lại.");
    }
  };

  if (status === "success") {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl py-12 text-center">
          <CheckCircle className="mx-auto size-16 text-primary" />
          <h1 className="mt-6 text-3xl font-bold tracking-tight">Đã gửi yêu cầu</h1>
          <p className="mt-3 text-muted-foreground">
            Cảm ơn bạn đã liên hệ. Đội ngũ Nine64 sẽ phản hồi qua email trong thời gian sớm nhất.
          </p>
          <Button className="mt-8" onClick={() => setStatus("idle")}>
            Gửi yêu cầu khác
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Liên hệ</h1>
          <p className="mt-3 text-muted-foreground">
            Gửi yêu cầu hỗ trợ, báo lỗi, góp ý hoặc yêu cầu về dữ liệu cá nhân.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Mail className="size-5 text-primary" />
              Gửi tin nhắn
            </CardTitle>
            <CardDescription>
              Chúng tôi lưu yêu cầu của bạn và phản hồi qua email đã cung cấp.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Họ tên</Label>
                  <Input
                    id="name"
                    required
                    maxLength={120}
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
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
                <Label htmlFor="type">Loại yêu cầu</Label>
                <Select
                  value={form.requestType}
                  onValueChange={(v) => setForm((f) => ({ ...f, requestType: v }))}
                >
                  <SelectTrigger id="type">
                    <SelectValue placeholder="Chọn loại yêu cầu" />
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
                <Label htmlFor="subject">Tiêu đề</Label>
                <Input
                  id="subject"
                  required
                  maxLength={200}
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Nội dung</Label>
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
                  Tối thiểu 10 ký tự. Tối đa 5.000 ký tự.
                </p>
              </div>

              {status === "error" && (
                <p className="text-sm text-destructive">{errorMsg}</p>
              )}

              <Button type="submit" disabled={status === "loading"} className="w-full sm:w-auto">
                {status === "loading" ? (
                  <span className="flex items-center gap-2">
                    <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Đang gửi...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Send className="size-4" />
                    Gửi yêu cầu
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
