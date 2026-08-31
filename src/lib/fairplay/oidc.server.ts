/**
 * Google-signed OIDC ID token verification for the trusted Fair Play worker.
 *
 * Cloud Run services call this app with an identity token minted by Google for
 * their own service account. We verify the signature against Google's public
 * JWKS, the issuer, the expiry and the audience, and then check the service
 * account e-mail against an allowlist. A hard-to-guess URL is never treated as
 * authentication.
 */

const GOOGLE_JWKS = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export type WorkerAuthResult =
  | { ok: true; email: string }
  | { ok: false; status: 401 | 403 | 503; code: string };

interface Jwk {
  kid: string;
  n: string;
  e: string;
  alg?: string;
  kty: string;
}

let jwksCache: { fetchedAt: number; keys: Jwk[] } | null = null;

function b64urlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function decodeJson(segment: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(segment))) as Record<string, unknown>;
}

async function loadKeys(): Promise<Jwk[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < 3_600_000) return jwksCache.keys;
  const res = await fetch(GOOGLE_JWKS);
  if (!res.ok) throw new Error("JWKS fetch failed");
  const body = (await res.json()) as { keys: Jwk[] };
  jwksCache = { fetchedAt: Date.now(), keys: body.keys ?? [] };
  return jwksCache.keys;
}

/** Configuration presence, surfaced to admins as `not_configured`. */
export function workerAuthConfigured(): boolean {
  return Boolean(process.env["FAIRPLAY_WORKER_AUDIENCE"] && process.env["FAIRPLAY_WORKER_SERVICE_ACCOUNTS"]);
}

export async function verifyWorkerRequest(request: Request): Promise<WorkerAuthResult> {
  const audience = process.env["FAIRPLAY_WORKER_AUDIENCE"];
  const allowlist = (process.env["FAIRPLAY_WORKER_SERVICE_ACCOUNTS"] ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  if (!audience || allowlist.length === 0) {
    return { ok: false, status: 503, code: "NOT_CONFIGURED" };
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return { ok: false, status: 401, code: "MISSING_TOKEN" };

  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, status: 401, code: "MALFORMED_TOKEN" };
  const [rawHeader, rawPayload, rawSignature] = parts as [string, string, string];

  let head: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    head = decodeJson(rawHeader);
    payload = decodeJson(rawPayload);
  } catch {
    return { ok: false, status: 401, code: "MALFORMED_TOKEN" };
  }
  if (head["alg"] !== "RS256") return { ok: false, status: 401, code: "BAD_ALG" };

  let keys: Jwk[];
  try {
    keys = await loadKeys();
  } catch {
    return { ok: false, status: 503, code: "JWKS_UNAVAILABLE" };
  }
  const jwk = keys.find((k) => k.kid === head["kid"]);
  if (!jwk) return { ok: false, status: 401, code: "UNKNOWN_KEY" };

  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlToBytes(rawSignature) as unknown as ArrayBuffer,
    new TextEncoder().encode(`${rawHeader}.${rawPayload}`) as unknown as ArrayBuffer,
  );
  if (!valid) return { ok: false, status: 401, code: "BAD_SIGNATURE" };

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload["exp"] !== "number" || payload["exp"] < now) {
    return { ok: false, status: 401, code: "TOKEN_EXPIRED" };
  }
  if (!GOOGLE_ISSUERS.includes(String(payload["iss"]))) {
    return { ok: false, status: 401, code: "BAD_ISSUER" };
  }
  if (String(payload["aud"]) !== audience) {
    return { ok: false, status: 401, code: "BAD_AUDIENCE" };
  }

  const email = String(payload["email"] ?? "").toLowerCase();
  if (payload["email_verified"] !== true || !allowlist.includes(email)) {
    return { ok: false, status: 403, code: "SERVICE_ACCOUNT_NOT_ALLOWED" };
  }

  return { ok: true, email };
}
