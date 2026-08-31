import { useEffect, useId, useRef, useState } from "react";

/**
 * Cloudflare Turnstile widget — token collection only.
 *
 * The site key is public by design; the secret and the verdict live entirely on
 * the server (Siteverify). Tokens are single-use, so `reset()` must be called
 * after each submit attempt.
 */

// Cloudflare's official test site key: always passes, used until a real key is set.
const TEST_SITE_KEY = "1x00000000000000000000AA";
const SITE_KEY = (import.meta.env["VITE_TURNSTILE_SITE_KEY"] as string | undefined) || TEST_SITE_KEY;
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("turnstile_script_failed"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export interface TurnstileWidgetProps {
  /** Must match the `action` the server verifies. */
  action: string;
  onToken: (token: string | null) => void;
  className?: string;
}

export interface TurnstileHandle {
  reset: () => void;
}

export function TurnstileWidget({ action, onToken, className }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const [failed, setFailed] = useState(false);
  const domId = useId();

  onTokenRef.current = onToken;

  useEffect(() => {
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          action,
          theme: "auto",
          callback: (token: string) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "timeout-callback": () => onTokenRef.current(null),
          "error-callback": () => {
            setFailed(true);
            onTokenRef.current(null);
          },
        });
      })
      .catch(() => {
        setFailed(true);
        onTokenRef.current(null);
      });
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* widget already gone */
        }
      }
    };
  }, [action]);

  return (
    <div className={className}>
      <div id={domId} ref={containerRef} />
      {failed ? (
        <p className="mt-1 text-xs text-destructive">
          Không tải được lớp xác minh. Vui lòng tải lại trang.
        </p>
      ) : null}
    </div>
  );
}

/** Resets every rendered widget so a new single-use token is minted. */
export function resetTurnstile(): void {
  try {
    window.turnstile?.reset();
  } catch {
    /* not rendered */
  }
}
