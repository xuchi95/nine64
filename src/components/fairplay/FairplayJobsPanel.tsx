import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, ServerCog, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listFairplayJobs, listPlayerReports, retryFairplayJob } from "@/lib/fairplay.functions";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Job {
  id: string;
  game_id: string;
  analyzer_version: string;
  status: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  engine_version: string | null;
  depth: number | null;
  time_budget_ms: number | null;
  claimed_by: string | null;
  queued_at: string;
  finished_at: string | null;
}

interface Complaint {
  id: string;
  reporter_id: string;
  subject_id: string;
  game_id: string;
  reason: string;
  note: string | null;
  status: string;
  created_at: string;
}

const statusTone: Record<string, string> = {
  queued: "text-muted-foreground",
  running: "text-warning",
  succeeded: "text-success",
  failed: "text-destructive",
};

/**
 * Machine evidence pipeline (left) and player complaints (right). The two are
 * deliberately kept apart: a complaint is never evidence.
 */
export function FairplayJobsPanel() {
  const { t } = useT();
  const jobsFn = useServerFn(listFairplayJobs);
  const reportsFn = useServerFn(listPlayerReports);
  const retryFn = useServerFn(retryFairplayJob);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [workerStatus, setWorkerStatus] = useState<"configured" | "not_configured" | null>(null);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [jobsResult, reportRows] = await Promise.all([jobsFn({ data: {} }), reportsFn({ data: {} })]);
      const payload = jobsResult as { workerStatus: "configured" | "not_configured"; jobs: Job[] };
      setJobs(payload.jobs);
      setWorkerStatus(payload.workerStatus);
      setComplaints(reportRows as Complaint[]);
    } catch {
      setJobs([]);
    } finally {
      setBusy(false);
    }
  }, [jobsFn, reportsFn]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ServerCog className="size-4" />
            {t("admin.jobs.title")}
          </CardTitle>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-xs",
                workerStatus === "configured" ? "text-success" : "text-warning",
              )}
            >
              {workerStatus === "configured" ? t("admin.jobs.workerReady") : t("admin.jobs.workerMissing")}
            </span>
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => void load()}>
              <RefreshCw className={cn("mr-2 size-4", busy && "animate-spin")} />
              {t("admin.fairplay.refresh")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {jobs.length === 0 && <p className="text-muted-foreground">{t("admin.jobs.empty")}</p>}
          {jobs.map((job) => (
            <div key={job.id} className="rounded border border-border/60 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className={cn("font-medium", statusTone[job.status] ?? "")}>
                  {t(`admin.jobs.status.${job.status}`)}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void retryFn({ data: { jobId: job.id } })
                      .then(() => load())
                      .finally(() => setBusy(false));
                  }}
                >
                  {t("admin.jobs.retry")}
                </Button>
              </div>
              <p className="font-mono text-xs text-muted-foreground">{job.game_id}</p>
              <p className="text-xs text-muted-foreground">
                {t("admin.jobs.meta", {
                  analyzer: job.analyzer_version,
                  engine: job.engine_version ?? "—",
                  depth: job.depth ?? "—",
                  attempts: `${job.attempts}/${job.max_attempts}`,
                })}
              </p>
              {job.last_error && <p className="text-xs text-destructive">{job.last_error}</p>}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Flag className="size-4" />
            {t("admin.complaints.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-xs text-muted-foreground">{t("admin.complaints.hint")}</p>
          {complaints.length === 0 && <p className="text-muted-foreground">{t("admin.complaints.empty")}</p>}
          {complaints.map((row) => (
            <div key={row.id} className="rounded border border-border/60 p-2">
              <p className="font-medium">{t(`game.report.reason.${row.reason}`)}</p>
              <p className="font-mono text-xs text-muted-foreground">{row.subject_id}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(row.created_at).toLocaleString("vi-VN")}
              </p>
              {row.note && <p className="mt-1 text-xs">{row.note}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
