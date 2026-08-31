/**
 * Unified Admin Center guard.
 *
 * Three conditions must hold before any admin server function runs:
 *  1. There is an authenticated session (the Supabase middleware guarantees it).
 *  2. The role is resolved server-side through the `has_role` RPC.
 *  3. The session was elevated to `aal2` with a verified TOTP factor.
 *
 * Role → module access comes from the shared permission matrix, so a
 * moderator hitting a users/system/engine endpoint directly (without the UI)
 * is rejected exactly like an anonymous caller.
 */
import { canAccessModule, type AdminModule, type AdminRole } from "./permissions";

export const MFA_REQUIRED = "MFA_REQUIRED";
export const FORBIDDEN = "Forbidden";

export interface AdminGuardContext {
  supabase: {
    rpc: (
      fn: "has_role",
      args: { _user_id: string; _role: AdminRole },
    ) => PromiseLike<{ data: boolean | null }>;
  };
  userId: string;
  claims: Record<string, unknown>;
}

export interface AdminIdentity {
  userId: string;
  role: Exclude<AdminRole, "user">;
}

/** Resolve the caller's highest admin-ish role, or null. */
export async function resolveAdminRole(context: AdminGuardContext): Promise<AdminRole | null> {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (isAdmin) return "admin";

  const { data: isModerator } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "moderator",
  });
  if (isModerator) return "moderator";

  return null;
}

function assertAal2(context: AdminGuardContext) {
  const aal = typeof context.claims["aal"] === "string" ? (context.claims["aal"] as string) : null;
  if (aal !== "aal2") {
    throw new Error(
      `${MFA_REQUIRED}: Tài khoản quản trị cần xác thực 2 bước (TOTP) trước khi mở khu vực quản trị.`,
    );
  }
}

/**
 * Assert the caller may use `module`. Returns the resolved identity so callers
 * can record audit entries without a second role lookup.
 */
export async function assertAdmin(
  context: AdminGuardContext,
  module: AdminModule = "dashboard",
): Promise<AdminIdentity> {
  const role = await resolveAdminRole(context);
  if (!role || role === "user") throw new Error(FORBIDDEN);
  if (!canAccessModule(role, module)) throw new Error(FORBIDDEN);

  assertAal2(context);
  return { userId: context.userId, role };
}

/**
 * Backwards-compatible alias for the pre-Admin-Center Fair Play surfaces.
 * Fair Play is available to admins and explicitly granted moderators.
 */
export async function assertFairplayAdmin(context: AdminGuardContext): Promise<void> {
  await assertAdmin(context, "fairplay");
}
