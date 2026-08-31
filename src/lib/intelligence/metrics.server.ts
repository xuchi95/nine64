/**
 * AI Coach usage/health metrics from data the app already records.
 * Nothing is estimated: when a source table is unavailable the field is null
 * and the UI shows "unknown" rather than a fabricated number.
 */
async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export interface CoachMetrics {
  windowHours: number;
  requests: number | null;
  failures: number | null;
  rateLimited: number | null;
  paymentRequired: number | null;
  avgLatencyMs: number | null;
  available: boolean;
}

export async function coachUsageMetrics(windowHours = 24): Promise<CoachMetrics> {
  const since = new Date(Date.now() - windowHours * 3_600_000).toISOString();
  try {
    const db = await admin();
    const { data, error } = await db
      .from("security_events")
      .select("kind, error_code, detail")
      .gte("created_at", since)
      .eq("resource", "coach")
      .limit(2000);
    if (error) throw error;
    const rows = (data ?? []) as { kind: string; error_code: string | null; detail: unknown }[];
    const latencies = rows
      .map((r) => Number((r.detail as Record<string, unknown> | null)?.["latencyMs"] ?? NaN))
      .filter((n) => Number.isFinite(n));
    return {
      windowHours,
      requests: rows.length,
      failures: rows.filter((r) => r.kind === "error").length,
      rateLimited: rows.filter((r) => r.error_code === "429").length,
      paymentRequired: rows.filter((r) => r.error_code === "402").length,
      avgLatencyMs: latencies.length
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : null,
      available: true,
    };
  } catch {
    return {
      windowHours,
      requests: null,
      failures: null,
      rateLimited: null,
      paymentRequired: null,
      avgLatencyMs: null,
      available: false,
    };
  }
}
