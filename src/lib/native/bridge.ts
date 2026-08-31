/**
 * Native shell integration boundary.
 *
 * The web app never imports Capacitor directly: plugins are loaded lazily and
 * only when running inside a native shell, so the browser bundle is untouched
 * and the project stays Capacitor-compatible without the dependency.
 */

import { resolveDeepLink } from "./deepLinks";

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, unknown>;
}

function capacitor(): CapacitorGlobal | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

/** True only inside an iOS/Android Capacitor shell. */
export function isNativeApp(): boolean {
  return capacitor()?.isNativePlatform?.() === true;
}

export function nativePlatform(): "ios" | "android" | "web" {
  const platform = capacitor()?.getPlatform?.();
  return platform === "ios" || platform === "android" ? platform : "web";
}

type AppPlugin = {
  addListener: (
    event: "appUrlOpen",
    handler: (data: { url: string }) => void,
  ) => Promise<{ remove: () => void }> | { remove: () => void };
};

/**
 * Route inbound deep links into the SPA router.
 * Returns a cleanup function; a no-op on the web.
 */
export function attachDeepLinkHandler(navigate: (path: string) => void): () => void {
  if (!isNativeApp()) return () => {};
  const plugin = capacitor()?.Plugins?.["App"] as AppPlugin | undefined;
  if (!plugin?.addListener) return () => {};

  let remove: (() => void) | null = null;
  const result = plugin.addListener("appUrlOpen", ({ url }) => {
    const resolved = resolveDeepLink(url);
    if (resolved) navigate(resolved.path);
  });

  void Promise.resolve(result).then((handle) => {
    remove = () => handle.remove();
  });

  return () => remove?.();
}
