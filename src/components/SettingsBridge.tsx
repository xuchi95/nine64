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
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* offline support is best-effort */
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
