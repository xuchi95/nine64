/**
 * Admin Center permission matrix.
 *
 * Client-safe: contains no secrets and no server-only imports, so the sidebar
 * can hide links the caller cannot use. Hiding is UX only — every server
 * function re-checks the same matrix with `assertAdmin`.
 */

export type AdminRole = "admin" | "moderator" | "user";

export type AdminModule =
  | "dashboard"
  | "users"
  | "system"
  | "engine"
  | "intelligence"
  | "puzzles"
  | "openings"
  | "fairplay"
  | "fairplayLog"
  | "audit"
  | "security";

/** Explicit allowlist per role. Anything not listed is denied. */
const MATRIX: Record<AdminRole, readonly AdminModule[]> = {
  admin: [
    "dashboard",
    "users",
    "system",
    "engine",
    "intelligence",
    "puzzles",
    "openings",
    "fairplay",
    "fairplayLog",
    "audit",
    "security",
  ],
  // Moderators only get the Fair Play surfaces they are explicitly granted.
  moderator: ["dashboard", "fairplay", "fairplayLog"],
  user: [],
};

export function canAccessModule(role: AdminRole | null | undefined, module: AdminModule): boolean {
  if (!role) return false;
  const allowed = MATRIX[role];
  if (!allowed) return false; // unknown role → deny
  return allowed.includes(module);
}

export function modulesForRole(role: AdminRole | null | undefined): readonly AdminModule[] {
  if (!role) return [];
  return MATRIX[role] ?? [];
}

export const ADMIN_MODULE_PATHS: Record<AdminModule, string> = {
  dashboard: "/admin",
  users: "/admin/users",
  system: "/admin/system",
  engine: "/admin/engine",
  intelligence: "/admin/intelligence",
  puzzles: "/admin/puzzles",
  openings: "/admin/openings",
  fairplay: "/admin/fairplay",
  fairplayLog: "/admin/fairplay/log",
  audit: "/admin/audit",
  security: "/admin/security",
};
