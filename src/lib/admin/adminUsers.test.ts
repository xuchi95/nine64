import { describe, expect, it } from "vitest";
import {
  ADMIN_ERROR_MESSAGES,
  DELETION_GRACE_HOURS,
  LONG_SUSPENSION_HOURS,
  SUSPEND_PRESET_HOURS,
  USER_SORT_FIELDS,
  USER_STATUSES,
  maskEmail,
} from "./userTypes";

describe("admin user types", () => {
  it("exposes the full lifecycle status set", () => {
    expect(USER_STATUSES).toEqual([
      "active",
      "restricted",
      "suspended",
      "pending_deletion",
      "anonymized",
    ]);
  });

  it("only allows allowlisted sort fields (no SQL injection through sort)", () => {
    expect(USER_SORT_FIELDS).toContain("created_at");
    expect(USER_SORT_FIELDS).not.toContain("email");
    for (const field of USER_SORT_FIELDS) expect(field).toMatch(/^[a-z_]+$/);
  });

  it("masks emails so the list never leaks a full address", () => {
    expect(maskEmail("player@example.com")).not.toContain("player@");
    expect(maskEmail("player@example.com")).toContain("example.com");
    expect(maskEmail(null)).toBeNull();
    expect(maskEmail("a@b.co")).toContain("b.co");
  });

  it("keeps suspension presets ordered and flags long suspensions", () => {
    expect(SUSPEND_PRESET_HOURS).toEqual([...SUSPEND_PRESET_HOURS].sort((a, b) => a - b));
    expect(LONG_SUSPENSION_HOURS).toBeGreaterThan(SUSPEND_PRESET_HOURS[0]!);
    expect(SUSPEND_PRESET_HOURS.at(-1)).toBeGreaterThanOrEqual(LONG_SUSPENSION_HOURS);
  });

  it("gives deletion requests a grace window before execution", () => {
    expect(DELETION_GRACE_HOURS).toBeGreaterThanOrEqual(24);
  });

  it("maps every server error code to a translation key", () => {
    for (const [code, key] of Object.entries(ADMIN_ERROR_MESSAGES)) {
      expect(code).toMatch(/^[A-Z_]+$/);
      expect(key.startsWith("adminc.")).toBe(true);
    }
    for (const code of [
      "REASON_TOO_SHORT",
      "CONFIRMATION_MISMATCH",
      "VERSION_CONFLICT",
      "SELF_TARGET",
      "LAST_ADMIN",
    ]) {
      expect(ADMIN_ERROR_MESSAGES[code]).toBeTruthy();
    }
  });
});

describe("admin user i18n", () => {
  it("has matching VI and EN keys", async () => {
    const dict = (await import("@/lib/i18n/dict/admin_users")) as unknown as Record<
      string,
      { vi: Record<string, string>; en: Record<string, string> }
    >;
    const entry = Object.values(dict)[0]!;
    expect(Object.keys(entry.vi).sort()).toEqual(Object.keys(entry.en).sort());
  });
});
