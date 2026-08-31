/**
 * Admin surface for the puzzle catalog: import, flag, disable, theme editor,
 * difficulty recalculation and dataset versioning. Every call re-checks the
 * caller's admin role server-side before touching privileged clients.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { THEME_KEYS, coerceThemes, type ThemeKey } from "./puzzles/themes";
import { recalculatePuzzleRating } from "./puzzles/rating";

type Row = Record<string, unknown>;

type RoleRpc = {
  rpc: (fn: "has_role", args: { _user_id: string; _role: "admin" }) => PromiseLike<{ data: unknown }>;
};

async function assertPuzzleAdmin(context: { supabase: RoleRpc; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (data !== true) throw new Error("Forbidden");
}

const ThemeEnum = z.enum(THEME_KEYS as unknown as [ThemeKey, ...ThemeKey[]]);

/* --------------------------------- listing -------------------------------- */

const ListInput = z.object({
  search: z.string().max(120).default(""),
  theme: ThemeEnum.nullable().default(null),
  onlyFlagged: z.boolean().default(false),
  includeDisabled: z.boolean().default(true),
  limit: z.number().int().min(1).max(200).default(50),
});

export const adminListPuzzles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertPuzzleAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("puzzle_catalog")
      .select("id, fen, rating, rating_deviation, themes, phase, enabled, flagged, flag_reason, attempts, solved, dataset_id")
      .order("updated_at", { ascending: false })
      .limit(data.limit);
    if (data.search) query = query.ilike("id", `%${data.search}%`);
    if (data.theme) query = query.contains("themes", [data.theme]);
    if (data.onlyFlagged) query = query.eq("flagged", true);
    if (!data.includeDisabled) query = query.eq("enabled", true);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const [{ count: total }, { count: flagged }, datasets, themes] = await Promise.all([
      supabaseAdmin.from("puzzle_catalog").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("puzzle_catalog").select("id", { count: "exact", head: true }).eq("flagged", true),
      supabaseAdmin.from("puzzle_datasets").select("*").order("created_at"),
      supabaseAdmin.from("puzzle_themes").select("*").order("sort_order"),
    ]);
    return {
      puzzles: ((rows ?? []) as Row[]).map((r) => ({
        id: String(r["id"]),
        fen: String(r["fen"] ?? ""),
        rating: Number(r["rating"] ?? 0),
        ratingDeviation: Number(r["rating_deviation"] ?? 0),
        themes: coerceThemes(r["themes"] as unknown[] | null),
        phase: String(r["phase"] ?? "middlegame"),
        enabled: r["enabled"] !== false,
        flagged: r["flagged"] === true,
        flagReason: r["flag_reason"] == null ? null : String(r["flag_reason"]),
        attempts: Number(r["attempts"] ?? 0),
        solved: Number(r["solved"] ?? 0),
      })),
      total: total ?? 0,
      flaggedCount: flagged ?? 0,
      datasets: ((datasets.data ?? []) as Row[]).map((d) => ({
        slug: String(d["slug"] ?? ""),
        name: String(d["name"] ?? ""),
        license: String(d["license"] ?? ""),
        version: String(d["version"] ?? ""),
        importedCount: Number(d["imported_count"] ?? 0),
      })),
      themes: ((themes.data ?? []) as Row[]).map((th) => ({
        key: String(th["key"] ?? ""),
        nameVi: String(th["name_vi"] ?? ""),
        nameEn: String(th["name_en"] ?? ""),
        category: String(th["category"] ?? ""),
        enabled: th["enabled"] !== false,
        sortOrder: Number(th["sort_order"] ?? 0),
      })),
    };
  });

/* --------------------------- flag / disable puzzle ------------------------- */

const ModerateInput = z.object({
  puzzleId: z.string().min(1).max(120),
  enabled: z.boolean().optional(),
  flagged: z.boolean().optional(),
  reason: z.string().max(300).default(""),
  themes: z.array(ThemeEnum).max(10).optional(),
});

