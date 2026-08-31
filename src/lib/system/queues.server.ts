/**
 * Queue / job operations for the admin system console.
 *
 * Only the four fixed queues below can be inspected or acted on. There is no
 * free-form SQL and no caller-supplied RPC name: the action is an enum and the
 * mapping to a database call lives here on the server.
 *
 * Server-only module.
 */

import { QUEUE_IDS, type QueueId } from "./queueTypes";

export { QUEUE_IDS };
export type { QueueId };

export interface QueueSummary {
  id: QueueId;
  counts: Record<string, number>;
  oldestPendingAt: string | null;
  supportsRetry: boolean;
  supportsProcessNow: boolean;
  supportsCancel: boolean;
}

export interface QueueJobRow {
  id: string;
  status: string;
  attempts: number | null;
  /** Truncated + credential-free. */
  error: string | null;
  createdAt: string;
  reference: string | null;
}

function sanitizeError(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  return value
    .replace(/(sb_[a-z]+_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_.-]{20,}|Bearer\s+\S+)/g, "[redacted]")
    .slice(0, 300);
}

export async function listQueues(): Promise<QueueSummary[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const summary = async (
    id: QueueId,
    table: "fairplay_jobs" | "notification_outbox" | "account_deletion_jobs",
    statuses: string[],
    orderColumn: string,
    caps: { retry: boolean; processNow: boolean; cancel: boolean },
  ): Promise<QueueSummary> => {
    const counts: Record<string, number> = {};
    await Promise.all(
      statuses.map(async (status) => {
        const { count } = await supabaseAdmin
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq("status", status);
        counts[status] = count ?? 0;
      }),
    );
    const { data } = await supabaseAdmin
      .from(table)
      .select(`id, ${orderColumn}`)
      .in("status", statuses.filter((s) => s !== "done" && s !== "delivered"))
      .order(orderColumn, { ascending: true })
      .limit(1);
    const oldest = (data?.[0] as Record<string, unknown> | undefined)?.[orderColumn];
    return {
      id,
      counts,
      oldestPendingAt: typeof oldest === "string" ? oldest : null,
      supportsRetry: caps.retry,
      supportsProcessNow: caps.processNow,
      supportsCancel: caps.cancel,
    };
  };

  const results = await Promise.allSettled([
    summary("fairplay_jobs", "fairplay_jobs", ["queued", "running", "failed", "done"], "queued_at", {
      retry: true,
      processNow: false,
      cancel: false,
    }),
    summary(
      "notification_outbox",
      "notification_outbox",
      ["queued", "processing", "failed", "delivered"],
      "available_at",
      { retry: true, processNow: true, cancel: false },
    ),
    (async (): Promise<QueueSummary> => {
      const { count } = await supabaseAdmin
        .from("games")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .lt("turn_started_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());
      return {
        id: "timeout_finalizer",
        counts: { overdue: count ?? 0 },
        oldestPendingAt: null,
        supportsRetry: false,
        supportsProcessNow: true,
        supportsCancel: false,
      };
    })(),
    summary(
      "account_deletion",
      "account_deletion_jobs",
      ["pending", "processing", "failed", "done", "cancelled"],
      "grace_until",
      { retry: true, processNow: false, cancel: true },
    ),
  ]);

  return results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : {
          id: QUEUE_IDS[i] as QueueId,
          counts: {},
          oldestPendingAt: null,
          supportsRetry: false,
          supportsProcessNow: false,
          supportsCancel: false,
        },
  );
}

export async function listQueueJobs(queue: QueueId, limit = 25): Promise<QueueJobRow[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const cap = Math.min(Math.max(limit, 1), 100);

  if (queue === "fairplay_jobs") {
    const { data, error } = await supabaseAdmin
      .from("fairplay_jobs")
      .select("id, status, attempts, last_error, queued_at, game_id")
      .in("status", ["queued", "running", "failed"])
      .order("queued_at", { ascending: true })
      .limit(cap);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id as string,
      status: r.status as string,
      attempts: r.attempts as number,
      error: sanitizeError(r.last_error),
      createdAt: r.queued_at as string,
      reference: (r.game_id as string | null) ?? null,
    }));
  }

  if (queue === "notification_outbox") {
    const { data, error } = await supabaseAdmin
      .from("notification_outbox")
      .select("id, status, attempts, last_error, created_at, event_type")
      .in("status", ["queued", "processing", "failed"])
      .order("available_at", { ascending: true })
      .limit(cap);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id as string,
      status: r.status as string,
      attempts: r.attempts as number,
      error: sanitizeError(r.last_error),
      createdAt: r.created_at as string,
      reference: (r.event_type as string | null) ?? null,
    }));
  }

  if (queue === "account_deletion") {
    const { data, error } = await supabaseAdmin
      .from("account_deletion_jobs")
      .select("id, status, last_error, created_at, mode")
      .in("status", ["pending", "processing", "failed"])
      .order("created_at", { ascending: true })
      .limit(cap);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id as string,
      status: r.status as string,
      attempts: null,
      error: sanitizeError(r.last_error),
      createdAt: r.created_at as string,
      reference: (r.mode as string | null) ?? null,
    }));
  }

  // timeout_finalizer — the "jobs" are overdue games.
  const { data, error } = await supabaseAdmin
    .from("games")
    .select("id, status, turn_started_at")
    .eq("status", "active")
    .lt("turn_started_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .order("turn_started_at", { ascending: true })
    .limit(cap);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    status: "overdue",
    attempts: null,
    error: null,
    createdAt: (r.turn_started_at as string | null) ?? "",
    reference: r.id as string,
  }));
}

