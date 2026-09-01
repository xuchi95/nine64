/**
 * Engine profile store — read path with a short cache, plus the admin
 * draft/publish/rollback write path. Server-only.
 *
 * The database is authoritative, but every value is re-validated against
 * `engineConfigSchema` on read; an invalid or unreachable row falls back to
 * the code default (`TITAN_FALLBACK_CONFIG`), never to a permissive guess.
 */
import {
  TITAN_FALLBACK_CONFIG,
  TITAN_SLUG,
  engineConfigSchema,
  parseEngineConfig,
  type EngineConfig,
  type EngineProfile,
  type EngineProfileStatus,
} from "./profileTypes";

const CACHE_MS = 15_000;
let cache: { rows: EngineProfile[]; fetchedAt: number } | null = null;

export function invalidateEngineProfileCache(): void {
  cache = null;
}

function mapRow(r: Record<string, unknown>): EngineProfile {
  return {
    slug: String(r["slug"]),
    name: String(r["name"]),
    runtime: r["runtime"] === "cloud" ? "cloud" : "browser",
    enabled: Boolean(r["enabled"]),
    isPublic: Boolean(r["is_public"]),
    status: (r["status"] as EngineProfileStatus) ?? "draft",
    stockfishVersion: String(r["stockfish_version"] ?? "unknown"),
    config: parseEngineConfig(r["config"]),
    draftConfig: parseEngineConfig(r["draft_config"] ?? r["config"]),
    hasDraft: Boolean(r["has_draft"]),
    version: Number(r["version"] ?? 1),
    reason: (r["reason"] as string | null) ?? null,
    publishedAt: String(r["published_at"] ?? new Date(0).toISOString()),
    updatedBy: (r["updated_by"] as string | null) ?? null,
  };
}

export async function listEngineProfiles(force = false): Promise<{ rows: EngineProfile[]; degraded: boolean }> {
  if (!force && cache && Date.now() - cache.fetchedAt < CACHE_MS) {
    return { rows: cache.rows, degraded: false };
  }
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("engine_profiles").select("*").order("slug");
    if (error) throw new Error(error.message);
    const rows = (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
    cache = { rows, fetchedAt: Date.now() };
    return { rows, degraded: false };
  } catch {
    return { rows: cache?.rows ?? [], degraded: true };
  }
}

/** The Titan profile as the play path should use it (published config only). */
export async function titanProfile(): Promise<{
  slug: string;
  name: string;
  enabled: boolean;
  config: EngineConfig;
  version: number;
  stockfishVersion: string;
  source: "database" | "fallback";
}> {
  const { rows } = await listEngineProfiles();
  const row = rows.find((r) => r.slug === TITAN_SLUG);
  if (!row) {
    return {
      slug: TITAN_SLUG,
      name: "Nine64 Titan",
      enabled: false,
      config: TITAN_FALLBACK_CONFIG,
      version: 0,
      stockfishVersion: "unknown",
      source: "fallback",
    };
  }
  return {
    slug: row.slug,
    name: row.name,
    enabled: row.enabled && row.status !== "disabled",
    config: row.config,
    version: row.version,
    stockfishVersion: row.stockfishVersion,
    source: "database",
  };
}

