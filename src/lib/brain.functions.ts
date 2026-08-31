/**
 * Personal Chess Brain server functions.
 *
 * All profile numbers are computed deterministically from stored rows; the AI
 * gateway is only used to phrase the weekly narrative around facts computed
 * here.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadBrainSnapshot, type BrainSnapshot } from "@/lib/brain/snapshot.server";
import { buildWeeklyReport, type WeeklyReport } from "@/lib/brain/weekly";

export type { BrainSnapshot };

export const getBrainSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BrainSnapshot> =>
    loadBrainSnapshot(context.supabase as never, context.userId),
  );

const SaveInput = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  budgetMinutes: z.number().int().min(5).max(120),
  minutesSpent: z.number().int().min(0).max(600),
  plan: z.unknown().optional(),
  results: z
    .array(
      z.object({
        blockId: z.string().max(120),
        kind: z.string().max(40),
        status: z.enum(["completed", "failed", "skipped"]),
      }),
    )
    .max(20),
  status: z.enum(["active", "completed", "abandoned"]),
});

/** Persists the day's session and its per-block outcomes (learning metrics). */
export const saveTrainingSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveInput.parse(input))
  .handler(async ({ data, context }) => {
    const completed = data.results.filter((r) => r.status === "completed").length;
    const failed = data.results.filter((r) => r.status === "failed").length;
    const { error } = await context.supabase.from("training_sessions").upsert(
      {
        user_id: context.userId,
        day: data.day,
        budget_minutes: data.budgetMinutes,
        minutes_spent: data.minutesSpent,
        plan: (data.plan ?? {}) as never,
        results: data.results as never,
        completed_blocks: completed,
        failed_blocks: failed,
        status: data.status,
      } as never,
      { onConflict: "user_id,day" },
    );
    if (error) throw new Error(`TRAINING_SESSION_SAVE_FAILED:${error.code ?? "unknown"}`);
    return { ok: true, completed, failed };
  });

const WeeklyInput = z.object({
  locale: z.enum(["vi", "en"]).default("vi"),
  narrative: z.boolean().default(true),
});

export const getWeeklyReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => WeeklyInput.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<{ report: WeeklyReport; summary: string | null }> => {
    const snapshot = await loadBrainSnapshot(context.supabase as never, context.userId);
    const report = buildWeeklyReport({
      events: snapshot.events,
      games: snapshot.games,
      sessions: snapshot.sessions,
    });
    let summary: string | null = null;
    if (data.narrative) {
      const { summariseWeek } = await import("@/lib/brain/narrative.server");
      summary = await summariseWeek(report, data.locale);
    }
    return { report, summary };
  });
