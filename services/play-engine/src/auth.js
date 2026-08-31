/**
 * Inbound OIDC verification.
 *
 * Only Google-signed ID tokens issued to the configured audience and belonging
 * to an allowlisted service account may call the engine. Cloud Run IAM is the
 * first gate; this is the second, so a misconfigured "allow unauthenticated"
 * deployment still cannot be abused.
 */
import { OAuth2Client } from "google-auth-library";

const client = new OAuth2Client();

export async function verifyIdToken(header) {
  const audience = process.env.PLAY_ENGINE_AUDIENCE;
  const allowed = (process.env.ALLOWED_SERVICE_ACCOUNTS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!audience || allowed.length === 0) return { ok: false, error: "not_configured" };

  const token = /^Bearer (.+)$/.exec(header ?? "")?.[1];
  if (!token) return { ok: false, error: "missing_token" };

  try {
    const ticket = await client.verifyIdToken({ idToken: token, audience });
    const payload = ticket.getPayload();
    const email = payload?.email;
    if (!email || !payload.email_verified) return { ok: false, error: "unverified_caller" };
    if (!allowed.includes(email)) return { ok: false, error: "caller_not_allowed" };
    return { ok: true, email };
  } catch {
    return { ok: false, error: "invalid_token" };
  }
}
