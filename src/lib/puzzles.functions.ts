/**
 * Puzzle platform server functions.
 *
 * The server owns selection, rating and SRS: the client only reports what it
 * did (solved / failed, hints used, time), never the reward.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { coerceThemes, THEME_KEYS, type ThemeKey } from "./puzzles/themes";
import { PUZZLE_MODES, MODE_RULES, rampTarget, type PuzzleMode } from "./puzzles/modes";
import { selectPuzzles, type SelectionContext } from "./puzzles/selection";
import { applyPuzzleResult, ratingFromRow, DEFAULT_PUZZLE_RATING } from "./puzzles/rating";
import { gradeFromLearningScore, learningScore } from "./puzzles/hints";
import { review as reviewCard, type SrsState } from "./learn/fsrs";
import type { PlatformPuzzle, PuzzlePly, SrsCard } from "./puzzles/types";

const RATING_BAND = 450;
const CANDIDATE_LIMIT = 220;
const RECENT_WINDOW = 60;

const QueueInput = z.object({
  mode: z.enum(PUZZLE_MODES as unknown as [PuzzleMode, ...PuzzleMode[]]).default("adaptive"),
  themes: z.array(z.enum(THEME_KEYS as unknown as [ThemeKey, ...ThemeKey[]])).max(6).default([]),
  limit: z.number().int().min(1).max(20).default(8),
  solvedInRun: z.number().int().min(0).max(500).default(0),
});

type Row = Record<string, unknown>;

function plies(value: unknown): PuzzlePly[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((m) => {
      const item = m as Row;
      const uci = typeof item?.["uci"] === "string" ? (item["uci"] as string) : null;
      if (!uci) return null;
      return { uci, san: typeof item["san"] === "string" ? (item["san"] as string) : uci };
    })
    .filter((m): m is PuzzlePly => m !== null);
}

function phaseOf(value: unknown): PlatformPuzzle["phase"] {
  return value === "opening" || value === "endgame" ? value : "middlegame";
}

export const getPuzzleQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => QueueInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const rules = MODE_RULES[data.mode];

    const [ratingRes, cardsRes, attemptsRes] = await Promise.all([
      supabase
        .from("puzzle_ratings")
        .select("rating, rating_deviation, volatility")
        .eq("user_id", userId)
        .eq("scope", "overall")
        .maybeSingle(),
      supabase.from("srs_cards").select("*").eq("user_id", userId).order("due").limit(400),
      supabase
        .from("puzzle_attempts")
        .select("puzzle_id, themes, solved, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

    const rating = ratingFromRow(ratingRes.data as Row | null);
    const target = rampTarget(data.mode, rating.rating, data.solvedInRun);

    const cards: Record<string, SrsCard> = {};
    for (const raw of (cardsRes.data ?? []) as Row[]) {
      const id = String(raw["puzzle_id"]);
      cards[id] = {
        puzzleId: id,
        source: raw["source"] === "personal" ? "personal" : "global",
        difficulty: Number(raw["difficulty"] ?? 5.6),
        stability: Number(raw["stability"] ?? 0),
        reps: Number(raw["reps"] ?? 0),
        lapses: Number(raw["lapses"] ?? 0),
        due: String(raw["due"]),
        lastReview: (raw["last_review"] as string | null) ?? null,
      };
    }

    const attempts = (attemptsRes.data ?? []) as Row[];
    const recentPuzzleIds = attempts.slice(0, RECENT_WINDOW).map((a) => String(a["puzzle_id"]));

    // Weakness = failure rate per theme over recent attempts (deterministic).
    const agg: Record<string, { n: number; failed: number }> = {};
    for (const a of attempts) {
      for (const theme of coerceThemes(a["themes"] as unknown[] | null)) {
        const bucket = (agg[theme] ??= { n: 0, failed: 0 });
        bucket.n += 1;
        if (!a["solved"]) bucket.failed += 1;
      }
    }
    const weakness: Partial<Record<ThemeKey, number>> = {};
    for (const [theme, v] of Object.entries(agg)) {
      if (v.n < 3) continue;
      weakness[theme as ThemeKey] = Math.round((v.failed / v.n) * 100);
    }

    const candidates: PlatformPuzzle[] = [];

    // --- personal puzzles (from the user's own mistakes) ---
    if (data.mode === "personal" || data.mode === "adaptive" || rules.personalOnly) {
      const personal = await supabase
        .from("puzzles")
        .select("id, fen, solution, solution_san, color, themes, rating, source_game_id, ply")
        .eq("user_id", userId)
        .limit(150);
      for (const raw of (personal.data ?? []) as Row[]) {
        const uci = String(raw["solution"] ?? "");
        if (uci.length < 4) continue;
        candidates.push({
          id: String(raw["id"]),
          source: "personal",
          fen: String(raw["fen"]),
          color: raw["color"] === "b" ? "b" : "w",
          solution: [{ uci, san: (raw["solution_san"] as string | null) ?? uci }],
          alternates: {},
          themes: coerceThemes(raw["themes"] as unknown[] | null),
          rating: Number(raw["rating"] ?? 1200),
          ratingDeviation: 120,
          phase: "middlegame",
          opening: null,
          gameId: (raw["source_game_id"] as string | null) ?? null,
          ply: (raw["ply"] as number | null) ?? null,
          datasetSlug: null,
          license: null,
        });
      }
    }

    // --- global catalog ---
    if (!rules.personalOnly) {
      let query = supabase
        .from("puzzle_catalog")
        .select(
          "id, fen, color, rating, rating_deviation, themes, phase, opening, dataset_id, puzzle_lines(line_index, kind, moves)",
        )
        .gte("rating", target - RATING_BAND)
        .lte("rating", target + RATING_BAND)
        .limit(CANDIDATE_LIMIT);
      if (rules.phase) query = query.eq("phase", rules.phase);
      if (data.mode === "theme" && data.themes.length > 0) {
        query = query.overlaps("themes", data.themes);
      }
      const catalog = await query;
      for (const raw of (catalog.data ?? []) as Row[]) {
        const lines = (raw["puzzle_lines"] ?? []) as Row[];
        const main = lines.find((l) => l["kind"] === "solution") ?? lines[0];
        const solution = plies(main?.["moves"]);
        if (solution.length === 0) continue;
        const alternates: Record<number, string[]> = {};
        for (const line of lines.filter((l) => l["kind"] === "alternate")) {
          const idx = Number(line["ply_from"] ?? 0);
          const alt = plies(line["moves"])[0];
          if (alt) (alternates[idx] ??= []).push(alt.uci);
        }
        candidates.push({
          id: String(raw["id"]),
          source: "global",
          fen: String(raw["fen"]),
          color: raw["color"] === "b" ? "b" : "w",
          solution,
          alternates,
          themes: coerceThemes(raw["themes"] as unknown[] | null),
          rating: Number(raw["rating"] ?? 1500),
          ratingDeviation: Number(raw["rating_deviation"] ?? 120),
          phase: phaseOf(raw["phase"]),
          opening: (raw["opening"] as string | null) ?? null,
          gameId: null,
          ply: null,
          datasetSlug: null,
          license: null,
        });
      }
    }

    const ctx: SelectionContext = {
      rating: target,
      weakness,
      cards,
      recentPuzzleIds,
      sessionThemes: [],
      now: new Date(),
    };
    const picked = selectPuzzles(candidates, ctx, data.limit);

    return {
      rating: { rating: rating.rating, rd: rating.rd, volatility: rating.volatility },
      weakness,
      puzzles: picked.map((p) => ({
        ...p.puzzle,
        reasons: p.reasons,
        score: p.score,
        due: cards[p.puzzle.id]?.due ?? null,
      })),
    };
  });

/* ------------------------------ attempt submit ---------------------------- */

