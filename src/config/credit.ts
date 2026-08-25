/**
 * Footer credit configuration.
 *
 * Edit the defaults below to change the credit line, or override them at build
 * time with environment variables (no code change needed):
 *
 *   VITE_CREDIT_PREFIX="Built by"
 *   VITE_CREDIT_NAME="Nguyễn Xuân Chính"
 *   VITE_CREDIT_URL="https://www.facebook.com/chinhxuan95/"
 *   VITE_CREDIT_ENABLED="true" | "false"
 *
 * The link is intentionally do-follow (no rel="nofollow").
 */

const env = import.meta.env as Record<string, string | undefined>;

function value(key: string, fallback: string): string {
  const raw = env[key];
  return raw && raw.trim().length > 0 ? raw.trim() : fallback;
}

export const CREDIT = {
  /** Set VITE_CREDIT_ENABLED="false" to hide the credit line entirely. */
  enabled: value("VITE_CREDIT_ENABLED", "true") !== "false",
  prefix: value("VITE_CREDIT_PREFIX", "Built by"),
  name: value("VITE_CREDIT_NAME", "Nguyễn Xuân Chính"),
  url: value("VITE_CREDIT_URL", "https://www.facebook.com/chinhxuan95/"),
} as const;
