import { useEffect } from "react";
import { hydrateSettings, useSettings } from "@/lib/settings";
import { hydrateHistory } from "@/lib/history";
import { hydrateLearn } from "@/lib/learn/store";
import { configureSound } from "@/lib/sound";

/**
 * Applies persisted client settings after hydration: colour mode on <html> and
 * the sound engine configuration.
 */
export function SettingsBridge() {
  const settings = useSettings();

  useEffect(() => {
    hydrateSettings();
    hydrateHistory();
    hydrateLearn();
  }, []);

  useEffect(() => {
    configureSound({ enabled: settings.soundEnabled, volume: settings.sfxVolume });
  }, [settings.soundEnabled, settings.sfxVolume]);

  useEffect(() => {
    // Dev/preview builds serve route chunks straight from Vite; a cached shell
    // there can break dynamic imports, so only run the SW in production.
    if (import.meta.env.DEV) {
      void navigator.serviceWorker?.getRegistrations?.().then((regs) =>
        regs.forEach((r) => void r.unregister()),
      );
      return;
    }
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* offline support is best-effort */
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  // A failed route-chunk import (server restart, flaky network) leaves a blank
  // screen; recover once with a hard reload instead of stalling.
  useEffect(() => {
    const KEY = "nine64:chunk-reload";
    const onError = (event: Event) => {
      const message =
        (event as ErrorEvent).message ??
        String((event as PromiseRejectionEvent).reason ?? "");
      if (!/Failed to fetch dynamically imported module|Importing a module script failed/i.test(message))
        return;
      if (sessionStorage.getItem(KEY)) return;
      sessionStorage.setItem(KEY, "1");
      window.location.reload();
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason ?? "");
      onError(new ErrorEvent("error", { message }));
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    const clear = window.setTimeout(() => sessionStorage.removeItem(KEY), 10_000);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.clearTimeout(clear);
    };
  }, []);


  return null;
}
