/*
 * Nine64 service worker.
 *
 * Design rules:
 *  - Versioned caches. A new SW version deletes every previous Nine64 shell
 *    cache on activate, so a stale broken build can never survive an update.
 *  - Never cache anything private: server functions, API routes, admin pages,
 *    the account area, the auth flow, or any credentialed request.
 *  - Navigations are network-first with an offline fallback, so a cached HTML
 *    shell never shadows a newer deploy.
 *  - Offline "packs" (lessons, puzzles, repertoires) live in their own cache
 *    that survives version bumps; only the user clears it.
 */

const VERSION = "v3";
const SHELL_CACHE = `nine64-shell-${VERSION}`;
const ASSET_CACHE = `nine64-assets-${VERSION}`;
/** Kept across versions on purpose: user-downloaded offline content. */
const PACK_CACHE = "nine64-offline-packs";
const OFFLINE_URL = "/offline";

/** Routes that genuinely work without a network (local engine + local data). */
const SHELL_ROUTES = [
  "/",
  OFFLINE_URL,
  "/play",
  "/play/ai",
  "/play/local",
  "/play/variants",
  "/analysis",
  "/puzzles",
  "/learn",
  "/manifest.webmanifest",
];

/** Path prefixes that must never touch the cache. */
const PRIVATE_PREFIXES = [
  "/api/",
  "/_serverFn",
  "/admin",
  "/account",
  "/auth",
  "/online",
  "/game/",
  "/studies",
  "/skills",
  "/training-plan",
  "/tournaments",
  "/watch/platform",
];

function isPrivatePath(pathname) {
  return PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

function isCacheableAsset(pathname) {
  return (
    pathname.startsWith("/engine/") ||
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/brand/") ||
    pathname.startsWith("/_build/") ||
    /\.(?:js|css|woff2?|png|jpg|jpeg|svg|webp|wasm|nnue|bin)$/.test(pathname)
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.allSettled(SHELL_ROUTES.map((url) => cache.add(url)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.allSettled(
        keys
          .filter((key) => key.startsWith("nine64-") && key !== SHELL_CACHE && key !== ASSET_CACHE && key !== PACK_CACHE)
          // Legacy caches from earlier versions are dropped here too.
          .concat(keys.filter((key) => key === "nexus-chess-v1"))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok && response.type === "basic") {
      const copy = response.clone();
      caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
    }
    return response;
  } catch {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    const packed = await caches.match(request, { cacheName: PACK_CACHE, ignoreSearch: true });
    if (packed) return packed;
    const offline = await caches.match(OFFLINE_URL);
    return offline || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

async function cacheFirstAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok && response.status === 200) {
    const copy = response.clone();
    caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Credentialed or private traffic bypasses the cache entirely.
  if (isPrivatePath(url.pathname)) return;
  if (request.headers.has("range")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isCacheableAsset(url.pathname)) {
    event.respondWith(
      cacheFirstAsset(request).catch(async () => {
        const packed = await caches.match(request, { cacheName: PACK_CACHE });
        return packed || Response.error();
      }),
    );
    return;
  }

  // Everything else: try the network, fall back to a downloaded pack entry.
  event.respondWith(
    fetch(request).catch(async () => {
      const packed = await caches.match(request, { cacheName: PACK_CACHE });
      return packed || Response.error();
    }),
  );
});
