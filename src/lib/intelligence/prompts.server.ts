/**
 * AI prompt registry with draft / publish / rollback.
 *
 * The production prompt is never edited in place: admins edit a draft, see a
 * diff and publish with a reason. Model IDs come from a server allowlist, so an
 * admin can never point the coach at an arbitrary endpoint (SSRF).
 */
import { COACH_MODEL, coachSystem } from "@/lib/coach/prompt";

export const PROMPT_KEYS = ["coach_system_vi", "coach_system_en"] as const;
export type PromptKey = (typeof PROMPT_KEYS)[number];

export const ALLOWED_MODELS = [
  "google/gemini-3-flash",
  "google/gemini-3-pro",
  "openai/gpt-5-mini",
] as const;
export type AllowedModel = (typeof ALLOWED_MODELS)[number];

export const PROMPT_MAX_CHARS = 6_000;

export function isPromptKey(key: string): key is PromptKey {
  return (PROMPT_KEYS as readonly string[]).includes(key);
}

export function isAllowedModel(model: string): model is AllowedModel {
  return (ALLOWED_MODELS as readonly string[]).includes(model);
}

export function defaultPromptBody(key: PromptKey): string {
  return coachSystem(key === "coach_system_en" ? "en" : "vi");
}

export interface PromptRow {
  key: PromptKey;
  body: string;
  draftBody: string;
  hasDraft: boolean;
  version: number;
  model: string;
  reason: string | null;
  publishedAt: string;
  draftUpdatedAt: string | null;
}

export interface PromptVersionRow {
  version: number;
  body: string;
  model: string;
  reason: string;
  changedBy: string | null;
  createdAt: string;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function mapRow(row: Record<string, unknown>): PromptRow {
  return {
    key: row["key"] as PromptKey,
    body: String(row["body"]),
    draftBody: String(row["draft_body"]),
    hasDraft: Boolean(row["has_draft"]),
    version: Number(row["version"]),
    model: String(row["model"]),
    reason: (row["reason"] as string | null) ?? null,
    publishedAt: String(row["published_at"]),
    draftUpdatedAt: (row["draft_updated_at"] as string | null) ?? null,
  };
}

let cache: { at: number; rows: PromptRow[] } | null = null;
const TTL_MS = 15_000;

export function invalidatePromptCache(): void {
  cache = null;
}

export async function listPrompts(force = false): Promise<{ rows: PromptRow[]; degraded: boolean }> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return { rows: cache.rows, degraded: false };
  try {
    const db = await admin();
    const { data, error } = await db.from("ai_prompts").select("*").in("key", PROMPT_KEYS as unknown as string[]);
    if (error) throw error;
    const rows = (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
    const present = new Set(rows.map((r) => r.key));
    for (const key of PROMPT_KEYS) {
      if (!present.has(key)) {
        rows.push({
          key,
          body: defaultPromptBody(key),
          draftBody: defaultPromptBody(key),
          hasDraft: false,
          version: 0,
          model: COACH_MODEL,
          reason: null,
          publishedAt: new Date(0).toISOString(),
          draftUpdatedAt: null,
        });
      }
    }
    cache = { at: Date.now(), rows };
    return { rows, degraded: false };
  } catch {
    return {
      rows:
        cache?.rows ??
        PROMPT_KEYS.map((key) => ({
          key,
          body: defaultPromptBody(key),
          draftBody: defaultPromptBody(key),
          hasDraft: false,
          version: 0,
          model: COACH_MODEL,
          reason: null,
          publishedAt: new Date(0).toISOString(),
          draftUpdatedAt: null,
        })),
      degraded: true,
    };
  }
}

/** Published prompt used at runtime; falls back to the code default. */
export async function activePrompt(key: PromptKey): Promise<{ body: string; model: string; version: number }> {
  const { rows } = await listPrompts();
  const row = rows.find((r) => r.key === key);
  if (!row) return { body: defaultPromptBody(key), model: COACH_MODEL, version: 0 };
  const model = isAllowedModel(row.model) ? row.model : COACH_MODEL;
  return { body: row.body || defaultPromptBody(key), model, version: row.version };
}

export interface PromptWriteResult {
  ok: boolean;
  code?: string;
  version?: number;
}

export async function savePromptDraft(args: {
  key: PromptKey;
  body: string;
  model: string;
  actorId: string;
}): Promise<PromptWriteResult> {
  if (args.body.trim().length < 40 || args.body.length > PROMPT_MAX_CHARS) {
    return { ok: false, code: "INVALID_BODY" };
  }
  if (!isAllowedModel(args.model)) return { ok: false, code: "MODEL_NOT_ALLOWED" };

  const db = await admin();
  const { rows } = await listPrompts(true);
  const existing = rows.find((r) => r.key === args.key);
  const { error } = await db.from("ai_prompts").upsert(
    {
      key: args.key,
      body: existing?.version ? existing.body : defaultPromptBody(args.key),
      draft_body: args.body,
      has_draft: true,
      version: existing?.version ?? 0,
      model: args.model,
      updated_by: args.actorId,
      draft_updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "key" },
  );
  invalidatePromptCache();
  return error ? { ok: false, code: "WRITE_FAILED" } : { ok: true, version: existing?.version ?? 0 };
}

export async function publishPrompt(args: {
  key: PromptKey;
  body: string;
  model: string;
  reason: string;
  expectedVersion: number | null;
  actorId: string;
}): Promise<PromptWriteResult> {
  if (args.reason.trim().length < 10) return { ok: false, code: "REASON_REQUIRED" };
  if (args.body.trim().length < 40 || args.body.length > PROMPT_MAX_CHARS) {
    return { ok: false, code: "INVALID_BODY" };
  }
  if (!isAllowedModel(args.model)) return { ok: false, code: "MODEL_NOT_ALLOWED" };

  const db = await admin();
  const { data, error } = await db.rpc("ai_prompt_publish", {
    _key: args.key,
    _body: args.body,
    _model: args.model,
    _reason: args.reason.trim(),
    _expected_version: args.expectedVersion,
    _actor: args.actorId,
  } as never);
  invalidatePromptCache();
  if (error) return { ok: false, code: "WRITE_FAILED" };
  const payload = (data ?? {}) as Record<string, unknown>;
  return payload["ok"]
    ? { ok: true, version: Number(payload["version"]) }
    : { ok: false, code: String(payload["code"] ?? "WRITE_FAILED"), version: Number(payload["version"] ?? 0) };
}

export async function listPromptVersions(key: PromptKey, limit = 50): Promise<PromptVersionRow[]> {
  const db = await admin();
  const { data } = await db
    .from("ai_prompt_versions")
    .select("version, body, model, reason, changed_by, created_at")
    .eq("key", key)
    .order("version", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      version: Number(row["version"]),
      body: String(row["body"]),
      model: String(row["model"]),
      reason: String(row["reason"]),
      changedBy: (row["changed_by"] as string | null) ?? null,
      createdAt: String(row["created_at"]),
    };
  });
}

export async function rollbackPrompt(args: {
  key: PromptKey;
  toVersion: number;
  reason: string;
  expectedVersion: number | null;
  actorId: string;
}): Promise<PromptWriteResult> {
  const versions = await listPromptVersions(args.key, 200);
  const target = versions.find((v) => v.version === args.toVersion);
  if (!target) return { ok: false, code: "VERSION_NOT_FOUND" };
  return publishPrompt({
    key: args.key,
    body: target.body,
    model: target.model,
    reason: args.reason,
    expectedVersion: args.expectedVersion,
    actorId: args.actorId,
  });
}
