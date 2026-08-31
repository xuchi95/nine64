/**
 * System health probes.
 *
 * Every probe is independent and self-contained: one failing probe degrades
 * only its own card, never the page. A probe that cannot actually be verified
 * reports `unknown` or `not_configured` — never a fake green.
 *
 * Server-only module.
 */

export type HealthState =
  | "healthy"
  | "degraded"
  | "unavailable"
  | "not_configured"
  | "unknown";

export interface HealthCheck {
  id: string;
  state: HealthState;
  /** Sanitized, human readable detail. Never contains secrets. */
  detail: string;
  latencyMs: number | null;
  metrics?: Record<string, number | string>;
}

const env = () => process.env as Record<string, string | undefined>;
const configured = (name: string) => Boolean((env()[name] ?? "").trim());

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const started = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - started };
}

async function probe(id: string, fn: () => Promise<Omit<HealthCheck, "id" | "latencyMs">>): Promise<HealthCheck> {
  const started = Date.now();
  try {
    const partial = await fn();
    return { id, latencyMs: Date.now() - started, ...partial };
  } catch (err) {
    return {
      id,
      state: "unavailable",
      detail: err instanceof Error ? err.message.slice(0, 200) : "probe_failed",
      latencyMs: Date.now() - started,
    };
  }
}

