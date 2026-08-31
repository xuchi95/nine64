/**
 * Practice — Chessable-style recall over the user's repertoire.
 *
 * Nine64 plays the opponent move, the user must recall their repertoire reply.
 * The server owns scheduling: the client reports pass/fail, never the interval.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { review as reviewCard, type Grade, type SrsState } from "@/lib/learn/fsrs";
import { sansOf, type PracticeCard, type RepertoireColor } from "./repertoireTypes";

type Row = Record<string, unknown>;

const DueInput = z.object({
  color: z.enum(["white", "black"]).nullable().default(null),
  limit: z.number().int().min(1).max(40).default(12),
  includeNew: z.boolean().default(true),
});

export const getPracticeQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DueInput.parse(input))
  .handler(async ({ data, context }): Promise<{ cards: PracticeCard[]; due: number; total: number }> => {
    const { supabase, userId } = context;
    let query = supabase
      .from("repertoire_cards")
      .select("id, move_id, repertoire_id, color, path, fen, expected_san, due, reps, lapses")
      .eq("user_id", userId)
      .order("due")
      .limit(data.limit * 3);
    if (data.color) query = query.eq("color", data.color);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const now = Date.now();
    const all = (rows ?? []) as Row[];
    const selected = all
      .filter((r) => data.includeNew || Number(r["reps"] ?? 0) > 0)
      .filter((r) => new Date(String(r["due"])).getTime() <= now || Number(r["reps"] ?? 0) === 0)
      .slice(0, data.limit);

    const moveIds = selected.map((r) => String(r["move_id"]));
    const { data: moves } = moveIds.length
      ? await supabase
          .from("repertoire_moves")
          .select("id, notes, line_id")
          .in("id", moveIds)
      : { data: [] as Row[] };
    const lineIds = [...new Set(((moves ?? []) as Row[]).map((m) => String(m["line_id"])))];
    const { data: lines } = lineIds.length
      ? await supabase.from("repertoire_lines").select("id, eco, opening_name").in("id", lineIds)
      : { data: [] as Row[] };
    const moveById = new Map(((moves ?? []) as Row[]).map((m) => [String(m["id"]), m]));
    const lineById = new Map(((lines ?? []) as Row[]).map((l) => [String(l["id"]), l]));

    const cards: PracticeCard[] = selected.map((r) => {
      const move = moveById.get(String(r["move_id"]));
      const line = move ? lineById.get(String(move["line_id"])) : undefined;
      const path = String(r["path"] ?? "");
      const sans = sansOf(path);
      return {
        id: String(r["id"]),
        moveId: String(r["move_id"]),
        repertoireId: String(r["repertoire_id"]),
        color: (r["color"] as RepertoireColor) ?? "white",
        path,
        fen: String(r["fen"] ?? ""),
        expectedSan: String(r["expected_san"] ?? ""),
        setup: sans.slice(0, Math.max(sans.length - 1, 0)),
        notes: String(move?.["notes"] ?? ""),
        openingName: (line?.["opening_name"] as string | null) ?? null,
        eco: (line?.["eco"] as string | null) ?? null,
        due: String(r["due"] ?? new Date().toISOString()),
        reps: Number(r["reps"] ?? 0),
        lapses: Number(r["lapses"] ?? 0),
      };
    });

    const dueCount = all.filter((r) => new Date(String(r["due"])).getTime() <= now).length;
    return { cards, due: dueCount, total: all.length };
  });

const GradeInput = z.object({
  cardId: z.string().uuid(),
  correct: z.boolean(),
  /** Hesitation signal from the client; only nudges the grade, never the reward. */
  slow: z.boolean().default(false),
});

export const gradePracticeCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GradeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("repertoire_cards")
      .select("difficulty, stability, reps, lapses, due, last_review")
      .eq("id", data.cardId)
      .eq("user_id", userId)
      .single();
    if (error) throw new Error(error.message);
    const current = row as Row;
    const state: SrsState = {
      difficulty: Number(current["difficulty"] ?? 5.6),
      stability: Number(current["stability"] ?? 0),
      reps: Number(current["reps"] ?? 0),
      lapses: Number(current["lapses"] ?? 0),
      due: String(current["due"] ?? new Date().toISOString()),
      lastReview: (current["last_review"] as string | null) ?? null,
    };
    const grade: Grade = data.correct ? (data.slow ? 2 : 3) : 1;
    const next = reviewCard(state, grade);

    const { error: saveError } = await supabase
      .from("repertoire_cards")
      .update({
        difficulty: next.difficulty,
        stability: next.stability,
        reps: next.reps,
        lapses: next.lapses,
        due: next.due,
        last_review: next.lastReview,
      })
      .eq("id", data.cardId)
      .eq("user_id", userId);
    if (saveError) throw new Error(saveError.message);
    return { due: next.due, reps: next.reps, lapses: next.lapses };
  });
