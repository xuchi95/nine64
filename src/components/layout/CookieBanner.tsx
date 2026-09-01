import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import { Cookie, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_COOKIE_PREFERENCES,
  getCookieConsent,
  getCookiePreferences,
  setCookiePreferences,
} from "@/lib/cookieConsent";
import { useT } from "@/lib/i18n";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const [prefs, setPrefs] = useState({
    preferences: DEFAULT_COOKIE_PREFERENCES.preferences,
    analytics: DEFAULT_COOKIE_PREFERENCES.analytics,
  });
  const { t } = useT();

  useEffect(() => {
    if (!getCookieConsent()) setVisible(true);
    const saved = getCookiePreferences();
    if (saved) setPrefs({ preferences: saved.preferences, analytics: saved.analytics });
    const onReset = () => {
      setPrefs({
        preferences: DEFAULT_COOKIE_PREFERENCES.preferences,
        analytics: DEFAULT_COOKIE_PREFERENCES.analytics,
      });
      setVisible(true);
    };
    window.addEventListener("nine64:cookie-consent-reset", onReset);
    return () => window.removeEventListener("nine64:cookie-consent-reset", onReset);
  }, []);

  // Khoá cuộn nền khi bảng đồng ý đang hiển thị.
  useEffect(() => {
    if (!visible) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [visible]);

  if (!visible) return null;

  const save = (value: { preferences: boolean; analytics: boolean }) => {
    setCookiePreferences(value);
    setVisible(false);
  };

  const dialog = (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={t("cookie.dialogLabel")}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 px-3 py-6 backdrop-blur-md sm:px-4"
    >
      <div className="mx-auto flex max-h-full w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-2xl border border-border/80 bg-card p-4 shadow-2xl sm:p-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-secondary/40 text-primary">
            <Cookie className="size-4" />
          </span>
          <div className="min-w-0 space-y-1">
            <h2 className="text-sm font-semibold sm:text-base">{t("cookie.dialogLabel")}</h2>
            <p className="min-w-0 text-xs leading-relaxed text-muted-foreground sm:text-sm">
              {t("cookie.message")}{" "}
              <Link to="/privacy" className="text-primary hover:underline">
                {t("cookie.privacy")}
              </Link>
              {" · "}
              <Link to="/cookie-policy" className="text-primary hover:underline">
                {t("cookie.learnMore")}
              </Link>
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-secondary/20 p-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-semibold sm:text-sm">
                <Lock className="size-3.5 text-primary" />
                {t("cookie.cat.necessary")}
                <span className="rounded-md border border-border/70 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("cookie.required")}
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{t("cookie.cat.necessaryDesc")}</p>
            </div>
            <Switch checked disabled aria-label={t("cookie.cat.necessary")} />
          </div>

          <div className="flex items-start justify-between gap-3 rounded-xl border border-border/70 p-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold sm:text-sm">{t("cookie.cat.preferences")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("cookie.cat.preferencesDesc")}</p>
            </div>
            <Switch
              checked={prefs.preferences}
              onCheckedChange={(v) => setPrefs((p) => ({ ...p, preferences: v }))}
              aria-label={t("cookie.cat.preferences")}
            />
          </div>

          <div className="flex items-start justify-between gap-3 rounded-xl border border-border/70 p-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold sm:text-sm">{t("cookie.cat.analytics")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("cookie.cat.analyticsDesc")}</p>
            </div>
            <Switch
              checked={prefs.analytics}
              onCheckedChange={(v) => setPrefs((p) => ({ ...p, analytics: v }))}
              aria-label={t("cookie.cat.analytics")}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => save({ preferences: false, analytics: false })}
          >
            {t("cookie.necessaryOnly")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => save(prefs)}>
            {t("cookie.savePrefs")}
          </Button>
          <Button size="sm" autoFocus onClick={() => save({ preferences: true, analytics: true })}>
            {t("cookie.acceptAll")}
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