export async function runHealthChecks(): Promise<{
  checks: HealthCheck[];
  environment: { name: string; configured: boolean; group: "public" | "server" }[];
  build: { version: string | null; commit: string | null; deployedAt: string | null; mode: string };
  generatedAt: string;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { PUBLIC_ENV_VARS, SERVER_ENV_VARS } = await import("@/lib/security/env");

  const checks = await Promise.all([
    // --- database ------------------------------------------------------
    probe("database", async () => {
      const { ms } = await timed(async () => {
        const { error } = await supabaseAdmin
          .from("profiles")
          .select("id", { count: "exact", head: true });
        if (error) throw new Error(error.message);
      });
      return {
        state: ms > 1500 ? "degraded" : "healthy",
        detail: `round-trip ${ms}ms`,
        metrics: { roundTripMs: ms },
      };
    }),

    // --- auth ----------------------------------------------------------
    probe("auth", async () => {
      if (!configured("SUPABASE_SERVICE_ROLE_KEY")) {
        return { state: "not_configured", detail: "service credentials missing" };
      }
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
      if (error) throw new Error(error.message);
      return { state: "healthy", detail: `auth admin API reachable (${data.users.length} sample)` };
    }),

    // --- realtime ------------------------------------------------------
    probe("realtime", async () => {
      if (!configured("SUPABASE_URL") && !configured("VITE_SUPABASE_URL")) {
        return { state: "not_configured", detail: "backend URL missing" };
      }
      // Realtime is a browser websocket transport; the server can only confirm
      // that the endpoint is configured and that recent live traffic exists.
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count, error } = await supabaseAdmin
        .from("game_moves")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since);
      if (error) throw new Error(error.message);
      return {
        state: "unknown",
        detail: `endpoint configured; ${count ?? 0} moves broadcast in the last hour`,
        metrics: { movesLastHour: count ?? 0 },
      };
    }),

    // --- notification outbox --------------------------------------------
    probe("notifications", async () => {
      const [queued, failed, stuck] = await Promise.all([
        supabaseAdmin
          .from("notification_outbox")
          .select("id", { count: "exact", head: true })
          .eq("status", "queued"),
        supabaseAdmin
          .from("notification_outbox")
          .select("id", { count: "exact", head: true })
          .eq("status", "failed"),
        supabaseAdmin
          .from("notification_outbox")
          .select("id", { count: "exact", head: true })
          .eq("status", "queued")
          .lt("available_at", new Date(Date.now() - 5 * 60 * 1000).toISOString()),
      ]);
      const q = queued.count ?? 0;
      const f = failed.count ?? 0;
      const s = stuck.count ?? 0;
      return {
        state: f > 0 || s > 0 ? "degraded" : "healthy",
        detail: `${q} queued · ${s} overdue · ${f} dead-lettered`,
        metrics: { queued: q, overdue: s, failed: f },
      };
    }),

    // --- rate limit storage ----------------------------------------------
    probe("ratelimit", async () => {
      if (!configured("RATE_LIMIT_SALT")) {
        return { state: "not_configured", detail: "limiter salt missing — buckets are unsalted" };
      }
      const { count, error } = await supabaseAdmin
        .from("rate_limit_counters")
        .select("bucket_key", { count: "exact", head: true });
      if (error) throw new Error(error.message);
      return {
        state: "healthy",
        detail: `${count ?? 0} counter rows`,
        metrics: { buckets: count ?? 0 },
      };
    }),

    // --- timeout finalizer -----------------------------------------------
    probe("timeouts", async () => {
      const { count, error } = await supabaseAdmin
        .from("games")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .lt("turn_started_at", new Date(Date.now() - 30 * 60 * 1000).toISOString());
      if (error) throw new Error(error.message);
      const overdue = count ?? 0;
      return {
        state: overdue > 0 ? "degraded" : "healthy",
        detail: overdue > 0 ? `${overdue} game(s) past their clock` : "no overdue clocks",
        metrics: { overdue },
      };
    }),

    // --- fair play worker --------------------------------------------------
    probe("fairplay_worker", async () => {
      const [queued, failed, recent] = await Promise.all([
        supabaseAdmin
          .from("fairplay_jobs")
          .select("id", { count: "exact", head: true })
          .eq("status", "queued"),
        supabaseAdmin
          .from("fairplay_jobs")
          .select("id", { count: "exact", head: true })
          .eq("status", "failed"),
        supabaseAdmin
          .from("fairplay_jobs")
          .select("id", { count: "exact", head: true })
          .eq("status", "done")
          .gte("finished_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      ]);
      const q = queued.count ?? 0;
      const f = failed.count ?? 0;
      const done = recent.count ?? 0;
      if (!configured("FAIRPLAY_WORKER_URL") && !configured("FAIRPLAY_WORKER_TOKEN")) {
        return {
          state: q > 0 ? "degraded" : "not_configured",
          detail: `worker endpoint not configured · ${q} job(s) waiting`,
          metrics: { queued: q, failed: f, done24h: done },
        };
      }
      return {
        state: f > 0 ? "degraded" : "healthy",
        detail: `${q} queued · ${done} finished in 24h · ${f} failed`,
        metrics: { queued: q, failed: f, done24h: done },
      };
    }),

    // --- AI gateway ---------------------------------------------------------
    probe("ai_gateway", async () => {
      if (!configured("LOVABLE_API_KEY")) {
        return { state: "not_configured", detail: "AI gateway key missing" };
      }
      return { state: "unknown", detail: "key configured — no live call made from this page" };
    }),

    // --- cloud engine --------------------------------------------------------
    probe("cloud_engine", async () => {
      if (!configured("CLOUD_ENGINE_URL")) {
        return { state: "not_configured", detail: "cloud engine endpoint not configured" };
      }
      return { state: "unknown", detail: "endpoint configured — probe runs in the engine module" };
    }),

    // --- queue latency --------------------------------------------------------
    probe("queue_latency", async () => {
      const { data, error } = await supabaseAdmin
        .from("matchmaking_queue")
        .select("created_at")
        .eq("status", "waiting")
        .order("created_at", { ascending: true })
        .limit(1);
      if (error) throw new Error(error.message);
      const oldest = data?.[0]?.created_at as string | undefined;
      const waitS = oldest ? Math.round((Date.now() - new Date(oldest).getTime()) / 1000) : 0;
      return {
        state: waitS > 300 ? "degraded" : "healthy",
        detail: oldest ? `oldest waiting player ${waitS}s` : "queue empty",
        metrics: { oldestWaitSeconds: waitS },
      };
    }),

    // --- error rate ------------------------------------------------------------
    probe("error_rate", async () => {
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count, error } = await supabaseAdmin
        .from("security_events")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since);
      if (error) throw new Error(error.message);
      const n = count ?? 0;
      return {
        state: n > 200 ? "degraded" : "healthy",
        detail: `${n} security/error event(s) in the last hour`,
        metrics: { lastHour: n },
      };
    }),
  ]);

  const e = env();
  const environment = [
    ...PUBLIC_ENV_VARS.map((name) => ({
      name,
      configured: Boolean((e[name] ?? "").trim()),
      group: "public" as const,
    })),
    ...SERVER_ENV_VARS.map((name) => ({
      name,
      configured: Boolean((e[name] ?? "").trim()),
      group: "server" as const,
    })),
  ];

  return {
    checks,
    environment,
    build: {
      version: e["APP_VERSION"] ?? null,
      commit: e["COMMIT_SHA"] ?? e["CF_PAGES_COMMIT_SHA"] ?? null,
      deployedAt: e["DEPLOYED_AT"] ?? null,
      mode: e["NODE_ENV"] ?? "development",
    },
    generatedAt: new Date().toISOString(),
  };
}
