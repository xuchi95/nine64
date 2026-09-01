import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, ShieldCheck, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { useT, type Locale } from "@/lib/i18n";
import { pageHead } from "@/lib/seo";
import {
  exportMyData,
  getMyDataRightsStatus,
  requestMyAccountDeletion,
  cancelMyAccountDeletion,
  type DataRightsStatus,
} from "@/lib/dataRights.functions";

export const Route = createFileRoute("/data-rights")({
  head: () =>
    pageHead({
      path: "/data-rights",
      title: "Quyền dữ liệu — Nine64",
      description:
        "Xuất toàn bộ dữ liệu ván đấu, hồ sơ và tiến độ học tập của bạn, hoặc yêu cầu xoá/ẩn danh tài khoản Nine64 đúng theo chính sách bảo mật.",
    }),
  component: DataRightsPage,
});

const COPY: Record<Locale, Record<string, string>> = {
  vi: {
    title: "Quyền dữ liệu",
    lead: "Bạn kiểm soát dữ liệu của mình trên Nine64. Tại đây bạn có thể tải bản sao đầy đủ dữ liệu cá nhân hoặc yêu cầu xoá tài khoản, đúng như mô tả trong Chính sách bảo mật.",
    signInTitle: "Cần đăng nhập",
    signInDesc: "Đăng nhập để xác minh danh tính trước khi xuất hoặc xoá dữ liệu.",
    signIn: "Đăng nhập",
    exportTitle: "Xuất dữ liệu ván đấu",
    exportDesc:
      "Tệp JSON gồm hồ sơ, ván đấu trực tuyến, ván ngoại tuyến đã đồng bộ, lịch sử câu đố, biến động hệ số Glicko-2, tiến độ học tập và thông báo.",
    exportBtn: "Tải bản sao dữ liệu (JSON)",
    exporting: "Đang chuẩn bị tệp…",
    exportDone: "Đã tải xuống bản sao dữ liệu của bạn.",
    deleteTitle: "Yêu cầu xoá dữ liệu",
    deleteDesc:
      "Yêu cầu có 72 giờ chờ để bạn có thể huỷ. Sau đó dữ liệu định danh cá nhân sẽ được xoá hoặc ẩn danh trong vòng 30 ngày, trừ dữ liệu phải giữ theo pháp luật hoặc hồ sơ Fair Play.",
    modeLabel: "Hình thức",
    modeAnonymize: "Ẩn danh — giữ ván đấu nhưng gỡ mọi thông tin định danh",
    modeDelete: "Xoá hoàn toàn — gỡ tài khoản và dữ liệu cá nhân",
    reasonLabel: "Lý do (tối thiểu 10 ký tự)",
    reasonPlaceholder: "Cho chúng tôi biết vì sao bạn muốn xoá dữ liệu…",
    confirmLabel: 'Nhập "DELETE" để xác nhận',
    submit: "Gửi yêu cầu xoá",
    submitting: "Đang gửi…",
    pendingTitle: "Yêu cầu xoá đang chờ xử lý",
    pendingUntil: "Có thể huỷ trước",
    cancel: "Huỷ yêu cầu",
    cancelled: "Đã huỷ yêu cầu xoá dữ liệu.",
    errAlready: "Bạn đã có một yêu cầu xoá đang chờ xử lý.",
    errConfirm: 'Xác nhận chưa đúng. Hãy nhập chính xác "DELETE".',
    errGeneric: "Không thể xử lý yêu cầu. Vui lòng thử lại sau.",
    privacy: "Chính sách bảo mật",
    contact: "Liên hệ hỗ trợ",
    footer:
      "Cần hỗ trợ thêm? Gửi yêu cầu qua trang Liên hệ; chúng tôi phản hồi yêu cầu về dữ liệu trong vòng 30 ngày.",
  },
  en: {
    title: "Data rights",
    lead: "You control your data on Nine64. Download a full copy of your personal data or request account deletion, exactly as described in our Privacy Policy.",
    signInTitle: "Sign-in required",
    signInDesc: "Sign in so we can verify your identity before exporting or deleting data.",
    signIn: "Sign in",
    exportTitle: "Export your game data",
    exportDesc:
      "A JSON file with your profile, online games, synced offline games, puzzle history, Glicko-2 rating events, learning progress and notifications.",
    exportBtn: "Download my data (JSON)",
    exporting: "Preparing your file…",
    exportDone: "Your data copy has been downloaded.",
    deleteTitle: "Request data deletion",
    deleteDesc:
      "Requests have a 72-hour grace period you can cancel. After that, personally identifying data is erased or anonymised within 30 days, except data we must keep for legal or Fair Play reasons.",
    modeLabel: "Mode",
    modeAnonymize: "Anonymise — keep games but strip identifying information",
    modeDelete: "Full deletion — remove the account and personal data",
    reasonLabel: "Reason (at least 10 characters)",
    reasonPlaceholder: "Tell us why you want your data removed…",
    confirmLabel: 'Type "DELETE" to confirm',
    submit: "Submit deletion request",
    submitting: "Submitting…",
    pendingTitle: "Deletion request pending",
    pendingUntil: "Cancellable until",
    cancel: "Cancel request",
    cancelled: "Your deletion request was cancelled.",
    errAlready: "You already have a pending deletion request.",
    errConfirm: 'Confirmation did not match. Type "DELETE" exactly.',
    errGeneric: "We could not process the request. Please try again later.",
    privacy: "Privacy Policy",
    contact: "Contact support",
    footer:
      "Need more help? Send a request through the Contact page; we answer data requests within 30 days.",
  },
};

