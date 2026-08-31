/**
 * Guarded service-worker registration.
 *
 * The worker only ever runs in the published app: dev servers, Lovable
 * previews and iframes serve route chunks straight from Vite, where a cached
 * shell breaks dynamic imports. `?sw=off` is a kill switch that unregisters
 * everything, so a bad release can always be recovered from the URL bar.
 */

const SW_URL = "/sw.js";

const PREVIEW_HOST_PATTERNS = [
  /^id-preview--/,
  /^preview--/,
  /(^|\.)lovableproject\.com$/,
  /(^|\.)lovableproject-dev\.com$/,
  /(^|\.)beta\.lovable\.dev$/,
];

/** True when this context must not run the app service worker. */
export function shouldSkipServiceWorker(location: {
  hostname: string;
  search: string;
}): boolean {
  if (!import.meta.env.PROD) return true;
  if (new URLSearchParams(location.search).get("sw") === "off") return true;
  return PREVIEW_HOST_PATTERNS.some((pattern) => pattern.test(location.hostname));
}

async function unregisterAll() {
  if (!("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
  await Promise.allSettled(registrations.map((registration) => registration.unregister()));
}

/** Register (or in guarded contexts, tear down) the Nine64 service worker. */
export function setupServiceWorker(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const inIframe = window.self !== window.top;
  if (inIframe || shouldSkipServiceWorker(window.location)) {
    void unregisterAll();
    return;
  }

  const register = () => {
    void navigator.serviceWorker
      .register(SW_URL)
      .then((registration) => {
        // A waiting worker means a newer build is ready: activate it right away
        // so users never sit on a half-stale shell.
        const promote = () => registration.waiting?.postMessage({ type: "SKIP_WAITING" });
        promote();
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          installing?.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) promote();
          });
        });
        void registration.update().catch(() => undefined);
      })
      .catch(() => {
        /* offline support is best-effort */
      });
  };

  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
