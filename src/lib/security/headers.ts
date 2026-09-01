/**
 * P0.10 — production security headers + Content Security Policy.
 *
 * The policy is an explicit allowlist of the origins this app actually talks
 * to. It is enforced (never Report-Only) in production and only relaxed for
 * the Vite dev/HMR origin and for the editor preview iframe.
 */

/** Inline bootstrap script in `__root.tsx`; hashed so we need no unsafe-inline. */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var s=localStorage.getItem("nexus-chess.settings.v1");var m=s?(JSON.parse(s)||{}).appearance:null;if(m!=="light"&&m!=="dark")m="dark";var r=document.documentElement;r.classList.toggle("light",m==="light");r.classList.toggle("dark",m==="dark");r.style.colorScheme=m;}catch(e){}})();`;

/** sha256-base64 of THEME_BOOTSTRAP_SCRIPT — verified by headers.test.ts. */
export const THEME_BOOTSTRAP_SCRIPT_HASH =
  "'sha256-fM2OEhctPUZ7clQWBnv1DpBZlIl1Dabq93fAbr4p8aY='";

/**
 * Self-heal bootstrap: if the app has not hydrated a few seconds after load
 * (stale service-worker shell, dead asset cache, failed chunk), tear down the
 * worker + caches and reload once. Guarded by sessionStorage so it can never
 * loop.
 */
export const RECOVERY_BOOTSTRAP_SCRIPT = `(function(){try{var K="nine64:recovered";var t=setTimeout(function(){if(document.documentElement.hasAttribute("data-app-booted"))return;if(sessionStorage.getItem(K))return;sessionStorage.setItem(K,"1");var done=function(){location.reload()};var jobs=[];if(navigator.serviceWorker&&navigator.serviceWorker.getRegistrations){jobs.push(navigator.serviceWorker.getRegistrations().then(function(rs){return Promise.all(rs.map(function(r){return r.unregister()}))}))}if(window.caches&&caches.keys){jobs.push(caches.keys().then(function(ks){return Promise.all(ks.map(function(k){return k==="nine64-offline-packs"?null:caches.delete(k)}))}))}Promise.all(jobs).then(done,done)},8000);window.addEventListener("pagehide",function(){clearTimeout(t)});}catch(e){}})();`;

/** sha256-base64 of RECOVERY_BOOTSTRAP_SCRIPT — verified by headers.test.ts. */
export const RECOVERY_BOOTSTRAP_SCRIPT_HASH = "'sha256-IDmia2GMuX5nVoEgQkVHKFEzZXZHYH4x+H5e5OFBX8g='";

const TURNSTILE = "https://challenges.cloudflare.com";
const GOOGLE_FONTS_CSS = "https://fonts.googleapis.com";
const GOOGLE_FONTS_FILES = "https://fonts.gstatic.com";

/** Hosts allowed to embed the app (editor preview only). */
/**
 * Turnstile's challenge runtime evaluates generated code, so these routes get
 * 'unsafe-eval'. Everything else (game, analysis, account) stays strict.
 */
const TURNSTILE_ROUTES = [/^\/contact/, /^\/auth(\/|$)/];

export function needsTurnstileEval(pathname: string): boolean {
  return TURNSTILE_ROUTES.some((re) => re.test(pathname));
}

const PREVIEW_FRAME_ANCESTORS = [
  "https://lovable.dev",
  "https://*.lovable.dev",
  "https://*.lovable.app",
  "https://*.lovableproject.com",
];

export interface HeaderContext {
  /** Request URL, used for host/protocol decisions. */
  url: URL;
  /** Production build (enforced CSP, HSTS on HTTPS). */
  production: boolean;
  /** Public Supabase URL — REST/Realtime/Storage origin. */
  supabaseUrl?: string | undefined;
  /** Per-request nonce for framework-emitted inline scripts. */
  nonce?: string | undefined;
}

/** Preview/editor hosts are embedded in an iframe, so they cannot use DENY. */
export function isPreviewHost(hostname: string): boolean {
  return (
    hostname.endsWith(".lovable.app") ||
    hostname.endsWith(".lovableproject.com") ||
    hostname === "localhost" ||
    hostname === "127.0.0.1"
  );
}

function supabaseOrigins(supabaseUrl?: string): string[] {
  if (!supabaseUrl) return [];
  try {
    const { origin, host } = new URL(supabaseUrl);
    // Realtime uses the same host over WSS.
    return [origin, `wss://${host}`];
  } catch {
    return [];
  }
}