const AttemptInput = z.object({
  puzzleId: z.string().min(1).max(120),
  source: z.enum(["personal", "global"]),
  mode: z.enum(PUZZLE_MODES as unknown as [PuzzleMode, ...PuzzleMode[]]),
  sessionId: z.string().uuid().nullable().default(null),
  solved: z.boolean(),
  hintsUsed: z.number().int().min(0).max(5).default(0),
  wrongMoves: z.number().int().min(0).max(50).default(0),
  seconds: z.number().min(0).max(3600).default(0),
  movesPlayed: z.array(z.string().max(6)).max(40).default([]),
});

export const submitPuzzleAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AttemptInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const now = new Date();

    // Server-side truth for the puzzle's difficulty and themes.
    let puzzleRating = 1200;
    let puzzleRd = 120;
    let themes: ThemeKey[] = [];
    let plyCount = 1;
    if (data.source === "global") {
      const { data: row } = await supabase
        .from("puzzle_catalog")
        .select("rating, rating_deviation, themes, plies")
        .eq("id", data.puzzleId)
        .maybeSingle();
      if (!row) throw new Error("puzzle_not_found");
      const r = row as Row;
      puzzleRating = Number(r["rating"] ?? 1200);
      puzzleRd = Number(r["rating_deviation"] ?? 120);
      themes = coerceThemes(r["themes"] as unknown[] | null);
      plyCount = Number(r["plies"] ?? 1);
    } else {
      const { data: row } = await supabase
        .from("puzzles")
        .select("rating, themes")
        .eq("id", data.puzzleId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!row) throw new Error("puzzle_not_found");
      const r = row as Row;
      puzzleRating = Number(r["rating"] ?? 1200);
      themes = coerceThemes(r["themes"] as unknown[] | null);
    }

    const score = learningScore({
      solved: data.solved,
      hintsUsed: data.hintsUsed,
      wrongMoves: data.wrongMoves,
      seconds: data.seconds,
      plies: plyCount,
    });
    const grade = gradeFromLearningScore(score, data.solved);

    /* -------- rating (only in rated mode) -------- */
    const { data: ratingRow } = await supabase
      .from("puzzle_ratings")
      .select("rating, rating_deviation, volatility, attempts, solved, peak_rating")
      .eq("user_id", userId)
      .eq("scope", "overall")
      .maybeSingle();
    const before = ratingFromRow(ratingRow as Row | null);
    const rated = MODE_RULES[data.mode].rated;
    const result = rated
      ? applyPuzzleResult(before, { rating: puzzleRating, ratingDeviation: puzzleRd }, data.solved)
      : { before, after: before, delta: 0 };

    const priorAttempts = Number((ratingRow as Row | null)?.["attempts"] ?? 0);
    const priorSolved = Number((ratingRow as Row | null)?.["solved"] ?? 0);
    const priorPeak = Number((ratingRow as Row | null)?.["peak_rating"] ?? DEFAULT_PUZZLE_RATING.rating);

    await supabase.from("puzzle_ratings").upsert(
      {
        user_id: userId,
        scope: "overall",
        rating: Math.round(result.after.rating),
        rating_deviation: result.after.rd,
        volatility: result.after.volatility,
        attempts: priorAttempts + 1,
        solved: priorSolved + (data.solved ? 1 : 0),
        peak_rating: Math.max(priorPeak, Math.round(result.after.rating)),
        updated_at: now.toISOString(),
      },
      { onConflict: "user_id,scope" },
    );

    /* -------- FSRS card -------- */
    const { data: cardRow } = await supabase
      .from("srs_cards")
      .select("*")
      .eq("user_id", userId)
      .eq("puzzle_id", data.puzzleId)
      .maybeSingle();
    const prev: SrsState = cardRow
      ? {
          difficulty: Number((cardRow as Row)["difficulty"] ?? 5.6),
          stability: Number((cardRow as Row)["stability"] ?? 0),
          reps: Number((cardRow as Row)["reps"] ?? 0),
          lapses: Number((cardRow as Row)["lapses"] ?? 0),
          due: String((cardRow as Row)["due"]),
          lastReview: ((cardRow as Row)["last_review"] as string | null) ?? null,
        }
      : { difficulty: 5.6, stability: 0, reps: 0, lapses: 0, due: now.toISOString(), lastReview: null };
    const next = reviewCard(prev, grade, now);
    await supabase.from("srs_cards").upsert(
      {
        user_id: userId,
        puzzle_id: data.puzzleId,
        source: data.source,
        difficulty: next.difficulty,
        stability: next.stability,
        reps: next.reps,
        lapses: next.lapses,
        due: next.due,
        last_review: next.lastReview,
      },
      { onConflict: "user_id,puzzle_id" },
    );

    /* -------- attempt log + stats -------- */
    await supabase.from("puzzle_attempts").insert({
      user_id: userId,
      puzzle_id: data.puzzleId,
      grade,
      solved: data.solved,
      time_ms: Math.round(data.seconds * 1000),
      rating_before: Math.round(result.before.rating),
      rating_after: Math.round(result.after.rating),
      source: data.source,
      mode: data.mode,
      session_id: data.sessionId,
      hints_used: data.hintsUsed,
      themes,
      moves_played: data.movesPlayed,
    });

    const { data: statsRow } = await supabase
      .from("puzzle_user_stats")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    const stats = (statsRow ?? {}) as Row;
    const currentStreak = data.solved ? Number(stats["current_streak"] ?? 0) + 1 : 0;
    const themeStats = (stats["theme_stats"] as Record<string, { n: number; solved: number }>) ?? {};
    for (const theme of themes) {
      const bucket = themeStats[theme] ?? { n: 0, solved: 0 };
      themeStats[theme] = { n: bucket.n + 1, solved: bucket.solved + (data.solved ? 1 : 0) };
    }
    await supabase.from("puzzle_user_stats").upsert(
      {
        user_id: userId,
        attempts: Number(stats["attempts"] ?? 0) + 1,
        solved: Number(stats["solved"] ?? 0) + (data.solved ? 1 : 0),
        hints_used: Number(stats["hints_used"] ?? 0) + data.hintsUsed,
        current_streak: currentStreak,
        best_streak: Math.max(Number(stats["best_streak"] ?? 0), currentStreak),
        sprint_best: Number(stats["sprint_best"] ?? 0),
        survival_best: Number(stats["survival_best"] ?? 0),
        theme_stats: themeStats,
        last_solved_at: data.solved ? now.toISOString() : (stats["last_solved_at"] as string | null) ?? null,
        updated_at: now.toISOString(),
      },
      { onConflict: "user_id" },
    );

    // Catalog popularity/difficulty counters need elevated rights (read-only to users).
    if (data.source === "global") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.rpc("puzzle_catalog_record_attempt", {
        _puzzle_id: data.puzzleId,
        _solved: data.solved,
      });
    }

    return {
      grade,
      learningScore: score,
      rating: { rating: Math.round(result.after.rating), rd: result.after.rd, delta: result.delta },
      due: next.due,
      rated,
    };
  });