function DataRightsPage() {
  const { locale } = useT();
  const c = COPY[locale];
  const { user, isLoading } = useAuth();

  const runExport = useServerFn(exportMyData);
  const loadStatus = useServerFn(getMyDataRightsStatus);
  const requestDeletion = useServerFn(requestMyAccountDeletion);
  const cancelDeletion = useServerFn(cancelMyAccountDeletion);

  const [status, setStatus] = useState<DataRightsStatus["pending"]>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState("");
  const [mode, setMode] = useState<"anonymize" | "delete">("anonymize");
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const res = await loadStatus({});
      setStatus(res.pending);
    } catch {
      /* status is informational only */
    }
  }, [user, loadStatus]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleExport = async () => {
    setExporting(true);
    setExportMsg("");
    setError("");
    try {
      const payload = await runExport({});
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nine64-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportMsg(c["exportDone"]!);
    } catch {
      setError(c["errGeneric"]!);
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await requestDeletion({ data: { mode, reason, confirmation } });
      if (!res.ok) {
        setError(
          res.code === "ALREADY_PENDING"
            ? c["errAlready"]!
            : res.code === "CONFIRMATION_MISMATCH"
              ? c["errConfirm"]!
              : c["errGeneric"]!,
        );
      } else {
        setReason("");
        setConfirmation("");
        await refresh();
      }
    } catch {
      setError(c["errGeneric"]!);
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await cancelDeletion({});
      if (res.ok) {
        setNotice(c["cancelled"]!);
        await refresh();
      } else setError(c["errGeneric"]!);
    } catch {
      setError(c["errGeneric"]!);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <header className="space-y-3">
          <div className="flex items-center gap-2 text-primary">
            <ShieldCheck className="h-5 w-5" />
            <span className="text-xs font-mono uppercase tracking-[0.2em]">Nine64</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{c["title"]}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{c["lead"]}</p>
          <div className="flex flex-wrap gap-4 text-sm">
            <Link to="/privacy" className="underline underline-offset-4 hover:text-primary">
              {c["privacy"]}
            </Link>
            <Link to="/contact" className="underline underline-offset-4 hover:text-primary">
              {c["contact"]}
            </Link>
          </div>
        </header>

        {!isLoading && !user ? (
          <Card>
            <CardHeader>
              <CardTitle>{c["signInTitle"]}</CardTitle>
              <CardDescription>{c["signInDesc"]}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link to="/auth/login">{c["signIn"]}</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {user ? (
          <>
            {error ? (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}
            {notice ? (
              <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                {notice}
              </div>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="h-4 w-4" /> {c["exportTitle"]}
                </CardTitle>
                <CardDescription>{c["exportDesc"]}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button onClick={handleExport} disabled={exporting}>
                  {exporting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {c["exporting"]}
                    </>
                  ) : (
                    c["exportBtn"]
                  )}
                </Button>
                {exportMsg ? (
                  <p className="text-sm text-muted-foreground">{exportMsg}</p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4" /> {c["deleteTitle"]}
                </CardTitle>
                <CardDescription>{c["deleteDesc"]}</CardDescription>
              </CardHeader>
              <CardContent>
                {status ? (
                  <div className="space-y-3">
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                      <p className="font-medium">{c["pendingTitle"]}</p>
                      <p className="text-muted-foreground">
                        {c["pendingUntil"]}:{" "}
                        {new Date(status.graceUntil).toLocaleString(
                          locale === "vi" ? "vi-VN" : "en-GB",
                        )}
                      </p>
                    </div>
                    <Button variant="outline" onClick={handleCancel} disabled={busy}>
                      {c["cancel"]}
                    </Button>
                  </div>
                ) : (
                  <form className="space-y-4" onSubmit={handleDelete}>
                    <div className="space-y-2">
                      <Label>{c["modeLabel"]}</Label>
                      <div className="space-y-2 text-sm">
                        {(["anonymize", "delete"] as const).map((m) => (
                          <label key={m} className="flex items-start gap-2">
                            <input
                              type="radio"
                              name="mode"
                              className="mt-1 accent-primary"
                              checked={mode === m}
                              onChange={() => setMode(m)}
                            />
                            <span>
                              {m === "anonymize" ? c["modeAnonymize"] : c["modeDelete"]}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dr-reason">{c["reasonLabel"]}</Label>
                      <Textarea
                        id="dr-reason"
                        required
                        minLength={10}
                        maxLength={500}
                        value={reason}
                        placeholder={c["reasonPlaceholder"]}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dr-confirm">{c["confirmLabel"]}</Label>
                      <Input
                        id="dr-confirm"
                        required
                        value={confirmation}
                        onChange={(e) => setConfirmation(e.target.value)}
                        placeholder="DELETE"
                      />
                    </div>
                    <Button type="submit" variant="destructive" disabled={busy}>
                      {busy ? c["submitting"] : c["submit"]}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground">{c["footer"]}</p>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