/** Full profile row (including its draft config) by slug. */
export async function getEngineProfile(slug: string): Promise<EngineProfile | null> {
  const { rows } = await listEngineProfiles();
  return rows.find((r) => r.slug === slug) ?? null;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function ensureTitanProfile(): Promise<void> {
  const db = await admin();
  const { data } = await db.from("engine_profiles").select("slug").eq("slug", TITAN_SLUG).maybeSingle();
  if (data) return;
  await db.from("engine_profiles").insert({
    slug: TITAN_SLUG,
    name: "Nine64 Titan",
    runtime: "cloud",
    enabled: false,
    is_public: true,
    status: "draft",
    stockfish_version: "Stockfish 18 (official)",
    config: TITAN_FALLBACK_CONFIG as unknown as Record<string, unknown>,
    draft_config: TITAN_FALLBACK_CONFIG as unknown as Record<string, unknown>,
  } as never);
  invalidateEngineProfileCache();
}

export interface WriteResult {
  ok: boolean;
  code?: string;
  version?: number;
  message?: string;
}

export async function saveProfileDraft(
  slug: string,
  config: unknown,
  expectedVersion: number | null,
): Promise<WriteResult> {
  const parsed = engineConfigSchema.safeParse(config);
  if (!parsed.success) return { ok: false, code: "INVALID_CONFIG", message: parsed.error.message };
  const db = await admin();
  const { data: current, error: readErr } = await db
    .from("engine_profiles")
    .select("version")
    .eq("slug", slug)
    .maybeSingle();
  if (readErr || !current) return { ok: false, code: "NOT_FOUND" };
  if (expectedVersion !== null && Number(current.version) !== expectedVersion) {
    return { ok: false, code: "VERSION_CONFLICT", version: Number(current.version) };
  }
  const { error } = await db
    .from("engine_profiles")
    .update({
      draft_config: parsed.data as unknown as Record<string, unknown>,
      has_draft: true,
      draft_updated_at: new Date().toISOString(),
    } as never)
    .eq("slug", slug);
  if (error) return { ok: false, code: "WRITE_FAILED", message: error.message };
  invalidateEngineProfileCache();
  return { ok: true, version: Number(current.version) };
}

export async function publishProfile(args: {
  slug: string;
  config: unknown;
  status: EngineProfileStatus;
  enabled: boolean;
  reason: string;
  actorId: string;
  expectedVersion: number | null;
  benchmarkId?: string | null;
  stockfishVersion?: string | null;
}): Promise<WriteResult & { before?: EngineProfile }> {
  const parsed = engineConfigSchema.safeParse(args.config);
  if (!parsed.success) return { ok: false, code: "INVALID_CONFIG", message: parsed.error.message };
  const db = await admin();
  const { data: row } = await db.from("engine_profiles").select("*").eq("slug", args.slug).maybeSingle();
  if (!row) return { ok: false, code: "NOT_FOUND" };
  const before = mapRow(row as Record<string, unknown>);
  if (args.expectedVersion !== null && before.version !== args.expectedVersion) {
    return { ok: false, code: "VERSION_CONFLICT", version: before.version, before };
  }
  // Version bump + history row happen in one database transaction.
  const { data, error } = await db.rpc("engine_profile_publish", {
    _slug: args.slug,
    _config: parsed.data as unknown as Record<string, unknown>,
    _status: args.status,
    _enabled: args.enabled,
    _reason: args.reason,
    _actor: args.actorId,
    _expected_version: args.expectedVersion,
    _benchmark_id: args.benchmarkId ?? null,
    _stockfish_version: args.stockfishVersion ?? null,
  } as never);
  invalidateEngineProfileCache();
  if (error) return { ok: false, code: "WRITE_FAILED", message: error.message, before };
  const payload = (data ?? {}) as Record<string, unknown>;
  if (!payload["ok"]) {
    return {
      ok: false,
      code: String(payload["code"] ?? "WRITE_FAILED"),
      version: Number(payload["version"] ?? before.version),
      before,
    };
  }
  return { ok: true, version: Number(payload["version"]), before };
}


export interface ProfileVersionRow {
  version: number;
  slug: string;
  status: string;
  enabled: boolean;
  config: EngineConfig;
  reason: string;
  changedBy: string | null;
  createdAt: string;
  benchmarkId: string | null;
}

export async function listProfileVersions(slug: string, limit = 50): Promise<ProfileVersionRow[]> {
  const db = await admin();
  const { data } = await db
    .from("engine_profile_versions")
    .select("*")
    .eq("slug", slug)
    .order("version", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      version: Number(row["version"]),
      slug: String(row["slug"]),
      status: String(row["status"]),
      enabled: Boolean(row["enabled"]),
      config: parseEngineConfig(row["config"]),
      reason: String(row["reason"] ?? ""),
      changedBy: (row["changed_by"] as string | null) ?? null,
      createdAt: String(row["created_at"]),
      benchmarkId: (row["benchmark_id"] as string | null) ?? null,
    };
  });
}

/**
 * Emergency kill switch: new sessions are refused immediately.
 * Goes through the same versioned publish path so the change is auditable and
 * appears in version history like any other profile change.
 */
export async function emergencyDisable(slug: string, actorId: string, reason: string): Promise<WriteResult> {
  if (reason.trim().length < 10) return { ok: false, code: "REASON_REQUIRED" };
  const { rows } = await listEngineProfiles(true);
  const current = rows.find((r) => r.slug === slug);
  if (!current) return { ok: false, code: "NOT_FOUND" };
  return publishProfile({
    slug,
    config: current.config,
    status: "disabled",
    enabled: false,
    reason: reason.trim(),
    actorId,
    expectedVersion: current.version,
  });
}

