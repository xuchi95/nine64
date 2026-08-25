import { useEffect, useRef, useState } from "react";
import { Crown, Loader2, Swords, Timer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useT } from "@/lib/i18n";
import { MATCH_ACCEPT_SECONDS, type MatchOpponent } from "@/hooks/useMatchmaking";

type Props = {
  open: boolean;
  opponent: MatchOpponent | null;
  deadline: number;
  pending?: boolean;
  variantLabel: string;
  timeControlLabel: string;
  onAccept: () => void;
  onDecline: () => void;
};

export function MatchFoundDialog({
  open,
  opponent,
  deadline,
  pending = false,
  variantLabel,
  timeControlLabel,
  onAccept,
  onDecline,
}: Props) {
  const { t } = useT();
  const [remaining, setRemaining] = useState(MATCH_ACCEPT_SECONDS);
  const autoFiredRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    if (pending) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0 && !autoFiredRef.current) {
        autoFiredRef.current = true;
        onAccept();
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [deadline, onAccept, open, pending]);

  useEffect(() => {
    if (!open) autoFiredRef.current = false;
  }, [open]);

  const pct = Math.max(0, Math.min(100, (remaining / MATCH_ACCEPT_SECONDS) * 100));

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onDecline()}>
      <DialogContent className="max-w-md overflow-hidden border-brass/40 p-0">
        <div className="border-b border-brass/25 bg-brass/10 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Swords className="size-5 text-brass" />
            {t("play.matchFound.title")}
          </DialogTitle>
          <DialogDescription className="mt-1">
            {t("play.matchFound.subtitle")}
          </DialogDescription>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("play.matchFound.opponent")}
                </p>
                <p className="truncate text-base font-semibold">
                  {opponent?.name ?? t("play.matchFound.loadingOpponent")}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("play.matchFound.rating")}
                </p>
                <p className="font-mono text-base font-semibold">{opponent?.rating ?? "—"}</p>
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">{t("play.online.variant")}</dt>
                <dd className="font-medium">{variantLabel}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("play.online.timeControl")}</dt>
                <dd className="font-medium">{timeControlLabel}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("play.matchFound.yourColor")}</dt>
                <dd className="flex items-center gap-1 font-medium">
                  <Crown className="size-3.5 text-brass" />
                  {opponent
                    ? opponent.color === "white"
                      ? t("play.matchFound.white")
                      : t("play.matchFound.black")
                    : "—"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Timer className="size-4" />
                {t("play.matchFound.autoAccept")}
              </span>
              <span className="font-mono font-semibold text-foreground">{remaining}s</span>
            </div>
            <Progress value={pct} className="h-1.5" />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button className="flex-1" size="lg" disabled={pending} onClick={onAccept}>
              {pending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              {pending ? t("play.matchFound.entering") : t("play.matchFound.accept")}
            </Button>
            <Button
              className="flex-1"
              size="lg"
              variant="outline"
              disabled={pending}
              onClick={() => void onDecline()}
            >
              <X className="mr-1.5 size-4" />
              {t("play.matchFound.decline")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