/* -------------------------------- sessions -------------------------------- */

const StartSessionInput = z.object({
  mode: z.enum(PUZZLE_MODES as unknown as [PuzzleMode, ...PuzzleMode[]]),
  durationSeconds: z.number().int().min(60).max(1800).nullable().default(null),
  lives: z.number().int().min(1).max(9).nullable().default(null),
});

export const startPuzzleSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => StartSessionInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("puzzle_sessions")
      .insert({
        user_id: context.userId,
        mode: data.mode,
        duration_seconds: data.durationSeconds,
        lives: data.lives,
      })
      .select("id, started_at")
      .single();
    if (error) throw new Error(error.message);
    return { sessionId: String((row as Row)["id"]), startedAt: String((row as Row)["started_at"]) };
  });

const FinishSessionInput = z.object({
  sessionId: z.string().uuid(),
  score: z.number().int().min(0).max(100000),
  solved: z.number().int().min(0).max(10000),
  failed: z.number().int().min(0).max(10000),
  hintsUsed: z.number().int().min(0).max(10000).default(0),
});

export const finishPuzzleSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => FinishSessionInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("puzzle_sessions")
      .select("mode")
      .eq("id", data.sessionId)
      .eq("user_id", userId)
      .maybeSingle();
    const mode = String((row as Row | null)?.["mode"] ?? "");
    await supabase
      .from("puzzle_sessions")
      .update({
        status: "finished",
        score: data.score,
        solved: data.solved,
        failed: data.failed,
        hints_used: data.hintsUsed,
        finished_at: new Date().toISOString(),
      })
      .eq("id", data.sessionId)
      .eq("user_id", userId);

    if (mode === "sprint" || mode === "survival") {
      const { data: stats } = await supabase
        .from("puzzle_user_stats")
        .select("sprint_best, survival_best")
        .eq("user_id", userId)
        .maybeSingle();
      const s = (stats ?? {}) as Row;
      const patch =
        mode === "sprint"
          ? { sprint_best: Math.max(Number(s["sprint_best"] ?? 0), data.score) }
          : { survival_best: Math.max(Number(s["survival_best"] ?? 0), data.solved) };
      await supabase
        .from("puzzle_user_stats")
        .upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    }
    return { ok: true };
  });

