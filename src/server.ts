import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { withSecurityHeaders, type HeaderContext } from "./lib/security/headers";
import { assertServerEnv } from "./lib/security/env";
import { createCspNonce, stampNonceInHtml } from "./lib/security/nonce";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

function headerContext(request: Request, nonce: string): HeaderContext {
  const url = new URL(request.url);
  return {
    url,
    nonce,
    production: process.env["NODE_ENV"] === "production",
    supabaseUrl: process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"],
  };
}

let envChecked = false;

/** Runs once per isolate: env is injected per request on Workers. */
function checkEnvOnce(): void {
  if (envChecked) return;
  envChecked = true;
  assertServerEnv();
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    checkEnvOnce();
    const nonce = createCspNonce();
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);
      const stamped = normalized.headers.get("content-type")?.includes("text/html")
        ? stampNonceInHtml(normalized, nonce)
        : normalized;
      return withSecurityHeaders(stamped, headerContext(request, nonce));
    } catch (error) {
      console.error(error);
      return withSecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
        headerContext(request, nonce),
      );
    }
  },
};
