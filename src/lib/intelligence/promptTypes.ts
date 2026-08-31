/** Client-safe AI prompt contracts. */
export const PROMPT_KEYS = ["coach_system_vi", "coach_system_en"] as const;
export type PromptKey = (typeof PROMPT_KEYS)[number];

/** Server allowlist — an admin can never enter a raw model ID or endpoint. */
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