/* -------------------------------- overview -------------------------------- */

export const getPuzzleOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [ratingRes, statsRes, dueRes, catalogRes, datasetsRes] = await Promise.all([
      supabase
        .from("puzzle_ratings")
        .select("rating, rating_deviation, peak_rating, attempts, solved")
        .eq("user_id", userId)
        .eq("scope", "overall")
        .maybeSingle(),
      supabase.from("puzzle_user_stats").select("*").eq("user_id", userId).maybeSingle(),
      supabase
        .from("srs_cards")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .lte("due", new Date().toISOString()),
      supabase.from("puzzle_catalog").select("id", { count: "exact", head: true }),
      supabase.from("puzzle_datasets").select("slug, name, license, license_url, version, imported_count"),
    ]);
    const rating = ratingFromRow(ratingRes.data as Row | null);
    const stats = (statsRes.data ?? {}) as Row;
    return {
      rating: {
        rating: rating.rating,
        rd: rating.rd,
        peak: Number((ratingRes.data as Row | null)?.["peak_rating"] ?? rating.rating),
      },
      stats: {
        attempts: Number(stats["attempts"] ?? 0),
        solved: Number(stats["solved"] ?? 0),
        currentStreak: Number(stats["current_streak"] ?? 0),
        bestStreak: Number(stats["best_streak"] ?? 0),
        sprintBest: Number(stats["sprint_best"] ?? 0),
        survivalBest: Number(stats["survival_best"] ?? 0),
        themeStats: (stats["theme_stats"] ?? {}) as Record<string, { n: number; solved: number }>,
      },
      dueCount: dueRes.count ?? 0,
      catalogCount: catalogRes.count ?? 0,
      datasets: ((datasetsRes.data ?? []) as Row[]).map((d) => ({
        slug: String(d["slug"] ?? ""),
        name: String(d["name"] ?? ""),
        license: String(d["license"] ?? ""),
        licenseUrl: String(d["license_url"] ?? ""),
        version: String(d["version"] ?? ""),
        importedCount: Number(d["imported_count"] ?? 0),
      })),
    };
  });