export type QueueAction = "retry" | "retry_failed" | "process_now" | "cancel";

export interface QueueActionResult {
  ok: boolean;
  affected: number;
  code?: string;
}

const RETRY_BATCH_CAP = 50;

/** Perform a bounded, idempotent operation on one of the fixed queues. */
export async function runQueueAction(
  queue: QueueId,
  action: QueueAction,
  jobId?: string,
): Promise<QueueActionResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rpc = supabaseAdmin.rpc as unknown as (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

  if (queue === "fairplay_jobs") {
    if (action === "retry" && jobId) {
      const { error } = await rpc("fairplay_retry_job", { _job_id: jobId });
      if (error) return { ok: false, affected: 0, code: error.message };
      return { ok: true, affected: 1 };
    }
    if (action === "retry_failed") {
      const { data, error } = await supabaseAdmin
        .from("fairplay_jobs")
        .select("id")
        .eq("status", "failed")
        .limit(RETRY_BATCH_CAP);
      if (error) return { ok: false, affected: 0, code: error.message };
      let affected = 0;
      for (const row of data ?? []) {
        const { error: e } = await rpc("fairplay_retry_job", { _job_id: row.id });
        if (!e) affected += 1;
      }
      return { ok: true, affected };
    }
    return { ok: false, affected: 0, code: "UNSUPPORTED" };
  }

  if (queue === "notification_outbox") {
    if (action === "retry" && jobId) {
      const { error } = await rpc("retry_notification_event", { _id: jobId });
      if (error) return { ok: false, affected: 0, code: error.message };
      return { ok: true, affected: 1 };
    }
    if (action === "retry_failed") {
      const { data, error } = await supabaseAdmin
        .from("notification_outbox")
        .select("id")
        .eq("status", "failed")
        .limit(RETRY_BATCH_CAP);
      if (error) return { ok: false, affected: 0, code: error.message };
      let affected = 0;
      for (const row of data ?? []) {
        const { error: e } = await rpc("retry_notification_event", { _id: row.id });
        if (!e) affected += 1;
      }
      return { ok: true, affected };
    }
    if (action === "process_now") {
      const { data, error } = await rpc("process_notification_outbox", { _limit: 100 });
      if (error) return { ok: false, affected: 0, code: error.message };
      const res = (data ?? {}) as { delivered?: number; processed?: number };
      return { ok: true, affected: res.delivered ?? res.processed ?? 0 };
    }
    return { ok: false, affected: 0, code: "UNSUPPORTED" };
  }

  if (queue === "timeout_finalizer") {
    if (action === "process_now") {
      const { data, error } = await rpc("finalize_expired_games", { _limit: 50 });
      if (error) return { ok: false, affected: 0, code: error.message };
      const res = (data ?? {}) as { finalized?: number };
      return { ok: true, affected: res.finalized ?? 0 };
    }
    return { ok: false, affected: 0, code: "UNSUPPORTED" };
  }

  // account_deletion
  if (action === "retry" && jobId) {
    const { error } = await supabaseAdmin
      .from("account_deletion_jobs")
      .update({ status: "pending", last_error: null })
      .eq("id", jobId)
      .eq("status", "failed");
    if (error) return { ok: false, affected: 0, code: error.message };
    return { ok: true, affected: 1 };
  }
  if (action === "cancel" && jobId) {
    const { error } = await supabaseAdmin
      .from("account_deletion_jobs")
      .update({ status: "cancelled" })
      .eq("id", jobId)
      .in("status", ["pending", "failed"]);
    if (error) return { ok: false, affected: 0, code: error.message };
    return { ok: true, affected: 1 };
  }
  return { ok: false, affected: 0, code: "UNSUPPORTED" };
}
