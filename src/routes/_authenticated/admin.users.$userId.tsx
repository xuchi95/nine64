import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { APP } from "@/config/app";
import { useT } from "@/lib/i18n";
import {
  adjustAdminUserRating,
  cancelAdminUserAnonymize,
  exportAdminUserData,
  forceLogoutAdminUser,
  getAdminUser,
  requestAdminUserAnonymize,
  resetAdminUserIdentity,
  sendAdminPasswordRecovery,
  sendAdminUserNotification,
  setAdminUserRole,
  suspendAdminUser,
  unsuspendAdminUser,
} from "@/lib/adminUsers.functions";
import {
  ADMIN_ERROR_MESSAGES,
  LONG_SUSPENSION_HOURS,
  type AdminActionResult,
  type AdminUserDetail,
  type TimelineEntry,
} from "@/lib/admin/userTypes";

export const Route = createFileRoute("/_authenticated/admin/users/$userId")({
  head: () => ({
    meta: [
      { title: `Hồ sơ người dùng · ${APP.name}` },
      { name: "description", content: "Chi tiết tài khoản người dùng trong Trung tâm quản trị Nine64." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: `Hồ sơ người dùng · ${APP.name}` },
      { property: "og:description", content: "Chi tiết tài khoản người dùng Nine64." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminUserDetailPage,
});

type ActionKind =
  | "suspend"
  | "unsuspend"
  | "forceLogout"
  | "recovery"
  | "notify"
  | "resetIdentity"
  | "grantModerator"
  | "revokeModerator"
  | "grantAdmin"
  | "revokeAdmin"
  | "rating"
  | "anonymize"
  | "cancelAnonymize"
  | "export";

/** Actions that force the admin to retype the display name / UUID prefix. */
const TYPED_CONFIRM: ActionKind[] = ["grantAdmin", "revokeAdmin", "rating", "anonymize"];

function Timeline({ items }: { items: TimelineEntry[] }) {
  const { t } = useT();
  if (!items.length)
    return <p className="p-6 text-sm text-muted-foreground">{t("adminc.users.timelineEmpty")}</p>;
  return (
    <ol className="divide-y divide-border/50">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-baseline gap-2 p-3 text-sm">
          <span className="font-mono text-xs text-muted-foreground">
            {new Date(item.at).toLocaleString()}
          </span>
          <span className="font-medium">{item.title}</span>
          {item.detail ? <span className="text-muted-foreground">· {item.detail}</span> : null}
          {item.href ? (
            <Link to={item.href} className="ml-auto text-xs text-primary hover:underline">
              →
            </Link>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function AdminUserDetailPage() {
  const { t } = useT();
  const { userId } = Route.useParams();
  const load = useServerFn(getAdminUser);

  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<ActionKind | null>(null);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [hours, setHours] = useState(24);
  const [newRating, setNewRating] = useState(1500);
  const [notifyTitle, setNotifyTitle] = useState("");
  const [notifyBody, setNotifyBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const suspend = useServerFn(suspendAdminUser);
  const unsuspend = useServerFn(unsuspendAdminUser);
  const forceLogout = useServerFn(forceLogoutAdminUser);
  const recovery = useServerFn(sendAdminPasswordRecovery);
  const notify = useServerFn(sendAdminUserNotification);
  const resetIdentity = useServerFn(resetAdminUserIdentity);
  const setRole = useServerFn(setAdminUserRole);
  const adjustRating = useServerFn(adjustAdminUserRating);
  const requestAnonymize = useServerFn(requestAdminUserAnonymize);
  const cancelAnonymize = useServerFn(cancelAdminUserAnonymize);
  const exportData = useServerFn(exportAdminUserData);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    void load({ data: { userId } })
      .then((d) => setDetail(d as AdminUserDetail))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "UNKNOWN_ERROR"))
      .finally(() => setLoading(false));
  }, [load, userId]);

  useEffect(refresh, [refresh]);

  const closeDialog = () => {
    setAction(null);
    setReason("");
    setConfirmation("");
  };

  const run = async () => {
    if (!action || !detail) return;
    setBusy(true);
    setFeedback(null);
    const version = detail.overview.stateVersion;
    try {
      let res: AdminActionResult | { ok: true; data: Record<string, unknown> };
      switch (action) {
        case "suspend":
          res = await suspend({
            data: { userId, hours, reason, expectedVersion: version, confirmation },
          });
          break;
        case "unsuspend":
          res = await unsuspend({ data: { userId, reason, expectedVersion: version } });
          break;
        case "forceLogout":
          res = await forceLogout({ data: { userId, reason } });
          break;
        case "recovery":
          res = await recovery({ data: { userId, reason } });
          break;
        case "notify":
          res = await notify({ data: { userId, title: notifyTitle, body: notifyBody, reason } });
          break;
        case "resetIdentity":
          res = await resetIdentity({ data: { userId, reason } });
          break;
        case "grantModerator":
        case "revokeModerator":
          res = await setRole({
            data: { userId, role: "moderator", grant: action === "grantModerator", reason },
          });
          break;
        case "grantAdmin":
        case "revokeAdmin":
          res = await setRole({
            data: { userId, role: "admin", grant: action === "grantAdmin", reason, confirmation },
          });
          break;
        case "rating":
          res = await adjustRating({
            data: {
              userId,
              targetRating: newRating,
              reason,
              // Stable key → a retried request never applies the change twice.
              idempotencyKey: `${userId}:${newRating}:${reason.trim().slice(0, 40)}`,
              confirmation,
            },
          });
          break;
        case "anonymize":
          res = await requestAnonymize({
            data: { userId, mode: "anonymize", reason, confirmation, expectedVersion: version },
          });
          break;
        case "cancelAnonymize":
          res = await cancelAnonymize({ data: { userId, reason, expectedVersion: version } });
          break;
        case "export": {
          const out = await exportData({ data: { userId, reason } });
          if ("data" in out && out.ok) {
            const blob = new Blob([JSON.stringify(out.data, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `user-${userId}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }
          res = out as AdminActionResult;
          break;
        }
      }

      if ("ok" in res && res.ok) {
        setFeedback({ ok: true, text: t("adminc.users.success") });
        closeDialog();
        refresh();
      } else {
        const code = "code" in res ? res.code : "UNKNOWN";
        const key = ADMIN_ERROR_MESSAGES[code];
        setFeedback({
          ok: false,
          text: key ? t(key) : t("adminc.users.err.generic").replace("{code}", code),
        });
      }
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : "UNKNOWN";
      const code = Object.keys(ADMIN_ERROR_MESSAGES).find((c) => raw.includes(c)) ?? "UNKNOWN";
      const key = ADMIN_ERROR_MESSAGES[code];
      setFeedback({ ok: false, text: key ? t(key) : t("adminc.users.err.generic").replace("{code}", code) });
    } finally {
      setBusy(false);
    }
  };

  const o = detail?.overview;
  const needsTypedConfirm =
    action !== null &&
    (TYPED_CONFIRM.includes(action) || (action === "suspend" && hours >= LONG_SUSPENSION_HOURS));
  const canSubmit =
    reason.trim().length >= 10 && (!needsTypedConfirm || confirmation.trim().length > 0) && !busy;

  return (
    <AdminShell module="users" title={o?.displayName ?? t("adminc.nav.users")}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin/users">
              <ArrowLeft className="mr-2 size-4" />
              {t("adminc.users.back")}
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="mr-2 size-4" />
            {t("adminc.users.refresh")}
          </Button>
        </div>

        {feedback ? (
          <div
            role="status"
            className={`rounded-lg border p-3 text-sm ${
              feedback.ok
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-destructive/30 bg-destructive/10 text-destructive"
            }`}
          >
            {feedback.text}
          </div>
        ) : null}

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : error || !detail || !o ? (
          <Card>
            <CardContent className="p-6 text-sm text-destructive">
              {error ?? t("adminc.users.err.notFound")}
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-xl">{o.displayName}</CardTitle>
                  <p className="font-mono text-xs text-muted-foreground">{o.userId}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{t(`adminc.users.role.${o.role}`)}</Badge>
                  <Badge variant="outline">{t(`adminc.users.status.${o.status}`)}</Badge>
                  {o.ratingLocked ? <Badge variant="destructive">{t("adminc.users.fp.locked")}</Badge> : null}
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <Info label={t("adminc.users.col.email")} value={o.email ?? "—"} mono />
                <Info label={t("adminc.users.col.created")} value={o.createdAt ? new Date(o.createdAt).toLocaleString() : "—"} />
                <Info label={t("adminc.users.col.lastSignIn")} value={o.lastSignInAt ? new Date(o.lastSignInAt).toLocaleString() : "—"} />
                <Info label={t("adminc.users.col.rating")} value={`${o.rating} (peak ${o.peakRating})`} mono />
                <Info label="RD / σ" value={`${o.ratingDeviation.toFixed(1)} / ${o.volatility.toFixed(3)}`} mono />
                <Info label={t("adminc.users.col.games")} value={`${o.gamesPlayed} · ${o.wins}W ${o.losses}L ${o.draws}D`} mono />
                <Info label={t("adminc.users.col.reports")} value={String(o.reportCount)} mono />
                <Info label={t("adminc.users.fairplay")} value={o.fairplayAction ?? "—"} />
              </CardContent>
            </Card>

            {detail.deletionJob ? (
              <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 p-3 text-sm text-orange-400">
                {t("adminc.users.deletionPending").replace(
                  "{time}",
                  new Date(detail.deletionJob.graceUntil).toLocaleString(),
                )}
              </div>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("adminc.users.actions")}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {(
                  [
                    ["suspend", "adminc.users.action.suspend"],
                    ["unsuspend", "adminc.users.action.unsuspend"],
                    ["forceLogout", "adminc.users.action.forceLogout"],
                    ["recovery", "adminc.users.action.recovery"],
                    ["notify", "adminc.users.action.notify"],
                    ["resetIdentity", "adminc.users.action.resetIdentity"],
                    [o.role === "moderator" ? "revokeModerator" : "grantModerator",
                      o.role === "moderator" ? "adminc.users.action.revokeModerator" : "adminc.users.action.grantModerator"],
                    [o.role === "admin" ? "revokeAdmin" : "grantAdmin",
                      o.role === "admin" ? "adminc.users.action.revokeAdmin" : "adminc.users.action.grantAdmin"],
                    ["rating", "adminc.users.action.rating"],
                    detail.deletionJob
                      ? ["cancelAnonymize", "adminc.users.action.cancelAnonymize"]
                      : ["anonymize", "adminc.users.action.anonymize"],
                    ["export", "adminc.users.action.export"],
                  ] as [ActionKind, string][]
                ).map(([kind, labelKey]) => {
                  const suspended = o.status === "suspended";
                  const disabled =
                    (kind === "suspend" && o.status !== "active") ||
                    (kind === "unsuspend" && !suspended);
                  const variant =
                    kind === "anonymize" || kind === "revokeAdmin"
                      ? "destructive"
                      : kind === "unsuspend" && suspended
                        ? "default"
                        : "outline";
                  return (
                    <Button
                      key={kind}
                      size="sm"
                      variant={variant}
                      disabled={disabled}
                      onClick={() => {
                        setFeedback(null);
                        setAction(kind);
                      }}
                    >
                      {t(labelKey)}
                    </Button>
                  );
                })}
              </CardContent>
            </Card>

            <Tabs defaultValue="overview">
              <TabsList className="flex w-full flex-wrap justify-start">
                <TabsTrigger value="overview">{t("adminc.users.tab.overview")}</TabsTrigger>
                <TabsTrigger value="games">{t("adminc.users.tab.games")}</TabsTrigger>
                <TabsTrigger value="ratings">{t("adminc.users.tab.ratings")}</TabsTrigger>
                <TabsTrigger value="fairplay">{t("adminc.users.tab.fairplay")}</TabsTrigger>
                <TabsTrigger value="reports">{t("adminc.users.tab.reports")}</TabsTrigger>
                <TabsTrigger value="security">{t("adminc.users.tab.security")}</TabsTrigger>
                <TabsTrigger value="notifications">{t("adminc.users.tab.notifications")}</TabsTrigger>
                <TabsTrigger value="admin">{t("adminc.users.tab.admin")}</TabsTrigger>
              </TabsList>
              <Card className="mt-3">
                <TabsContent value="overview">
                  <div className="space-y-2 p-4 text-sm">
                    <p className="text-muted-foreground">{o.reason ?? "—"}</p>
                    <p className="text-muted-foreground">{o.internalNote ?? ""}</p>
                  </div>
                </TabsContent>
                <TabsContent value="games"><Timeline items={detail.games} /></TabsContent>
                <TabsContent value="ratings">
                  <Timeline items={[...detail.ratings, ...detail.adjustments]} />
                </TabsContent>
                <TabsContent value="fairplay"><Timeline items={detail.fairplay} /></TabsContent>
                <TabsContent value="reports"><Timeline items={detail.reports} /></TabsContent>
                <TabsContent value="security"><Timeline items={detail.security} /></TabsContent>
                <TabsContent value="notifications"><Timeline items={detail.notifications} /></TabsContent>
                <TabsContent value="admin"><Timeline items={detail.adminHistory} /></TabsContent>
              </Card>
            </Tabs>
          </>
        )}
      </div>

      <Dialog open={action !== null} onOpenChange={(open) => (open ? null : closeDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("adminc.users.confirmTitle")}</DialogTitle>
            <DialogDescription>
              {action ? t(`adminc.users.action.${action}`) : ""} · {t("adminc.users.confirmWarn")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {action === "suspend" ? (
              <div className="space-y-1">
                <Label htmlFor="hours">{t("adminc.users.durationLabel")}</Label>
                <Input
                  id="hours"
                  type="number"
                  min={1}
                  value={hours}
                  onChange={(e) => setHours(Number(e.target.value))}
                />
                <div className="flex flex-wrap gap-2 pt-1">
                  {[1, 24, 168, 720].map((h) => (
                    <Button key={h} size="sm" variant="ghost" onClick={() => setHours(h)}>
                      {t(`adminc.users.duration.${h}`)}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            {action === "rating" ? (
              <div className="space-y-1">
                <Label htmlFor="rating">{t("adminc.users.newRating")}</Label>
                <Input
                  id="rating"
                  type="number"
                  value={newRating}
                  onChange={(e) => setNewRating(Number(e.target.value))}
                />
              </div>
            ) : null}

            {action === "notify" ? (
              <>
                <div className="space-y-1">
                  <Label htmlFor="ntitle">{t("adminc.users.notifyTitle")}</Label>
                  <Input id="ntitle" value={notifyTitle} onChange={(e) => setNotifyTitle(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="nbody">{t("adminc.users.notifyBody")}</Label>
                  <Textarea id="nbody" value={notifyBody} onChange={(e) => setNotifyBody(e.target.value)} />
                </div>
              </>
            ) : null}

            <div className="space-y-1">
              <Label htmlFor="reason">{t("adminc.users.reasonLabel")}</Label>
              <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>

            {needsTypedConfirm ? (
              <div className="space-y-1">
                <Label htmlFor="confirm">{t("adminc.users.confirmLabel")}</Label>
                <Input id="confirm" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
              </div>
            ) : null}

            {feedback && !feedback.ok ? (
              <p className="text-sm text-destructive">{feedback.text}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog}>
              {t("adminc.users.cancel")}
            </Button>
            <Button disabled={!canSubmit} onClick={() => void run()}>
              {t("adminc.users.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className={mono ? "font-mono text-sm" : "text-sm"}>{value}</p>
    </div>
  );
}
