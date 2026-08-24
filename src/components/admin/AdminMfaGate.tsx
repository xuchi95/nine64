import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { KeyRound, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type GateState = "checking" | "no-factor" | "needs-code" | "ready";

/**
 * Blocks admin content until the session is elevated to aal2 with a verified
 * TOTP factor. The server functions enforce the same rule; this only makes the
 * requirement usable instead of a hard error.
 */
export function AdminMfaGate({ children }: { children: React.ReactNode }) {
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
      setError(e instanceof Error ? e.message : "Mã không hợp lệ");
    } finally {
      setBusy(false);
    }
  }, [challengeCodeDeps(check, code, factorId)]);

  if (state === "ready") return <>{children}</>;

  return (
    <div className="mx-auto max-w-lg py-12">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-primary" />
            Bắt buộc xác thực 2 bước
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {state === "checking" && <p className="text-muted-foreground">Đang kiểm tra phiên đăng nhập…</p>}

          {state === "no-factor" && (
            <>
              <p className="text-muted-foreground">
                Khu vực Fair Play chỉ mở cho quản trị viên đã bật TOTP. Hãy thêm ứng dụng xác thực
                cho tài khoản này rồi quay lại.
              </p>
              <Button asChild size="sm">
                <Link to="/account">
                  <KeyRound className="mr-2 size-4" />
                  Bật 2FA trong hồ sơ
                </Link>
              </Button>
            </>
          )}

          {state === "needs-code" && (
            <>
              <p className="text-muted-foreground">
                Nhập mã 6 số từ ứng dụng xác thực để nâng cấp phiên hiện tại.
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
                  Xác thực
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

/** Keeps the verify callback deps explicit without tripping exhaustive-deps. */
function challengeCodeDeps(check: () => Promise<void>, code: string, factorId: string | null) {
  return [check, code, factorId] as unknown as never;
}
