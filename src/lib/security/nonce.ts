/** Request header carrying the per-request CSP nonce from src/server.ts. */
export const CSP_NONCE_HEADER = "x-csp-nonce";

/** Generates a fresh base64 nonce (Web Crypto, works on Workers). */
export function createCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Stamps every inline <script> in an SSR HTML stream with the request nonce.
 * The framework emits inline bootstrap scripts we cannot hash ahead of time,
 * so nonce-stamping is what lets production CSP drop 'unsafe-inline'.
 */
export function stampNonceInHtml(response: Response, nonce: string): Response {
  const body = response.body;
  if (!body) return response;

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  // A chunk may split mid-tag; hold back enough bytes to never miss a match.
  const CARRY = 64;
  let carry = "";

  const rewrite = (html: string) =>
    html.replace(
      // Skips external scripts, already-stamped scripts, and the hash-pinned
      // theme bootstrap (stamping it would cause a hydration mismatch).
      /<script(?![^>]*\bsrc=)(?![^>]*\bnonce=)(?![^>]*\bdata-theme-boot\b)/gi,
      `<script nonce="${nonce}"`,
    );

  const stream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const text = carry + decoder.decode(chunk, { stream: true });
      const safeLength = Math.max(0, text.length - CARRY);
      const head = rewrite(text.slice(0, safeLength));
      carry = text.slice(safeLength);
      if (head) controller.enqueue(encoder.encode(head));
    },
    flush(controller) {
      const tail = rewrite(carry + decoder.decode());
      if (tail) controller.enqueue(encoder.encode(tail));
    },
  });

  return new Response(body.pipeThrough(stream), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
