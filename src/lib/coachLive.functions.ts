/**
 * Live Play Coach server functions.
 *
 * Two responsibilities, kept strictly apart:
 *   1. `styleLiveCoachMoment` — OPTIONAL paid AI restyling of an already
 *      decided, deterministic message. Quota is consumed before the call, and
 *      every failure degrades to `{ styled: null }` so the client keeps its
 *      deterministic text.
 *   2. `logLiveCoachEvent` — records what the coach flagged so the Skill Graph
 *      learns which mistakes the user repeats.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { SKILL_KEYS } from "@/lib/skills/catalog";

const TRIGGER_KINDS = [
  "blunder",
  "mistake",
  "missed_tactic",
  "hanging_piece",
  "opening_principle",
  "strategic_lesson",
] as const;

const StyleInput = z.object({
  locale: z.enum(["vi", "en"]),
  personality: z.enum(["friendly_teacher", "concise_master", "socratic_coach"]),
  mode: z.enum(["quiet", "normal", "teaching"]),
  kind: z.enum(TRIGGER_KINDS),
  playedSan: z.string().min(1).max(12),
  bestSan: z.string().max(12).nullable(),
  lossCp: z.number().int().min(0).max(20_000),
  baseMessage: z.string().min(1).max(600),
  baseQuestion: z.string().max(400).nullable(),
});

export interface StyleLiveCoachResult {
  styled: { message: string; question: string | null } | null;
  /** Why the deterministic fallback is being used, for the UI badge. */
  reason: "ok" | "quota" | "unavailable";
}

export const styleLiveCoachMoment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => StyleInput.parse(input))
  .handler(async ({ data, context }): Promise<StyleLiveCoachResult> => {
    const { enforceAll, userSubject } = await import("@/lib/ratelimit/limiter.server");
    const subject = userSubject(context.userId);

    try {
      await enforceAll([
        { action: "coach.live.burst", subject },
        { action: "coach.live.daily", subject },
        { action: "coach.live.monthly", subject },
      ]);
    } catch {
      // Out of paid quota: deterministic coaching continues uninterrupted.
      return { styled: null, reason: "quota" };
    }

    const { styleCoachMoment } = await import("@/lib/coach/live/gateway.server");
    const styled = await styleCoachMoment(data);
    return styled ? { styled, reason: "ok" } : { styled: null, reason: "unavailable" };
  });

const LogInput = z.object({
  localGameId: z.string().min(1).max(120),
  plyIndex: z.number().int().min(0).max(2000),
  moveNumber: z.number().int().min(0).max(1000),
  kind: z.enum(TRIGGER_KINDS),
  severity: z.enum(["info", "major", "critical"]),
  skillKey: z.enum(SKILL_KEYS as [string, ...string[]]),
  lossCp: z.number().int().min(0).max(20_000),
  mode: z.enum(["quiet", "normal", "teaching"]),
  personality: z.enum(["friendly_teacher", "concise_master", "socratic_coach"]),
  aiStyled: z.boolean(),
  retried: z.boolean(),
});

export const logLiveCoachEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => LogInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("coach_live_events").insert({
      user_id: context.userId,
      local_game_id: data.localGameId,
      ply_index: data.plyIndex,
      move_number: data.moveNumber,
      trigger_kind: data.kind,
      severity: data.severity,
      skill_key: data.skillKey,
      loss_cp: data.lossCp,
      coach_mode: data.mode,
      personality: data.personality,
      ai_styled: data.aiStyled,
      retried: data.retried,
    });
    if (error) throw new Error(error.message);

    // A flagged mistake is a negative signal for that skill; a retry that the
    // user got right is submitted separately by the retry flow.
    const { error: skillError } = await context.supabase.rpc("record_skill_events", {
      _events: [
        {
          skill_key: data.skillKey,
          outcome: "negative",
          source: "live_coach",
          game_id: data.localGameId,
          ply: data.plyIndex,
          event_key: `live_coach:${data.localGameId}:${data.plyIndex}`,
          detail: { kind: data.kind, loss_cp: data.lossCp },
        },
      ],
    });
    if (skillError) throw new Error(skillError.message);
    return { ok: true };
  });
