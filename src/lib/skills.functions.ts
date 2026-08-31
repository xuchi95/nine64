/**
 * Skill Engine server functions.
 *
 * Clients may only submit *what happened* (skill key, outcome, stable event
 * key). XP values live in `skill_definitions` and are applied by the trusted
 * `record_skill_events` database function, so a tampered client cannot inflate
 * its own graph.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { SKILL_KEYS } from "./skills/catalog";
import type { SkillProgressRow } from "./skills/graph";

const EventSchema = z.object({
  skillKey: z.enum(SKILL_KEYS as [string, ...string[]]),
  outcome: z.enum(["positive", "negative", "neutral"]),
  source: z.enum(["review", "puzzle", "drill", "retry", "live_coach"]),
  gameId: z.string().max(120).nullable().optional(),
  ply: z.number().int().min(0).max(2000).nullable().optional(),
  eventKey: z.string().min(3).max(200),
  detail: z.record(z.string(), z.unknown()).optional(),
});

const RecordInput = z.object({ events: z.array(EventSchema).min(1).max(200) });

export const recordSkillEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RecordInput.parse(input))
  .handler(async ({ data, context }) => {
    const payload = data.events.map((e) => ({
      skill_key: e.skillKey,
      outcome: e.outcome,
      source: e.source,
      game_id: e.gameId ?? null,
      ply: e.ply ?? null,
      event_key: e.eventKey,
      detail: e.detail ?? {},
    }));
    const { data: result, error } = await context.supabase.rpc("record_skill_events", {
      _events: payload as never,
    });
    if (error) {
      // Surface a stable code; never leak raw SQL text to the browser.
      throw new Error(`SKILL_EVENTS_FAILED:${error.code ?? "unknown"}`);
    }
    return (result ?? { inserted: 0, skipped: 0 }) as { inserted: number; skipped: number };
  });

export const getSkillGraph = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [progress, definitions] = await Promise.all([
      context.supabase
        .from("user_skill_progress")
        .select("skill_key, xp, level, positive_events, negative_events, last_event_at"),
      context.supabase
        .from("skill_definitions")
        .select("key, category, name_vi, name_en, mastery_xp, sort_order, enabled")
        .eq("enabled", true)
        .order("sort_order"),
    ]);
    if (progress.error) throw new Error("SKILL_PROGRESS_UNAVAILABLE");
    if (definitions.error) throw new Error("SKILL_DEFINITIONS_UNAVAILABLE");

    const rows: SkillProgressRow[] = (progress.data ?? []).map((r) => ({
      skillKey: r.skill_key as SkillProgressRow["skillKey"],
      xp: r.xp,
      level: r.level,
      positives: r.positive_events,
      negatives: r.negative_events,
    }));
    return { rows, definitions: definitions.data ?? [] };
  });

/** Delete every skill event and progress row for the caller (privacy control). */
export const resetSkillGraph = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uid = context.userId;
    const del = await Promise.all([
      supabaseAdmin.from("skill_events").delete().eq("user_id", uid),
      supabaseAdmin.from("user_skill_progress").delete().eq("user_id", uid),
      supabaseAdmin.from("training_cards").delete().eq("user_id", uid),
    ]);
    if (del.some((r) => r.error)) throw new Error("SKILL_RESET_FAILED");
    return { ok: true };
  });
