import { useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Brain, Lightbulb, ShieldAlert, Sparkles, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { coachGame } from "@/lib/coach.functions";
import { buildCoachDigest } from "@/lib/coach/digest";
import { SEVERITY_META, type CoachReport } from "@/lib/coach/types";
import { attachCoach, type SavedGame } from "@/lib/history";

interface Props {
  game: SavedGame;
  onSelectMove?: (plyIndex: number) => void;
}

export function CoachPanel({ game, onSelectMove }: Props) {
  const runCoach = useServerFn(coachGame);
  const [pending, setPending] = useState(false);
  const side = game.playerColor ?? "w";
  const report = game.coach ?? null;

  const mistakes = useMemo(() => {
    if (!report) return [];
    return [...report.mistakes].sort(
      (a, b) =>
        SEVERITY_META[a.severity].order - SEVERITY_META[b.severity].order ||
        a.moveNumber - b.moveNumber,
    );
  }, [report]);

  async function generate() {
    setPending(true);
    try {
      const digest = buildCoachDigest(game, side);
      const result = (await runCoach({ data: { digest } })) as CoachReport;
      attachCoach(game.id, result);
      toast.success("Chuyên gia đã phân tích xong ván của bạn");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không tạo được bản phân tích");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Brain className="size-4 text-primary" /> Chuyên gia phân tích
        </h2>
        {report && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => void generate()}>
            {pending ? "Đang phân tích…" : "Phân tích lại"}
          </Button>
        )}
      </div>

      {!report && (
        <div className="mt-3">
          <p className="text-sm text-muted-foreground">
            Nhận bình luận bằng ngôn từ của chuyên gia: nhận định từng giai đoạn, các lỗi từ cơ bản
            đến trầm trọng và lời khuyên cụ thể cho ván này.
            {!game.review && " Nên chạy engine review trước để phân tích chính xác hơn."}
          </p>
          <Button className="mt-3 w-full" disabled={pending} onClick={() => void generate()}>
            <Sparkles className="size-4" />
            {pending ? "Đang phân tích…" : "Phân tích với chuyên gia AI"}
          </Button>
        </div>
      )}

      {report && (
        <div className="mt-3 space-y-4 text-sm">
          <div className="rounded-md bg-surface-2 p-3">
            <p className="font-display text-base font-bold leading-snug">{report.headline}</p>
            {report.verdict && (
              <p className="mt-2 text-muted-foreground whitespace-pre-line">{report.verdict}</p>
            )}
            {report.levelImpression && (
              <p className="mt-2 text-xs text-muted-foreground">{report.levelImpression}</p>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <PhaseCard label="Khai cuộc" text={report.phases.opening} />
            <PhaseCard label="Trung cuộc" text={report.phases.middlegame} />
            <PhaseCard label="Tàn cuộc" text={report.phases.endgame} />
          </div>

          {report.strengths.length > 0 && (
            <Section icon={<Target className="size-4 text-primary" />} title="Bạn làm tốt">
              <ul className="space-y-1">
                {report.strengths.map((s, i) => (
                  <li key={i} className="text-muted-foreground">
                    • {s}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {mistakes.length > 0 && (
            <Section
              icon={<ShieldAlert className="size-4 text-destructive" />}
              title="Lỗi trong ván (cơ bản → trầm trọng)"
            >
              <ul className="space-y-2">
                {mistakes.map((m, i) => {
                  const meta = SEVERITY_META[m.severity];
                  const plyIndex = Math.max(
                    0,
                    (m.moveNumber - 1) * 2 + (side === "w" ? 0 : 1),
                  );
                  return (
                    <li key={i} className={`rounded-md border p-3 ${meta.ring}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-xs font-semibold uppercase tracking-wider ${meta.tone}`}>
                          {meta.title}
                        </span>
                        <button
                          type="button"
                          className="tabular rounded bg-background/60 px-1.5 py-0.5 text-xs font-semibold hover:text-primary"
                          onClick={() => onSelectMove?.(plyIndex)}
                        >
                          {m.moveNumber}. {m.san}
                        </button>
                      </div>
                      <p className="mt-1 font-medium">{m.title}</p>
                      {m.whatHappened && (
                        <p className="mt-1 text-muted-foreground">{m.whatHappened}</p>
                      )}
                      {m.betterPlan && (
                        <p className="mt-1 text-muted-foreground">
                          <span className="font-medium text-foreground">Nên làm: </span>
                          {m.betterPlan}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          {report.habits.length > 0 && (
            <Section icon={<ShieldAlert className="size-4 text-warning" />} title="Thói quen cần sửa">
              <ul className="space-y-1">
                {report.habits.map((h, i) => (
                  <li key={i} className="text-muted-foreground">
                    • {h}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {report.advice.length > 0 && (
            <Section icon={<Lightbulb className="size-4 text-accent" />} title="Lời khuyên">
              <ol className="space-y-1">
                {report.advice.map((a, i) => (
                  <li key={i} className="text-muted-foreground">
                    {i + 1}. {a}
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {report.drills.length > 0 && (
            <Section icon={<Target className="size-4 text-primary" />} title="Nên luyện">
              <div className="flex flex-wrap gap-2">
                {report.drills.map((d, i) => (
                  <span
                    key={i}
                    className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs"
                  >
                    {d}
                  </span>
                ))}
              </div>
            </Section>
          )}

          <p className="text-[11px] text-muted-foreground">
            Bình luận do AI tạo từ dữ liệu engine của ván này — dùng như góc nhìn huấn luyện, không
            phải chân lý tuyệt đối.
          </p>
        </div>
      )}
    </div>
  );
}

function PhaseCard({ label, text }: { label: string; text: string }) {
  if (!text) return null;
  return (
    <div className="rounded-md border border-border bg-surface-2 p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-muted-foreground">{text}</p>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon} {title}
      </p>
      {children}
    </div>
  );
}
