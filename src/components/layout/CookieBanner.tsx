import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Cookie, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCookieConsent, setCookieConsent } from "@/lib/cookieConsent";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!getCookieConsent()) setVisible(true);
    const onReset = () => setVisible(true);
    window.addEventListener("nine64:cookie-consent-reset", onReset);
    return () => window.removeEventListener("nine64:cookie-consent-reset", onReset);
  }, []);

  if (!visible) return null;

  const choose = (value: "accepted" | "rejected") => {
    setCookieConsent(value);
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Thông báo cookie"
      className="fixed inset-x-0 bottom-0 z-50 px-3 pb-3 sm:px-4 sm:pb-4"
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 rounded-2xl border border-border/80 bg-card/95 p-4 shadow-xl backdrop-blur-md sm:flex-row sm:items-center sm:gap-4 sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-secondary/40 text-primary">
            <Cookie className="size-4" />
          </span>
          <p className="min-w-0 text-xs leading-relaxed text-muted-foreground sm:text-sm">
            Chúng tôi dùng cookie để ghi nhớ phiên đăng nhập và tuỳ chọn giao diện, cùng cookie
            phân tích không bắt buộc để cải thiện trải nghiệm.{" "}
            <Link to="/cookie-policy" className="text-primary hover:underline">
              Tìm hiểu thêm
            </Link>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
          <Button variant="outline" size="sm" onClick={() => choose("rejected")}>
            Từ chối
          </Button>
          <Button size="sm" onClick={() => choose("accepted")}>
            Chấp nhận
          </Button>
          <button
            type="button"
            aria-label="Đóng"
            onClick={() => choose("rejected")}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground sm:hidden"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
