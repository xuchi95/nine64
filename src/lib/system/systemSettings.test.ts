import { describe, expect, it } from "vitest";
import {
  SETTING_KEYS,
  defaultSettings,
  isSettingKey,
  parseSettingValue,
  publicSettingKeys,
  settingDefinition,
} from "./registry";
import { QUEUE_IDS } from "./queueTypes";

describe("system settings registry", () => {
  it("only allows allowlisted keys", () => {
    expect(isSettingKey("maintenance_mode")).toBe(true);
    expect(isSettingKey("SUPABASE_SERVICE_ROLE_KEY")).toBe(false);
    expect(isSettingKey("__proto__")).toBe(false);
  });

  it("never exposes a secret-shaped key", () => {
    for (const key of SETTING_KEYS) {
      expect(key).not.toMatch(/secret|token|api[_-]?key|password|private/i);
    }
  });

  it("keeps server-only keys out of the public payload", () => {
    const pub = publicSettingKeys();
    expect(pub).not.toContain("user_deletion_grace_days");
    expect(pub).not.toContain("matchmaking_rating_range");
    expect(pub).not.toContain("notification_delivery_enabled");
    expect(pub).toContain("maintenance_mode");
  });

  it("validates typed values and rejects out-of-range input", () => {
    expect(parseSettingValue("maintenance_mode", true)).toBe(true);
    expect(parseSettingValue("maintenance_mode", "yes")).toBeNull();
    expect(parseSettingValue("user_deletion_grace_days", 14)).toBe(14);
    expect(parseSettingValue("user_deletion_grace_days", 900)).toBeNull();
    expect(parseSettingValue("draw_offer_cooldown_seconds", 1)).toBeNull();
    expect(parseSettingValue("abort_game_policy", "nope")).toBeNull();
    expect(parseSettingValue("abort_game_policy", "disabled")).toBe("disabled");
    expect(parseSettingValue("experimental_flags", { new_board: true })).toEqual({
      new_board: true,
    });
    expect(parseSettingValue("experimental_flags", { "Bad Key": true })).toBeNull();
  });

  it("ships safe defaults for every key", () => {
    const values = defaultSettings();
    for (const key of SETTING_KEYS) {
      expect(parseSettingValue(key, values[key])).not.toBeNull();
    }
    expect(values.maintenance_mode).toBe(false);
    expect(values.announcement_enabled).toBe(false);
  });

  it("marks security-critical settings fail-closed", () => {
    for (const key of [
      "maintenance_mode",
      "registration_enabled",
      "login_enabled",
      "matchmaking_enabled",
      "rated_games_enabled",
      "contact_form_enabled",
    ] as const) {
      expect(settingDefinition(key).failClosed).toBe(true);
    }
  });

  it("requires typed confirmation for high impact settings", () => {
    expect(settingDefinition("maintenance_mode").highImpact).toBe(true);
    expect(settingDefinition("rated_games_enabled").highImpact).toBe(true);
    expect(settingDefinition("maintenance_message").highImpact).toBeUndefined();
  });
});

describe("queue registry", () => {
  it("exposes a fixed queue allowlist", () => {
    expect([...QUEUE_IDS]).toEqual([
      "fairplay_jobs",
      "notification_outbox",
      "timeout_finalizer",
      "account_deletion",
    ]);
  });
});
