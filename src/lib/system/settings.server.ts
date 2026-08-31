/**
 * Runtime system settings — read path with a short cache, and the admin
 * draft/publish/rollback write path.
 *
 * Server-only module (never import from a component or from the module scope
 * of a `*.functions.ts` file).
 *
 * Read semantics:
 *  - values are validated against the registry; anything invalid falls back to
 *    the code default (never to a permissive guess),
 *  - when the database is unreachable we keep serving the last known good
 *    snapshot for non fail-closed keys, and the code default for fail-closed
 *    ones, so a database blip can never silently open a gate,
 *  - a 15s in-process cache keeps React renders and server functions off the
 *    database; publishing invalidates it immediately.
 */
import {
  SETTING_KEYS,
  defaultSettings,
  parseSettingValue,
  publicSettingKeys,
  settingDefinition,
  type SettingKey,
  type SettingValues,
} from "./registry";

export const SETTINGS_CACHE_MS = 15_000;

interface Snapshot {
  values: SettingValues;
  versions: Record<string, number>;
  fetchedAt: number;
  degraded: boolean;
}

let cache: Snapshot | null = null;
let lastKnownGood: Snapshot | null = null;

export function invalidateSettingsCache(): void {
  cache = null;
}

/** Test seam. */
export function __setSettingsCacheForTests(snapshot: Snapshot | null): void {
  cache = snapshot;
  lastKnownGood = snapshot;
}

export interface SettingRow {
  key: SettingKey;
  scope: string;
  value: unknown;
  draftValue: unknown;
  hasDraft: boolean;
  version: number;
  reason: string | null;
  publishedAt: string;
  draftUpdatedAt: string | null;
  updatedBy: string | null;
  valid: boolean;
}

async function fetchRows(): Promise<
  { ok: true; rows: SettingRow[] } | { ok: false; error: string }
> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("system_settings")
      .select(
        "key, scope, value, draft_value, has_draft, version, reason, published_at, draft_updated_at, updated_by",
      );
    if (error) return { ok: false, error: error.message };
    const rows: SettingRow[] = [];
    for (const r of data ?? []) {
      const key = r.key as string;
      if (!SETTING_KEYS.includes(key as SettingKey)) continue; // ignore stray keys
      const typed = key as SettingKey;
      rows.push({
        key: typed,
        scope: r.scope as string,
        value: r.value,
        draftValue: r.draft_value ?? null,
        hasDraft: Boolean(r.has_draft),
        version: r.version as number,
        reason: (r.reason as string | null) ?? null,
        publishedAt: r.published_at as string,
        draftUpdatedAt: (r.draft_updated_at as string | null) ?? null,
        updatedBy: (r.updated_by as string | null) ?? null,
        valid: parseSettingValue(typed, r.value) !== null,
      });
    }
    return { ok: true, rows };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "settings_read_failed" };
  }
}

/** Effective published values. Never throws. */
export async function loadSettings(): Promise<Snapshot> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < SETTINGS_CACHE_MS) return cache;

  const result = await fetchRows();
  if (!result.ok) {
    // Degraded: keep last known good for tolerant keys, force defaults for
    // fail-closed keys so nothing dangerous stays enabled by accident.
    const base = defaultSettings();
    const values = { ...base } as Record<string, unknown>;
    if (lastKnownGood) {
      for (const key of SETTING_KEYS) {
        if (!settingDefinition(key).failClosed) values[key] = lastKnownGood.values[key];
      }
    }
    const degradedSnapshot: Snapshot = {
      values: values as SettingValues,
      versions: lastKnownGood?.versions ?? {},
      fetchedAt: now,
      degraded: true,
    };
    cache = degradedSnapshot;
    return degradedSnapshot;
  }

  const values = defaultSettings() as unknown as Record<string, unknown>;
  const versions: Record<string, number> = {};
  for (const row of result.rows) {
    const parsed = parseSettingValue(row.key, row.value);
    if (parsed !== null) values[row.key] = parsed;
    versions[row.key] = row.version;
  }
  const snapshot: Snapshot = {
    values: values as SettingValues,
    versions,
    fetchedAt: now,
    degraded: false,
  };
  cache = snapshot;
  lastKnownGood = snapshot;
  return snapshot;
}

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValues[K]> {
  const snapshot = await loadSettings();
  return snapshot.values[key];
}

