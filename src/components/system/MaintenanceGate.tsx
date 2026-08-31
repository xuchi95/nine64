import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Wrench } from "lucide-react";
import { getRuntimeSettings } from "@/lib/runtimeSettings.functions";

/**
 * Applies the published `maintenance_mode` / announcement settings.
 *
 * Never blocks the Admin Center, the auth flow (including OAuth callbacks),
 * health endpoints or internal API callbacks — an admin must always be able to
 * sign in and turn maintenance back off.
 *
 * The settings are fetched once per mount (the server caches them for 15s), so
 * rendering never touches the database.
 */
const EXEMPT = ["/admin", "/auth", "/api", "/health"];

function isExempt(pathname: string): boolean {
  return EXEMPT.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function MaintenanceGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const load = useServerFn(getRuntimeSettings);
  const [state, setState] = useState<{
    maintenance: boolean;
    message: string;
    announcement: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = (await load()) as { values: Record<string, unknown> };
        if (cancelled) return;
        setState({
          maintenance: res.values["maintenance_mode"] === true,
          message:
            typeof res.values["maintenance_message"] === "string"
              ? (res.values["maintenance_message"] as string)
              : "",
          announcement:
            res.values["announcement_enabled"] === true &&
            typeof res.values["announcement_message"] === "string" &&
            res.values["announcement_message"]
              ? (res.values["announcement_message"] as string)
              : null,
        });
      } catch {
        // Settings unavailable → behave exactly as if nothing was configured.
        if (!cancelled) setState({ maintenance: false, message: "", announcement: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (state?.maintenance && !isExempt(pathname)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <Wrench className="size-8 text-primary" />
        <h1 className="text-xl font-semibold">Nine64</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {state.message || "Nine64 đang bảo trì ngắn. Vui lòng quay lại sau ít phút."}
        </p>
      </div>
    );
  }

  return (
    <>
      {state?.announcement && (
        <div className="bg-primary/10 px-4 py-2 text-center text-sm text-primary">
          {state.announcement}
        </div>
      )}
      {children}
    </>
  );
}
