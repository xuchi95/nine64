import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/auth/callback")({
  component: CallbackPage,
});

function CallbackPage() {
  const { t } = useT();
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      if (error || !data.session) {
        navigate({ to: "/auth/login", replace: true });
        return;
      }
      navigate({ to: "/", replace: true });
    });
  }, [navigate, t]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm">{t("study.callback.completing")}</p>
      </div>
    </div>
  );
}
