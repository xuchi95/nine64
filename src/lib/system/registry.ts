/**
 * Typed system-settings registry.
 *
 * This is the single source of truth for what can be configured at runtime.
 * There is deliberately NO arbitrary key/value editor: a key that is not in
 * this allowlist can never be stored, published or read, and no secret-shaped
 * value (API key, service-role key, token, private key) is representable here.
 *
 * Client-safe module: contains only schemas, defaults and labels.
 */
import { z } from "zod";

/** JSON-serializable setting value (safe across the server-function boundary). */
export type SettingJson =
  | string
  | number
  | boolean
  | null
  | SettingJson[]
  | { [key: string]: SettingJson };

export type SettingScope = "public_runtime" | "server_only";
export type SettingGroup = "features" | "operations" | "limits" | "content";

export interface SettingDefinition<T = unknown> {
  key: string;
  scope: SettingScope;
  group: SettingGroup;
  schema: z.ZodType<T>;
  default: T;
  /** UI control hint. */
  control: "boolean" | "number" | "text" | "textarea" | "select" | "flags";
  min?: number;
  max?: number;
  options?: readonly string[];
  /** Fail closed: when the database is unreachable the safe default wins and
   *  the value is never optimistically assumed to be permissive. */
  failClosed: boolean;
  /** Turning this on/off has broad user impact → typed confirmation in the UI. */
  highImpact?: boolean;
}

function def<T>(d: SettingDefinition<T>): SettingDefinition<T> {
  return d;
}

const bool = z.boolean();
const text = z.string().max(400);

