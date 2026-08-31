/**
 * Admin surface for Opening Lab: dataset versions, ECO definitions, import
 * jobs and explorer cache metrics. Admin role is re-checked server-side.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Row = Record<string, unknown>;

type RoleRpc = {
  rpc: (fn: "has_role", args: { _user_id: string; _role: "admin" }) => PromiseLike<{ data: unknown }>;
};

async function assertOpeningAdmin(context: { supabase: RoleRpc; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (data !== true) throw new Error("Forbidden");
}

export const adminOpeningsOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOpeningAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ecoSummary, ECO_DATASET } = await import("./eco.server");

    const [datasets, jobs, health, cacheCount] = await Promise.all([
      supabaseAdmin.from("opening_datasets").select("*").order("created_at"),
      supabaseAdmin.from("opening_import_jobs").select("*").order("created_at", { ascending: false }).limit(20),
      supabaseAdmin.from("opening_explorer_health").select("*"),
      supabaseAdmin.from("opening_explorer_cache").select("cache_key", { count: "exact", head: true }),
    ]);

    const eco = ecoSummary();
    return {
      embedded: {
        slug: ECO_DATASET.slug,
        name: ECO_DATASET.name,
        version: ECO_DATASET.version,
        license: ECO_DATASET.license,
        attribution: ECO_DATASET.attribution,
        sourceUrl: ECO_DATASET.sourceUrl,
        lines: ECO_DATASET.count,
        codes: eco.length,
      },
      ecoCodes: eco.slice(0, 60),
      datasets: ((datasets.data ?? []) as Row[]).map((d) => ({
        id: String(d["id"]),
        slug: String(d["slug"]),
        name: String(d["name"]),
        version: String(d["version"] ?? ""),
        license: String(d["license"] ?? ""),
        attribution: String(d["attribution"] ?? ""),
        sourceUrl: String(d["source_url"] ?? ""),
        ecoCount: Number(d["eco_count"] ?? 0),
        active: d["active"] !== false,
        notes: String(d["notes"] ?? ""),
        updatedAt: String(d["updated_at"] ?? ""),
      })),
      jobs: ((jobs.data ?? []) as Row[]).map((j) => ({
        id: String(j["id"]),
        kind: String(j["kind"] ?? ""),
        status: String(j["status"] ?? ""),
        processed: Number(j["processed"] ?? 0),
        failed: Number(j["failed"] ?? 0),
        lastError: (j["last_error"] as string | null) ?? null,
        createdAt: String(j["created_at"] ?? ""),
      })),
      cache: {
        rows: cacheCount.count ?? 0,
        sources: ((health.data ?? []) as Row[]).map((h) => {
          const requests = Number(h["requests"] ?? 0);
          const hits = Number(h["hits"] ?? 0);
          return {
            source: String(h["source"]),
            requests,
            hits,
            misses: Number(h["misses"] ?? 0),
            errors: Number(h["errors"] ?? 0),
            timeouts: Number(h["timeouts"] ?? 0),
            rateLimited: Number(h["rate_limited"] ?? 0),
            breakerTrips: Number(h["breaker_trips"] ?? 0),
            hitRate: requests > 0 ? hits / requests : 0,
            avgLatencyMs: requests > 0 ? Math.round(Number(h["total_latency_ms"] ?? 0) / requests) : 0,
            openUntil: (h["open_until"] as string | null) ?? null,
            lastError: (h["last_error"] as string | null) ?? null,
            updatedAt: String(h["updated_at"] ?? ""),
          };
        }),
      },
    };
  });

export const adminSaveOpeningDataset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        slug: z.string().min(2).max(64),
        name: z.string().min(2).max(160),
        version: z.string().max(40).default(""),
        license: z.string().max(80).default(""),
        attribution: z.string().max(200).default(""),
        sourceUrl: z.string().max(300).default(""),
        notes: z.string().max(1000).default(""),
        active: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOpeningAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("opening_datasets").upsert(
      {
        slug: data.slug,
        name: data.name,
        version: data.version,
        license: data.license,
        attribution: data.attribution,
        source_url: data.sourceUrl,
        notes: data.notes,
        active: data.active,
        updated_by: context.userId,
      } as never,
      { onConflict: "slug" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Records an import job. The embedded ECO book ships with the build, so a
 * refresh job only re-stamps the dataset row with the built-in count — no
 * proprietary database is ever imported.
 */
export const adminRunOpeningImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ kind: z.enum(["eco_refresh", "cache_purge"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOpeningAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ECO_DATASET } = await import("./eco.server");

    const { data: job } = await supabaseAdmin
      .from("opening_import_jobs")
      .insert({ kind: data.kind, status: "running", requested_by: context.userId } as never)
      .select("id")
      .single();
    const jobId = job ? String((job as Row)["id"]) : null;

    let processed = 0;
    let lastError: string | null = null;
    try {
      if (data.kind === "eco_refresh") {
        const { error } = await supabaseAdmin
          .from("opening_datasets")
          .update({ eco_count: ECO_DATASET.count, version: ECO_DATASET.version } as never)
          .eq("slug", ECO_DATASET.slug);
        if (error) throw new Error(error.message);
        processed = ECO_DATASET.count;
      } else {
        const { count } = await supabaseAdmin
          .from("opening_explorer_cache")
          .select("cache_key", { count: "exact", head: true });
        await supabaseAdmin.from("opening_explorer_cache").delete().neq("cache_key", "");
        processed = count ?? 0;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : "unknown";
    }

    if (jobId) {
      await supabaseAdmin
        .from("opening_import_jobs")
        .update({
          status: lastError ? "failed" : "done",
          processed,
          failed: lastError ? 1 : 0,
          last_error: lastError,
        } as never)
        .eq("id", jobId);
    }
    if (lastError) throw new Error(lastError);
    return { processed };
  });

export const adminResetExplorerBreaker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ source: z.string().max(40) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertOpeningAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("opening_explorer_health")
      .update({ open_until: null, consecutive_failures: 0, last_error: null } as never)
      .eq("source", data.source);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
