/**
 * Compatibility shim.
 *
 * The Fair Play guard is now one case of the unified Admin Center guard in
 * `@/lib/admin/guard`. Existing Fair Play modules keep importing from here.
 */
export {
  MFA_REQUIRED,
  FORBIDDEN,
  assertAdmin,
  assertFairplayAdmin,
  resolveAdminRole,
  type AdminGuardContext,
  type AdminIdentity,
} from "@/lib/admin/guard";
