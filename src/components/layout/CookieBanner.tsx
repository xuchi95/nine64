import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCookieConsent, setCookieConsent } from "@/lib/cookieConsent";
import { useT } from "@/lib/i18n";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const { t } = useT();

  useEffect(() => {
    if (!getCookieConsent()) setVisible(true);
    const onReset = () => setVisible(true);
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

  const accept = () => {
    setCookieConsent("accepted");
    setVisible(false);
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={t("cookie.dialogLabel")}
      className="fixed inset-0 z-[100] flex items-end justify-center bg-background/80 px-3 pb-3 backdrop-blur-md sm:px-4 sm:pb-6"
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 rounded-2xl border border-border/80 bg-card p-4 shadow-2xl sm:flex-row sm:items-center sm:gap-4 sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-secondary/40 text-primary">
            <Cookie className="size-4" />
          </span>
          <p className="min-w-0 text-xs leading-relaxed text-muted-foreground sm:text-sm">
            {t("cookie.message")}{" "}
            <Link to="/cookie-policy" className="text-primary hover:underline">
              {t("cookie.learnMore")}
            </Link>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
          <Button size="sm" autoFocus onClick={accept}>
            {t("cookie.accept")}
          </Button>
        </div>
      </div>
    </div>
  );
}

