import { describe, expect, it, vi } from "vitest";
import { canAccessModule, modulesForRole, ADMIN_MODULE_PATHS } from "./permissions";
import { assertAdmin, assertFairplayAdmin, MFA_REQUIRED, FORBIDDEN } from "./guard";
import { redact, MUTATING_ADMIN_ACTIONS } from "./auditLog.server";

function ctx(roles: string[], aal: string) {
  return {
    userId: "u1",
    claims: { aal },
    supabase: {
      rpc: (_fn: "has_role", args: { _user_id: string; _role: string }) =>
        Promise.resolve({ data: roles.includes(args._role) }),
    },
  };
}

describe("admin permission matrix", () => {
  it("gives admins every module", () => {
    for (const m of Object.keys(ADMIN_MODULE_PATHS) as (keyof typeof ADMIN_MODULE_PATHS)[]) {
      expect(canAccessModule("admin", m)).toBe(true);
    }
  });

  it("limits moderators to explicitly granted Fair Play modules", () => {
    expect(canAccessModule("moderator", "fairplay")).toBe(true);
    expect(canAccessModule("moderator", "fairplayLog")).toBe(true);
    expect(canAccessModule("moderator", "users")).toBe(false);
    expect(canAccessModule("moderator", "system")).toBe(false);
    expect(canAccessModule("moderator", "engine")).toBe(false);
    expect(canAccessModule("moderator", "intelligence")).toBe(false);
  });

  it("denies plain users and unknown roles by default", () => {
    expect(canAccessModule("user", "dashboard")).toBe(false);
    expect(canAccessModule(null, "dashboard")).toBe(false);
    expect(canAccessModule("root" as never, "dashboard")).toBe(false);
    expect(modulesForRole("user")).toHaveLength(0);
  });
});

describe("assertAdmin", () => {
  it("rejects a normal user", async () => {
    await expect(assertAdmin(ctx([], "aal2"), "dashboard")).rejects.toThrow(FORBIDDEN);
  });

  it("requires MFA (aal2) for an admin", async () => {
    await expect(assertAdmin(ctx(["admin"], "aal1"), "dashboard")).rejects.toThrow(MFA_REQUIRED);
  });

  it("allows an aal2 admin", async () => {
    await expect(assertAdmin(ctx(["admin"], "aal2"), "users")).resolves.toEqual({
      userId: "u1",
      role: "admin",
    });
  });

  it("blocks a moderator from user/system/engine modules even with aal2", async () => {
    for (const m of ["users", "system", "engine", "intelligence"] as const) {
      await expect(assertAdmin(ctx(["moderator"], "aal2"), m)).rejects.toThrow(FORBIDDEN);
    }
  });

  it("keeps the legacy Fair Play alias working", async () => {
    await expect(assertFairplayAdmin(ctx(["admin"], "aal2"))).resolves.toBeUndefined();
    await expect(assertFairplayAdmin(ctx([], "aal2"))).rejects.toThrow(FORBIDDEN);
  });
});

describe("audit redaction", () => {
  it("removes credential-shaped fields at any depth", () => {
    const out = redact({
      role: "admin",
      password: "hunter2",
      nested: { access_token: "abc", totp: "123456", keep: 1 },
    }) as Record<string, unknown>;
    expect(out["role"]).toBe("admin");
    expect(out["password"]).toBe("[redacted]");
    expect((out["nested"] as Record<string, unknown>)["access_token"]).toBe("[redacted]");
    expect((out["nested"] as Record<string, unknown>)["totp"]).toBe("[redacted]");
    expect((out["nested"] as Record<string, unknown>)["keep"]).toBe(1);
  });

  it("treats every state-changing action as mutating", () => {
    expect(MUTATING_ADMIN_ACTIONS).toContain("user_role_change");
    expect(MUTATING_ADMIN_ACTIONS).toContain("engine_profile_publish");
    expect(MUTATING_ADMIN_ACTIONS).not.toContain("dashboard_view");
  });
});

describe("strict audit writes", () => {
  it("refuses a mutation audit entry without a reason", async () => {
    vi.resetModules();
    const { recordAdminActionStrict } = await import("./auditLog.server");
    await expect(
      recordAdminActionStrict({ actorId: "u1", action: "user_suspend", note: "  " }),
    ).rejects.toThrow("AUDIT_REASON_REQUIRED");
  });
});