/** Builds the CSP directive string. */
export function buildCsp(ctx: HeaderContext): string {
  const supabase = supabaseOrigins(ctx.supabaseUrl);
  const supabaseHttp = supabase.filter((o) => o.startsWith("https://"));
  const dev = !ctx.production;

  const scriptSrc = [
    "'self'",
    // Stockfish compiles WebAssembly in a worker; wasm-unsafe-eval is the
    // narrow directive for that and does NOT enable eval().
    "'wasm-unsafe-eval'",
    THEME_BOOTSTRAP_SCRIPT_HASH,
    // TanStack Start emits per-request inline bootstrap scripts; they carry
    // this nonce so we never need 'unsafe-inline' in production.
    ...(ctx.nonce ? [`'nonce-${ctx.nonce}'`] : []),
    TURNSTILE,
    // Turnstile-bearing routes only; see needsTurnstileEval.
    ...(needsTurnstileEval(ctx.url.pathname) ? ["'unsafe-eval'"] : []),
    // Dev only: Vite HMR injects inline/eval'd module shims.
    ...(dev ? ["'unsafe-inline'", "'unsafe-eval'"] : []),
  ];

  const connectSrc = [
    "'self'",
    ...supabase,
    TURNSTILE,
    ...(dev ? ["ws:", "wss:", "http://localhost:*"] : []),
  ];

  const frameAncestors =
    ctx.production && !isPreviewHost(ctx.url.hostname) ? ["'none'"] : PREVIEW_FRAME_ANCESTORS;

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "script-src": scriptSrc,
    // React/Tailwind emit style attributes; scripts stay hash-pinned.
    "style-src": ["'self'", "'unsafe-inline'", GOOGLE_FONTS_CSS],
    "style-src-elem": ["'self'", "'unsafe-inline'", GOOGLE_FONTS_CSS],
    "font-src": ["'self'", GOOGLE_FONTS_FILES, "data:"],
    "img-src": ["'self'", "data:", "blob:", ...supabaseHttp],
    "media-src": ["'self'", "data:"],
    "connect-src": connectSrc,
    // Stockfish worker is same-origin; blob: covers bundler-generated workers.
    "worker-src": ["'self'", "blob:"],
    "child-src": ["'self'", "blob:", TURNSTILE],
    "frame-src": ["'self'", TURNSTILE],
    "frame-ancestors": frameAncestors,
    "form-action": ["'self'"],
    "manifest-src": ["'self'"],
  };

  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (ctx.production) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

/** Full response header set for an HTML document. */
export function buildSecurityHeaders(ctx: HeaderContext): Record<string, string> {
  const headers: Record<string, string> = {
    "content-security-policy": buildCsp(ctx),
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy":
      "accelerometer=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()",
    // same-origin-allow-popups keeps OAuth popup callbacks working; COEP is
    // intentionally NOT set (it would break Google Fonts, Turnstile and OAuth).
    "cross-origin-opener-policy": "same-origin-allow-popups",
    "cross-origin-resource-policy": "same-origin",
    "x-dns-prefetch-control": "off",
  };

  if (ctx.production && !isPreviewHost(ctx.url.hostname)) {
    // Legacy fallback for CSP frame-ancestors 'none'.
    headers["x-frame-options"] = "DENY";
  }
  if (ctx.url.protocol === "https:" && ctx.production && !isPreviewHost(ctx.url.hostname)) {
    headers["strict-transport-security"] = "max-age=31536000; includeSubDomains; preload";
  }
  return headers;
}

/** Cache policy: HTML/API responses must never land in a shared cache. */
export function cacheControlFor(pathname: string, contentType: string): string | null {
  if (/^\/(assets|engine)\//.test(pathname) && !contentType.includes("text/html")) {
    return "public, max-age=31536000, immutable";
  }
  if (contentType.includes("text/html")) return "no-store";
  if (pathname.startsWith("/api/") || pathname.startsWith("/_serverFn/")) return "private, no-store";
  return null;
}

/** Applies the headers to a response without dropping existing ones. */
export function withSecurityHeaders(response: Response, ctx: HeaderContext): Response {
  const contentType = response.headers.get("content-type") ?? "";
  const isDocument = contentType.includes("text/html");
  const headers = new Headers(response.headers);

  const all = buildSecurityHeaders(ctx);
  for (const [key, value] of Object.entries(all)) {
    // CSP/COOP/frame headers only matter on documents; the rest are cheap and
    // useful everywhere (nosniff on JSON, etc).
    if (!isDocument && (key === "content-security-policy" || key === "cross-origin-opener-policy")) {
      continue;
    }
    if (!headers.has(key)) headers.set(key, value);
  }

  const cache = cacheControlFor(ctx.url.pathname, contentType);
  if (cache && !headers.has("cache-control")) headers.set("cache-control", cache);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
