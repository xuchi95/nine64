import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { submitPlayerReport } from "@/lib/fairplay.functions";
import { useT } from "@/lib/i18n";

const REASONS = ["engine_assistance", "sandbagging", "stalling", "abuse", "other"] as const;
type Reason = (typeof REASONS)[number];

/**
 * A complaint, not a verdict. The opponent is derived on the server from the
 * game, so this form never lets a player choose a target or a sanction.
 */
export function ReportPlayerCard({ gameId }: { gameId: string }) {
  const { t } = useT();
  const submit = useServerFn(submitPlayerReport);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason>("engine_assistance");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!open) {
    return (
      <div className="space-y-2">
        {message && <p className="text-xs text-muted-foreground">{message}</p>}
        {!message && (
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setOpen(true)}>
            <Flag className="mr-2 size-4" />
            {t("game.report.cta")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border/60 p-3">
      <p className="text-sm font-medium">{t("game.report.title")}</p>
      <p className="text-xs text-muted-foreground">{t("game.report.hint")}</p>
      <Select value={reason} onValueChange={(v) => setReason(v as Reason)}>
        <SelectTrigger className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {REASONS.map((value) => (
            <SelectItem key={value} value={value}>
              {t(`game.report.reason.${value}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Textarea
        value={note}
        maxLength={1000}
        rows={3}
        placeholder={t("game.report.notePlaceholder")}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void submit({ data: { gameId, reason, ...(note.trim() ? { note: note.trim() } : {}) } })
              .then((res) => {
                const code = (res as { code?: string })?.code;
                setMessage(
                  code === "ALREADY_REPORTED"
                    ? t("game.report.already")
                    : code === "REPORTED"
                      ? t("game.report.sent")
                      : t("game.report.failed"),
                );
                setOpen(false);
              })
              .catch(() => setMessage(t("game.report.failed")))
              .finally(() => setBusy(false));
          }}
        >
          {t("game.report.submit")}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
          {t("game.report.cancel")}
        </Button>
      </div>
    </div>
  );
}
