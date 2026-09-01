import { useEffect } from "react";
import { hydrateSettings, useSettings } from "@/lib/settings";
import { hydrateHistory } from "@/lib/history";
import { hydrateLearn } from "@/lib/learn/store";
import { hydrateLocale } from "@/lib/i18n";
import { configureSound } from "@/lib/sound";
import { setupServiceWorker } from "@/lib/pwa/register";


/**
 * Applies persisted client settings after hydration: colour mode on <html> and
 * the sound engine configuration.
 */
export function SettingsBridge() {
  const settings = useSettings();

  // Marks a successful hydration for the inline recovery bootstrap.
  useEffect(() => {
    document.documentElement.setAttribute("data-app-booted", "");
  }, []);

  useEffect(() => {
    hydrateSettings();
    hydrateLocale();
    hydrateHistory();
    hydrateLearn();
  }, []);

  useEffect(() => {
    configureSound({ enabled: settings.soundEnabled, volume: settings.sfxVolume });
  }, [settings.soundEnabled, settings.sfxVolume]);

  useEffect(() => {
    // Guarded: never registers in dev, previews or iframes; `?sw=off` clears it.
    setupServiceWorker();
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
