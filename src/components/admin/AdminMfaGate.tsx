import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { KeyRound, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n";

type GateState = "checking" | "no-factor" | "needs-code" | "ready";

/**
 * Blocks admin content until the session is elevated to aal2 with a verified
 * TOTP factor. The server functions enforce the same rule; this only makes the
 * requirement usable instead of a hard error.
 */
export function AdminMfaGate({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  const [state, setState] = useState<GateState>("checking");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    setError(null);
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === "aal2") {
      setState("ready");
      return;
    }
    const { data: list } = await supabase.auth.mfa.listFactors();
    const totp = (list?.totp ?? []).find((f) => f.status === "verified");
    if (!totp) {
      setState("no-factor");
      return;
    }
    setFactorId(totp.id);
    setState("needs-code");
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const verify = useCallback(async () => {
    if (!factorId) return;
    setBusy(true);
    setError(null);
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) throw new Error(challenge.error.message);
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: code.trim(),
      });
      if (verifyError) throw new Error(verifyError.message);
      setCode("");
      await check();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("admin.mfa.invalidCode"));
    } finally {
      setBusy(false);
    }
  }, [check, code, factorId]);

  if (state === "ready") return <>{children}</>;

  return (
    <div className="mx-auto max-w-lg py-12">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-primary" />
            {t("admin.mfa.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {state === "checking" && <p className="text-muted-foreground">{t("admin.mfa.checking")}</p>}

          {state === "no-factor" && (
            <>
              <p className="text-muted-foreground">
                {t("admin.mfa.noFactorBody")}
              </p>
              <Button asChild size="sm">
                <Link to="/account">
                  <KeyRound className="mr-2 size-4" />
                  {t("admin.mfa.enableCta")}
                </Link>
              </Button>
            </>
          )}

          {state === "needs-code" && (
            <>
              <p className="text-muted-foreground">
                {t("admin.mfa.needsCodeBody")}
              </p>
              <div className="flex gap-2">
                <Input
                  autoFocus
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className="w-32 font-mono tabular-nums"
                />
                <Button size="sm" disabled={busy || code.trim().length < 6} onClick={() => void verify()}>
                  {t("admin.mfa.verify")}
                </Button>
              </div>
            </>
          )}

          {error && <p className="text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