export const adminModeratePuzzle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ModerateInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertPuzzleAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Row = { updated_at: new Date().toISOString() };
    if (data.enabled !== undefined) patch["enabled"] = data.enabled;
    if (data.flagged !== undefined) {
      patch["flagged"] = data.flagged;
      patch["flag_reason"] = data.flagged ? data.reason : null;
    }
    if (data.themes) patch["themes"] = data.themes;
    const { error } = await supabaseAdmin.from("puzzle_catalog").update(patch as never).eq("id", data.puzzleId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("admin_audit_log").insert({
      actor_id: context.userId,
      action: "puzzle.moderate",
      note: data.reason || "puzzle catalog update",
      detail: { ...data },
    });
    return { ok: true };
  });

/* ------------------------------- theme editor ------------------------------ */

const ThemeInput = z.object({
  key: ThemeEnum,
  nameVi: z.string().min(1).max(80),
  nameEn: z.string().min(1).max(80),
  descriptionVi: z.string().max(400).default(""),
  descriptionEn: z.string().max(400).default(""),
  category: z.string().min(1).max(40).default("tactics"),
  enabled: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});

export const adminSaveTheme = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ThemeInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertPuzzleAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("puzzle_themes").upsert(
      {
        key: data.key,
        name_vi: data.nameVi,
        name_en: data.nameEn,
        description_vi: data.descriptionVi,
        description_en: data.descriptionEn,
        category: data.category,
        enabled: data.enabled,
        sort_order: data.sortOrder,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------- difficulty recalculation ----------------------- */

const RecalcInput = z.object({
  minAttempts: z.number().int().min(5).max(1000).default(10),
  limit: z.number().int().min(1).max(2000).default(500),
});

export const adminRecalculateDifficulty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RecalcInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertPuzzleAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("puzzle_catalog")
      .select("id, rating, rating_deviation, attempts, solved")
      .gte("attempts", data.minAttempts)
      .limit(data.limit);
    if (error) throw new Error(error.message);

    const { data: avgRow } = await supabaseAdmin
      .from("puzzle_ratings")
      .select("rating")
      .eq("scope", "overall")
      .limit(1000);
    const ratings = ((avgRow ?? []) as Row[]).map((r) => Number(r["rating"] ?? 1200));
    const averageSolverRating =
      ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 1200;

    let updated = 0;
    for (const raw of (rows ?? []) as Row[]) {
      const next = recalculatePuzzleRating({
        rating: Number(raw["rating"] ?? 1500),
        ratingDeviation: Number(raw["rating_deviation"] ?? 120),
        attempts: Number(raw["attempts"] ?? 0),
        solved: Number(raw["solved"] ?? 0),
        averageSolverRating,
      });
      if (next.rating === Number(raw["rating"])) continue;
      await supabaseAdmin
        .from("puzzle_catalog")
        .update({ rating: next.rating, rating_deviation: next.ratingDeviation })
        .eq("id", String(raw["id"]));
      updated += 1;
    }
    await supabaseAdmin.from("admin_audit_log").insert({
      actor_id: context.userId,
      action: "puzzle.recalculate_difficulty",
      note: `recalculated ${updated} puzzles`,
      detail: { updated, averageSolverRating },
    });
    return { updated, averageSolverRating: Math.round(averageSolverRating) };
  });

/* ------------------------------ dataset version ---------------------------- */

const DatasetInput = z.object({
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/),
  name: z.string().min(2).max(120),
  license: z.string().min(2).max(120),
  licenseUrl: z.string().max(300).default(""),
  sourceUrl: z.string().max(300).default(""),
  attribution: z.string().max(300).default(""),
  version: z.string().min(1).max(40).default("v1"),
  notes: z.string().max(600).default(""),
});

export const adminSaveDataset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DatasetInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertPuzzleAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("puzzle_datasets")
      .upsert(
        {
          slug: data.slug,
          name: data.name,
          license: data.license,
          license_url: data.licenseUrl,
          source_url: data.sourceUrl,
          attribution: data.attribution,
          version: data.version,
          notes: data.notes,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "slug" },
      )
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: String((row as Row)["id"]) };
  });
