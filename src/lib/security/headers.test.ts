import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  buildCsp,
  buildSecurityHeaders,
  cacheControlFor,
  withSecurityHeaders,
  isPreviewHost,
  THEME_BOOTSTRAP_SCRIPT,
  THEME_BOOTSTRAP_SCRIPT_HASH,
  type HeaderContext,
} from "./headers";
import { checkServerEnv, PUBLIC_ENV_VARS, SERVER_ENV_VARS } from "./env";

const SUPABASE_URL = "https://paonjtgdzlmryhbneeqy.supabase.co";

function prod(path = "/"): HeaderContext {
  return { url: new URL(`https://nine64.com${path}`), production: true, supabaseUrl: SUPABASE_URL };
}
function preview(): HeaderContext {
  return {
    url: new URL("https://id-preview--abc.lovable.app/"),
    production: true,
    supabaseUrl: SUPABASE_URL,
  };
}
function dev(): HeaderContext {
  return { url: new URL("http://localhost:8080/"), production: false, supabaseUrl: SUPABASE_URL };
}

function directive(csp: string, name: string): string {
  const found = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `));
  return found ?? "";
}

describe("production document headers", () => {
  const headers = buildSecurityHeaders(prod());

  it("sets every required header", () => {
    expect(headers["strict-transport-security"]).toContain("max-age=31536000");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("geolocation=()");
    expect(headers["cross-origin-opener-policy"]).toBe("same-origin-allow-popups");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  });

  it("enforces CSP rather than only reporting it", () => {
    expect(headers["content-security-policy"]).toBeTruthy();
    expect(headers["content-security-policy-report-only"]).toBeUndefined();
  });

  it("does not set COEP (would break OAuth, fonts and Turnstile)", () => {
    expect(headers["cross-origin-embedder-policy"]).toBeUndefined();
  });

  it("omits HSTS on plain HTTP and in dev", () => {
    expect(buildSecurityHeaders(dev())["strict-transport-security"]).toBeUndefined();
  });

  it("keeps the editor preview embeddable", () => {
    const h = buildSecurityHeaders(preview());
    expect(h["x-frame-options"]).toBeUndefined();
    expect(h["content-security-policy"]).toContain("frame-ancestors https://lovable.dev");
    expect(isPreviewHost("id-preview--x.lovable.app")).toBe(true);
    expect(isPreviewHost("nine64.com")).toBe(false);
  });
});

describe("content security policy", () => {
  const csp = buildCsp(prod());

  it("defaults to self and blocks plugins/base hijacking", () => {
    expect(directive(csp, "default-src")).toBe("default-src 'self'");
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    expect(directive(csp, "base-uri")).toBe("base-uri 'self'");
    expect(directive(csp, "form-action")).toBe("form-action 'self'");
  });

  it("allows Supabase REST and the Realtime WebSocket", () => {
    const connect = directive(csp, "connect-src");
    expect(connect).toContain(SUPABASE_URL);
    expect(connect).toContain("wss://paonjtgdzlmryhbneeqy.supabase.co");
  });

  it("allows Supabase Storage images (avatars) and data/blob previews", () => {
    const img = directive(csp, "img-src");
    expect(img).toContain(SUPABASE_URL);
    expect(img).toContain("data:");
    expect(img).toContain("blob:");
  });

  it("stamps framework inline scripts with the per-request nonce", () => {
    const withNonce = buildCsp({ ...prod(), nonce: "abc123" });
    expect(directive(withNonce, "script-src")).toContain("'nonce-abc123'");
  });

  it("scopes unsafe-eval to Turnstile routes only", () => {
    expect(buildCsp(prod("/contact"))).toContain("'unsafe-eval'");
    expect(buildCsp(prod("/auth/login"))).toContain("'unsafe-eval'");
    expect(buildCsp(prod("/play/bot"))).not.toContain("'unsafe-eval'");
  });

  it("supports the Stockfish worker and WASM without unsafe-eval", () => {
    expect(directive(csp, "worker-src")).toContain("'self'");
    expect(directive(csp, "worker-src")).toContain("blob:");
    expect(directive(csp, "script-src")).toContain("'wasm-unsafe-eval'");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("allows Turnstile script and iframe", () => {
    expect(directive(csp, "script-src")).toContain("https://challenges.cloudflare.com");
    expect(directive(csp, "frame-src")).toContain("https://challenges.cloudflare.com");
  });

  it("allows the Google Fonts stylesheet and font files", () => {
    expect(directive(csp, "style-src")).toContain("https://fonts.googleapis.com");
    expect(directive(csp, "font-src")).toContain("https://fonts.gstatic.com");
  });

  it("pins the inline theme script by hash instead of unsafe-inline", () => {
    const script = directive(csp, "script-src");
    expect(script).toContain(THEME_BOOTSTRAP_SCRIPT_HASH);
    expect(script).not.toContain("'unsafe-inline'");
    const actual = `'sha256-${createHash("sha256").update(THEME_BOOTSTRAP_SCRIPT, "utf8").digest("base64")}'`;
    expect(actual).toBe(THEME_BOOTSTRAP_SCRIPT_HASH);
  });

  it("uses no broad wildcards in production", () => {
    expect(csp).not.toMatch(/(^|[ ;])\*($|[ ;])/);
    expect(csp).not.toContain("https: ");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("relaxes only dev for HMR", () => {
    const devCsp = buildCsp(dev());
    expect(devCsp).toContain("'unsafe-eval'");
    expect(devCsp).not.toContain("upgrade-insecure-requests");
  });
});

describe("cache policy", () => {
  it("never publicly caches HTML documents", () => {
    expect(cacheControlFor("/", "text/html; charset=utf-8")).toBe("no-store");
  });

  it("marks server data responses private", () => {
    expect(cacheControlFor("/_serverFn/x", "application/json")).toBe("private, no-store");
    expect(cacheControlFor("/api/public/fairplay/claim", "application/json")).toBe("private, no-store");
  });

  it("caches hashed static assets immutably", () => {
    expect(cacheControlFor("/assets/app-abc123.js", "text/javascript")).toContain("immutable");
    expect(cacheControlFor("/engine/stockfish-18-lite-single.js", "text/javascript")).toContain(
      "immutable",
    );
  });

  it("applies the policy through withSecurityHeaders", () => {
    const res = withSecurityHeaders(
      new Response("<html></html>", { headers: { "content-type": "text/html" } }),
      prod(),
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
    const json = withSecurityHeaders(
      new Response("{}", { headers: { "content-type": "application/json" } }),
      prod("/_serverFn/getProfile"),
    );
    expect(json.headers.get("cache-control")).toBe("private, no-store");
    expect(json.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

describe("CORS posture", () => {
  const routeDir = join(process.cwd(), "src/routes/api");

  function walk(dir: string): string[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
    );
  }

  it("never combines a wildcard origin with credentials, and never wildcards authed endpoints", () => {
    for (const file of walk(routeDir)) {
      const src = readFileSync(file, "utf8");
      const wildcard = /Access-Control-Allow-Origin["'\s:]+\*/i.test(src);
      const credentials = /Access-Control-Allow-Credentials/i.test(src);
      expect(wildcard && credentials, `${file} mixes wildcard CORS with credentials`).toBe(false);
      expect(wildcard, `${file} exposes a wildcard CORS origin`).toBe(false);
    }
  });
});

describe("secret hygiene", () => {
  it("keeps public and server-only variables disjoint by prefix", () => {
    for (const name of PUBLIC_ENV_VARS) expect(name.startsWith("VITE_")).toBe(true);
    for (const name of SERVER_ENV_VARS) expect(name.startsWith("VITE_")).toBe(false);
  });

  it("flags missing required server secrets in production", () => {
    const report = checkServerEnv({ NODE_ENV: "production" }, true);
    expect(report.ok).toBe(false);
    expect(report.missing).toContain("SUPABASE_URL");
    expect(report.missing).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(report.missing).toContain("RATE_LIMIT_SALT");
  });

  it("passes when everything required is present", () => {
    const report = checkServerEnv(
      {
        SUPABASE_URL: "x",
        SUPABASE_PUBLISHABLE_KEY: "x",
        SUPABASE_SERVICE_ROLE_KEY: "x",
        RATE_LIMIT_SALT: "x",
        TURNSTILE_SECRET_KEY: "x",
        LOVABLE_API_KEY: "x",
      },
      true,
    );
    expect(report.ok).toBe(true);
    expect(report.warnings).toHaveLength(0);
  });

  it("warns when a server-looking secret is exposed with a VITE_ prefix", () => {
    const report = checkServerEnv({ VITE_TURNSTILE_SECRET_KEY: "x" }, false);
    expect(report.warnings.join(" ")).toContain("VITE_TURNSTILE_SECRET_KEY");
  });

  it("gitignore excludes env files but keeps the example", () => {
    const ignore = readFileSync(join(process.cwd(), ".gitignore"), "utf8");
    expect(ignore).toContain("\n.env\n");
    expect(ignore).toContain("\n.env.*\n");
    expect(ignore).toContain("!.env.example");
  });

  it(".env.example holds only names and placeholders", () => {
    const example = readFileSync(join(process.cwd(), ".env.example"), "utf8");
    for (const [, value] of example.matchAll(/^[A-Z_][A-Z0-9_]*=(.*)$/gm)) {
      const v = (value ?? "").trim();
      // Placeholders only: <...> or an obviously fake https URL with <...>.
      expect(v === "" || v.includes("<"), `real-looking value in .env.example`).toBe(true);
    }
    // No JWT/service-role/secret-key shaped strings.
    expect(example).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(example).not.toMatch(/sb_secret_[A-Za-z0-9_-]+/);
  });
});

describe("recovery bootstrap", () => {
  it("hash matches the inline script", async () => {
    const { RECOVERY_BOOTSTRAP_SCRIPT, RECOVERY_BOOTSTRAP_SCRIPT_HASH } = await import("./headers");
    const actual = `'sha256-${createHash("sha256").update(RECOVERY_BOOTSTRAP_SCRIPT, "utf8").digest("base64")}'`;
    expect(actual).toBe(RECOVERY_BOOTSTRAP_SCRIPT_HASH);
  });
});
