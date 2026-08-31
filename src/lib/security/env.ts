/**
 * P0.10 — environment variable contract.
 *
 * Public vars (VITE_*) are safe in the browser bundle. Server-only vars are
 * read exclusively inside server-function/route handlers and must never be
 * prefixed with VITE_.
 */

/** Injected into the client bundle. Publishable values only. */
export const PUBLIC_ENV_VARS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_PROJECT_ID",
] as const;

/** Server-only. Must never appear in dist/client. */
export const SERVER_ENV_VARS = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_PROJECT_ID",
  "SUPABASE_SERVICE_ROLE_KEY",
  "LOVABLE_API_KEY",
  "RATE_LIMIT_SALT",
  "TURNSTILE_SECRET_KEY",
  "FAIRPLAY_WORKER_AUDIENCE",
  "FAIRPLAY_WORKER_SERVICE_ACCOUNTS",
  "COACH_MODEL",
] as const;

/** Required for the server to boot at all. */
const REQUIRED_ALWAYS = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"] as const;

/** Required additionally in production (abuse protection must be real). */
const REQUIRED_PRODUCTION = ["SUPABASE_SERVICE_ROLE_KEY", "RATE_LIMIT_SALT"] as const;

export interface EnvReport {
  ok: boolean;
  /** Names only — values are never included. */
  missing: string[];
  warnings: string[];
}

/** Validates server env. Returns names only; never reads or logs values. */
export function checkServerEnv(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
  production = env["NODE_ENV"] === "production",
): EnvReport {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const name of REQUIRED_ALWAYS) if (!env[name]) missing.push(name);
  if (production) {
    for (const name of REQUIRED_PRODUCTION) if (!env[name]) missing.push(name);
    if (!env["TURNSTILE_SECRET_KEY"]) {
      warnings.push("TURNSTILE_SECRET_KEY is unset: captcha-protected endpoints will fail closed.");
    }
    if (!env["LOVABLE_API_KEY"]) warnings.push("LOVABLE_API_KEY is unset: AI Coach is unavailable.");
  }

  // A server secret leaking through a VITE_ prefix would ship to the browser.
  for (const name of Object.keys(env)) {
    if (!name.startsWith("VITE_")) continue;
    if (/SECRET|SERVICE_ROLE|PRIVATE|_TOKEN$|PASSWORD|SALT/i.test(name)) {
      warnings.push(`${name} is exposed to the browser but looks server-only.`);
    }
  }

  return { ok: missing.length === 0, missing, warnings };
}

/** Logs a clear startup error when required server secrets are absent. */
export function assertServerEnv(
  env?: Record<string, string | undefined>,
  production?: boolean,
): EnvReport {
  const report = checkServerEnv(env, production);
  for (const warning of report.warnings) console.warn(`[env] ${warning}`);
  if (!report.ok) {
    console.error(
      `[env] Missing required server environment variables: ${report.missing.join(", ")}. ` +
        `Set them in project secrets before serving traffic.`,
    );
  }
  return report;
}
