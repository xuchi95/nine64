/**
 * Admin guard for every Fair Play surface.
 *
 * Two conditions must hold: the caller has the `admin` role, and the session
 * was elevated with a verified TOTP factor (`aal2`). Supabase puts the
 * assurance level in the access-token claims, so a password-only admin
 * session is rejected server-side even if the UI is bypassed.
 */
export const MFA_REQUIRED = "MFA_REQUIRED";

interface GuardContext {
  supabase: {
    rpc: (
      fn: "has_role",
      args: { _user_id: string; _role: "admin" },
    ) => Promise<{ data: boolean | null; error: unknown }>;
  };
  userId: string;
  claims: Record<string, unknown>;
}

export async function assertFairplayAdmin(context: GuardContext): Promise<void> {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Forbidden");

  const aal = typeof context.claims["aal"] === "string" ? (context.claims["aal"] as string) : null;
  if (aal !== "aal2") {
    throw new Error(`${MFA_REQUIRED}: Tài khoản quản trị cần xác thực 2 bước (TOTP) trước khi mở Fair Play.`);
  }
}
