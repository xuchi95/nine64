/**
 * Engine environment diagnostics — server-only.
 *
 * Reports *presence and shape* of the backend secrets the Cloud Run engine
 * needs. It never returns, logs or echoes a secret VALUE: every field is a
 * boolean or a stable diagnostic code, safe to show in the admin console.
 */

export type EngineEnvCode =
  | "OK"
  | "MISSING_ENGINE_CONFIG"
  | "INVALID_ENGINE_CREDENTIALS"
  | "MISSING_SUPABASE_CONFIG";

export interface EngineEnvDiagnostics {
  ok: boolean;
  /** True when all four PLAY_ENGINE_* secrets are present and well-formed. */
  configured: boolean;
  code: EngineEnvCode;
  /** Presence only — never the value. */
  present: {
    PLAY_ENGINE_URL: boolean;
    PLAY_ENGINE_AUDIENCE: boolean;
    PLAY_ENGINE_SA_EMAIL: boolean;
    PLAY_ENGINE_SA_PRIVATE_KEY: boolean;
    SUPABASE_URL: boolean;
    SUPABASE_SERVICE_ROLE_KEY: boolean;
  };
  /** Names that are missing or malformed (no values). */
  missing: string[];
  problems: string[];
}

/**
 * PEM sanity check. Handles both a real multiline PEM and a provider-escaped
 * `\n` PEM. Returns a code, never any part of the key.
 */
export function classifyPrivateKey(raw: string | undefined): "missing" | "invalid" | "ok" {
  if (!raw || raw.trim() === "") return "missing";
  const pem = raw.replace(/\\r/g, "").replace(/\\n/g, "\n").replace(/\r/g, "").trim();
  if (!pem.startsWith("-----BEGIN PRIVATE KEY-----")) return "invalid";
  if (!pem.endsWith("-----END PRIVATE KEY-----")) return "invalid";
  const body = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  if (body.length < 200 || !/^[A-Za-z0-9+/]+=*$/.test(body)) return "invalid";
  return "ok";
}

/** HTTPS, no whitespace, trailing slash normalized. */
function isUrl(raw: string | undefined, requireHttps = false): boolean {
  const value = (raw ?? "").trim();
  if (!value || /\s/.test(value)) return false;
  try {
    const u = new URL(value);
    return requireHttps ? u.protocol === "https:" : u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}


/** Pure classifier so tests can drive every branch without touching process.env. */
export function classifyEngineEnv(env: Record<string, string | undefined>): EngineEnvDiagnostics {
  const keyState = classifyPrivateKey(env["PLAY_ENGINE_SA_PRIVATE_KEY"]);
  const present = {
    PLAY_ENGINE_URL: isUrl(env["PLAY_ENGINE_URL"]),
    PLAY_ENGINE_AUDIENCE: Boolean(env["PLAY_ENGINE_AUDIENCE"]),
    PLAY_ENGINE_SA_EMAIL: /.+@.+\..+/.test(env["PLAY_ENGINE_SA_EMAIL"] ?? ""),
    PLAY_ENGINE_SA_PRIVATE_KEY: keyState === "ok",
    SUPABASE_URL: isUrl(env["SUPABASE_URL"]),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(env["SUPABASE_SERVICE_ROLE_KEY"]),
  };

  const problems: string[] = [];
  if (!present.PLAY_ENGINE_URL) problems.push("PLAY_ENGINE_URL");
  if (!present.PLAY_ENGINE_SA_EMAIL) problems.push("PLAY_ENGINE_SA_EMAIL");
  if (!present.PLAY_ENGINE_SA_PRIVATE_KEY) problems.push("PLAY_ENGINE_SA_PRIVATE_KEY");
  if (!present.SUPABASE_URL) problems.push("SUPABASE_URL");
  if (!present.SUPABASE_SERVICE_ROLE_KEY) problems.push("SUPABASE_SERVICE_ROLE_KEY");
  // PLAY_ENGINE_AUDIENCE is optional: it defaults to the service URL.

  let code: EngineEnvCode = "OK";
  if (!present.SUPABASE_URL || !present.SUPABASE_SERVICE_ROLE_KEY) code = "MISSING_SUPABASE_CONFIG";
  if (keyState === "invalid") code = "INVALID_ENGINE_CREDENTIALS";
  if (
    !present.PLAY_ENGINE_URL ||
    !present.PLAY_ENGINE_SA_EMAIL ||
    (keyState === "missing" && code !== "INVALID_ENGINE_CREDENTIALS")
  ) {
    code = keyState === "invalid" ? "INVALID_ENGINE_CREDENTIALS" : "MISSING_ENGINE_CONFIG";
  }

  return { ok: problems.length === 0 && code === "OK", code, present, problems };
}

export function engineEnvDiagnostics(): EngineEnvDiagnostics {
  return classifyEngineEnv(process.env as Record<string, string | undefined>);
}
