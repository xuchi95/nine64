/**
 * Authenticated client for the Nine64 Fair Play worker API.
 *
 * Every request carries a Google-signed OIDC ID token minted for this service
 * account with the app URL as audience. There is no API key and no public
 * endpoint: the app verifies the token signature, issuer, audience and the
 * service-account allowlist before doing any work.
 */

export function createApiClient({ baseUrl, audience, fetchImpl = fetch, tokenProvider }) {
  if (!baseUrl) throw new Error("FAIRPLAY_APP_URL is required");
  let cachedClient = null;

  async function idToken() {
    if (tokenProvider) return tokenProvider();
    if (!cachedClient) {
      // Imported lazily so unit tests can run without GCP libraries present.
      const { GoogleAuth } = await import("google-auth-library");
      cachedClient = await new GoogleAuth().getIdTokenClient(audience ?? baseUrl);
    }
    const headers = await cachedClient.getRequestHeaders();
    const header = headers.Authorization ?? headers.authorization ?? "";
    return header.replace(/^Bearer\s+/i, "");
  }

  async function call(path, body) {
    const token = await idToken();
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { raw: text };
    }
    if (!res.ok) {
      const error = new Error(`${path} failed: ${res.status} ${payload.code ?? ""}`.trim());
      error.status = res.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  return {
    claim: (worker, limit, leaseSeconds) => call("/api/public/fairplay/claim", { worker, limit, leaseSeconds }),
    result: (payload) => call("/api/public/fairplay/result", payload),
    fail: (jobId, error) => call("/api/public/fairplay/fail", { jobId, error: String(error).slice(0, 1000) }),
  };
}