export const SETTING_REGISTRY = {
  maintenance_mode: def({
    key: "maintenance_mode",
    scope: "public_runtime",
    group: "operations",
    schema: bool,
    default: false,
    control: "boolean",
    failClosed: true,
    highImpact: true,
  }),
  maintenance_message: def({
    key: "maintenance_message",
    scope: "public_runtime",
    group: "content",
    schema: text,
    default: "Nine64 đang bảo trì ngắn. Vui lòng quay lại sau ít phút.",
    control: "textarea",
    failClosed: false,
  }),
  registration_enabled: def({
    key: "registration_enabled",
    scope: "public_runtime",
    group: "features",
    schema: bool,
    default: true,
    control: "boolean",
    failClosed: true,
    highImpact: true,
  }),
  login_enabled: def({
    key: "login_enabled",
    scope: "public_runtime",
    group: "features",
    schema: bool,
    default: true,
    control: "boolean",
    failClosed: true,
    highImpact: true,
  }),
  matchmaking_enabled: def({
    key: "matchmaking_enabled",
    scope: "public_runtime",
    group: "features",
    schema: bool,
    default: true,
    control: "boolean",
    failClosed: true,
    highImpact: true,
  }),
  rated_games_enabled: def({
    key: "rated_games_enabled",
    scope: "public_runtime",
    group: "features",
    schema: bool,
    default: true,
    control: "boolean",
    failClosed: true,
    highImpact: true,
  }),
  local_games_enabled: def({
    key: "local_games_enabled",
    scope: "public_runtime",
    group: "features",
    schema: bool,
    default: true,
    control: "boolean",
    failClosed: false,
  }),
  ai_coach_enabled: def({
    key: "ai_coach_enabled",
    scope: "public_runtime",
    group: "features",
    schema: bool,
    default: true,
    control: "boolean",
    failClosed: true,
  }),
  quick_review_enabled: def({
    key: "quick_review_enabled",
    scope: "public_runtime",
    group: "features",
    schema: bool,
    default: true,
    control: "boolean",
    failClosed: false,
  }),
  deep_review_enabled: def({
    key: "deep_review_enabled",
    scope: "public_runtime",
    group: "features",
    schema: bool,
    default: true,
    control: "boolean",
    failClosed: true,
  }),
  fairplay_reports_enabled: def({
    key: "fairplay_reports_enabled",
    scope: "public_runtime",
    group: "features",
    schema: bool,
    default: true,
    control: "boolean",
    failClosed: false,
  }),
  notification_delivery_enabled: def({
    key: "notification_delivery_enabled",
    scope: "server_only",
    group: "operations",
    schema: bool,
    default: true,
    control: "boolean",
    failClosed: false,
  }),
  contact_form_enabled: def({
    key: "contact_form_enabled",
    scope: "public_runtime",
    group: "features",
    schema: bool,
    default: true,
    control: "boolean",
    failClosed: true,
  }),
  user_deletion_grace_days: def({
    key: "user_deletion_grace_days",
    scope: "server_only",
    group: "limits",
    schema: z.number().int().min(0).max(90),
    default: 14,
    control: "number",
    min: 0,
    max: 90,
    failClosed: true,
  }),
  matchmaking_rating_range: def({
    key: "matchmaking_rating_range",
    scope: "server_only",
    group: "limits",
    schema: z.number().int().min(25).max(1000),
    default: 300,
    control: "number",
    min: 25,
    max: 1000,
    failClosed: false,
  }),
  matchmaking_timeout_seconds: def({
    key: "matchmaking_timeout_seconds",
    scope: "public_runtime",
    group: "limits",
    schema: z.number().int().min(15).max(900),
    default: 180,
    control: "number",
    min: 15,
    max: 900,
    failClosed: false,
  }),
  draw_offer_cooldown_seconds: def({
    key: "draw_offer_cooldown_seconds",
    scope: "public_runtime",
    group: "limits",
    schema: z.number().int().min(5).max(300),
    default: 30,
    control: "number",
    min: 5,
    max: 300,
    failClosed: false,
  }),
  abort_game_policy: def({
    key: "abort_game_policy",
    scope: "public_runtime",
    group: "operations",
    schema: z.enum(["first_move_only", "before_move_two", "disabled"]),
    default: "first_move_only",
    control: "select",
    options: ["first_move_only", "before_move_two", "disabled"] as const,
    failClosed: true,
  }),
  announcement_enabled: def({
    key: "announcement_enabled",
    scope: "public_runtime",
    group: "content",
    schema: bool,
    default: false,
    control: "boolean",
    failClosed: false,
  }),
  announcement_message: def({
    key: "announcement_message",
    scope: "public_runtime",
    group: "content",
    schema: text,
    default: "",
    control: "textarea",
    failClosed: false,
  }),
  experimental_flags: def({
    key: "experimental_flags",
    scope: "public_runtime",
    group: "features",
    schema: z.record(z.string().regex(/^[a-z0-9_]{2,40}$/), z.boolean()),
    default: {} as Record<string, boolean>,
    control: "flags",
    failClosed: true,
  }),
} as const;

export type SettingKey = keyof typeof SETTING_REGISTRY;

export const SETTING_KEYS = Object.keys(SETTING_REGISTRY) as SettingKey[];

export type SettingValues = {
  [K in SettingKey]: (typeof SETTING_REGISTRY)[K] extends SettingDefinition<infer T> ? T : never;
};

export function isSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTING_REGISTRY, key);
}

export function settingDefinition(key: SettingKey): SettingDefinition {
  return SETTING_REGISTRY[key] as unknown as SettingDefinition;
}

/** Parse an untrusted value for a key; returns null when it is not valid. */
export function parseSettingValue(key: SettingKey, value: unknown): SettingJson | null {
  const result = settingDefinition(key).schema.safeParse(value);
  return result.success ? (result.data as SettingJson) : null;
}

export function defaultSettings(): SettingValues {
  const out = {} as Record<string, unknown>;
  for (const key of SETTING_KEYS) out[key] = settingDefinition(key).default;
  return out as SettingValues;
}

export function publicSettingKeys(): SettingKey[] {
  return SETTING_KEYS.filter((k) => settingDefinition(k).scope === "public_runtime");
}
