/**
 * Canonical engine-config fingerprint.
 *
 * The fingerprint is ALWAYS produced on the server from a config that has
 * already been through `engineConfigSchema`. A browser-supplied signature is
 * never trusted or accepted. No secret or environment value takes part in the
 * hash — only the validated engine configuration.
 */
import { engineConfigSchema, type EngineConfig } from "./profileTypes";

/** Stable key ordering, no undefined values, JSON-canonical output. */
export function canonicalConfigJson(config: EngineConfig): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(record).sort()) {
        if (record[key] === undefined) continue;
        out[key] = canonical(record[key]);
      }
      return out;
    }
    return value;
  };
  // Re-parsing guarantees defaults are materialised, so two semantically equal
  // drafts always serialise identically.
  return JSON.stringify(canonical(engineConfigSchema.parse(config)));
}

/** SHA-256 (hex) of the canonical config JSON. */
export async function engineConfigFingerprint(config: EngineConfig): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalConfigJson(config));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
