import { useEffect, useRef, type ReactNode } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { X } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";

/**
 * Floating auth dialog: the page behind is dimmed, inert (no interaction) and
 * scroll-locked. Users can dismiss with the close button, Escape, or a click
 * on the backdrop.
 */
export function AuthModal({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);

  function close() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
    } else {
      void navigate({ to: "/", replace: true });
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* Dimmed, non-interactive page behind the dialog */}
      <div aria-hidden className="pointer-events-none select-none blur-[1px]">
        <AppShell>
          <div className="min-h-[60vh]" />
        </AppShell>
      </div>

      <div
        className="fixed inset-0 z-100 flex items-center justify-center overflow-y-auto bg-background/85 p-4 backdrop-blur-sm animate-in fade-in duration-200"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          className="panel relative my-auto w-full max-w-md p-6 shadow-2xl outline-none ring-1 ring-primary/15 animate-in fade-in zoom-in-95 duration-200 sm:p-8"
        >
          <button
            type="button"
            onClick={close}
            aria-label="Đóng"
            className="absolute right-3 top-3 grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-ring-brass"
          >
            <X className="size-4" />
          </button>
          {children}
        </div>
      </div>
    </>
  );
}