/** Only the browser-safe subset. Server-only keys never leave the server. */
export async function getPublicRuntimeSettings(): Promise<{
  values: Record<string, unknown>;
  degraded: boolean;
}> {
  const snapshot = await loadSettings();
  const out: Record<string, unknown> = {};
  for (const key of publicSettingKeys()) out[key] = snapshot.values[key];
  return { values: out, degraded: snapshot.degraded };
}

/** Full admin view: current value, pending draft, version and validity. */
export async function listSettingsForAdmin(): Promise<{
  rows: SettingRow[];
  degraded: boolean;
  error?: string;
}> {
  const result = await fetchRows();
  const stored = new Map<string, SettingRow>();
  if (result.ok) for (const r of result.rows) stored.set(r.key, r);

  const rows: SettingRow[] = SETTING_KEYS.map((key) => {
    const existing = stored.get(key);
    if (existing) return existing;
    const d = settingDefinition(key);
    return {
      key,
      scope: d.scope,
      value: d.default,
      draftValue: null,
      hasDraft: false,
      version: 0,
      reason: null,
      publishedAt: "",
      draftUpdatedAt: null,
      updatedBy: null,
      valid: true,
    };
  });

  return result.ok
    ? { rows, degraded: false }
    : { rows, degraded: true, error: result.error };
}

export interface SettingHistoryRow {
  id: string;
  key: string;
  version: number;
  value: unknown;
  previousValue: unknown;
  reason: string;
  changedBy: string | null;
  rollbackOf: number | null;
  createdAt: string;
}

export async function listSettingHistory(
  key: SettingKey | null,
  limit = 50,
): Promise<SettingHistoryRow[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let query = supabaseAdmin
    .from("system_setting_versions")
    .select("id, key, version, value, previous_value, reason, changed_by, rollback_of, created_at")
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 200));
  if (key) query = query.eq("key", key);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    key: r.key as string,
    version: r.version as number,
    value: r.value,
    previousValue: r.previous_value ?? null,
    reason: r.reason as string,
    changedBy: (r.changed_by as string | null) ?? null,
    rollbackOf: (r.rollback_of as number | null) ?? null,
    createdAt: r.created_at as string,
  }));
}

export type WriteResult =
  | { ok: true; version: number }
  | { ok: false; code: "INVALID_VALUE" | "VERSION_CONFLICT" | "REASON_TOO_SHORT" | "WRITE_FAILED"; message?: string; version?: number };

async function callRpc(fn: string, args: Record<string, unknown>): Promise<WriteResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (
    supabaseAdmin.rpc as unknown as (
      f: string,
      a: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>
  )(fn, args);
  if (error) return { ok: false, code: "WRITE_FAILED", message: error.message };
  const res = (data ?? {}) as { ok?: boolean; code?: string; version?: number };
  if (!res.ok) {
    return {
      ok: false,
      code: (res.code as WriteResult extends { code: infer C } ? C : never) ?? "WRITE_FAILED",
      ...(res.version !== undefined ? { version: res.version } : {}),
    } as WriteResult;
  }
  return { ok: true, version: res.version ?? 1 };
}

/** Store a draft — no runtime effect until it is published. */
export async function saveDraft(
  key: SettingKey,
  value: unknown,
  actorId: string,
  expectedVersion: number | null,
): Promise<WriteResult> {
  const parsed = parseSettingValue(key, value);
  if (parsed === null) return { ok: false, code: "INVALID_VALUE" };
  const d = settingDefinition(key);
  return callRpc("admin_save_setting_draft", {
    _key: key,
    _scope: d.scope,
    _draft: parsed,
    _actor: actorId,
    ...(expectedVersion !== null ? { _expected_version: expectedVersion } : {}),
  });
}

/** Publish a value (draft or explicit) and invalidate the runtime cache. */
export async function publishSetting(
  key: SettingKey,
  value: unknown,
  reason: string,
  actorId: string,
  expectedVersion: number | null,
  rollbackOf?: number,
): Promise<WriteResult> {
  const parsed = parseSettingValue(key, value);
  if (parsed === null) return { ok: false, code: "INVALID_VALUE" };
  if (reason.trim().length < 10) return { ok: false, code: "REASON_TOO_SHORT" };
  const d = settingDefinition(key);
  const result = await callRpc("admin_publish_setting", {
    _key: key,
    _scope: d.scope,
    _value: parsed,
    _reason: reason.trim(),
    _actor: actorId,
    ...(expectedVersion !== null ? { _expected_version: expectedVersion } : {}),
    ...(rollbackOf !== undefined ? { _rollback_of: rollbackOf } : {}),
  });
  if (result.ok) invalidateSettingsCache();
  return result;
}
