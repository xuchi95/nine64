/**
 * My Repertoire — CRUD over repertoires / lines / moves, plus the FSRS cards
 * that Practice consumes. All access is user-scoped through RLS.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Chess } from "chess.js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  isOwnPly,
  pathOf,
  sansOf,
  type MoveKind,
  type Repertoire,
  type RepertoireColor,
  type RepertoireLine,
  type RepertoireMove,
} from "./repertoireTypes";

type Row = Record<string, unknown>;

const Color = z.enum(["white", "black"]);
const Kind = z.enum(["main", "alternative", "avoid"]);

function mapMove(r: Row): RepertoireMove {
  return {
    id: String(r["id"]),
    lineId: String(r["line_id"]),
    repertoireId: String(r["repertoire_id"]),
    path: String(r["path"] ?? ""),
    parentPath: String(r["parent_path"] ?? ""),
    ply: Number(r["ply"] ?? 0),
    san: String(r["san"] ?? ""),
    uci: String(r["uci"] ?? ""),
    fen: String(r["fen"] ?? ""),
    kind: (r["kind"] as MoveKind) ?? "main",
    isOwnMove: r["is_own_move"] !== false,
    notes: String(r["notes"] ?? ""),
  };
}

/** Replays a SAN path, returning per-ply FEN/UCI data. Throws when illegal. */
function replay(sans: string[]) {
  const chess = new Chess();
  const out: { ply: number; san: string; uci: string; fen: string; parentFen: string }[] = [];
  sans.forEach((san, index) => {
    const parentFen = chess.fen();
    const move = chess.move(san);
    if (!move) throw new Error("illegal_line");
    out.push({
      ply: index,
      san: move.san,
      uci: `${move.from}${move.to}${move.promotion ?? ""}`,
      fen: chess.fen(),
      parentFen,
    });
  });
  return out;
}

async function ensureRepertoire(
  supabase: { from: (t: string) => any },
  userId: string,
  color: RepertoireColor,
): Promise<string> {
  const { data } = await supabase
    .from("repertoires")
    .select("id")
    .eq("user_id", userId)
    .eq("color", color)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (data?.id) return String(data.id);
  const { data: created, error } = await supabase
    .from("repertoires")
    .insert({
      user_id: userId,
      color,
      name: color === "white" ? "White repertoire" : "Black repertoire",
      is_default: true,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return String(created.id);
}

/* ------------------------------- listing --------------------------------- */

export const listRepertoires = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ repertoires: Repertoire[]; lines: RepertoireLine[] }> => {
    const { supabase, userId } = context;
    const [{ data: reps }, { data: lines }, { data: moves }] = await Promise.all([
      supabase.from("repertoires").select("*").eq("user_id", userId).order("color"),
      supabase.from("repertoire_lines").select("*").eq("user_id", userId).order("created_at"),
      supabase.from("repertoire_moves").select("*").eq("user_id", userId).order("ply"),
    ]);
    const movesByLine = new Map<string, RepertoireMove[]>();
    for (const raw of (moves ?? []) as Row[]) {
      const move = mapMove(raw);
      const list = movesByLine.get(move.lineId) ?? [];
      list.push(move);
      movesByLine.set(move.lineId, list);
    }
    const mappedLines: RepertoireLine[] = ((lines ?? []) as Row[]).map((r) => ({
      id: String(r["id"]),
      repertoireId: String(r["repertoire_id"]),
      name: String(r["name"] ?? ""),
      eco: (r["eco"] as string | null) ?? null,
      openingName: (r["opening_name"] as string | null) ?? null,
      rootPath: String(r["root_path"] ?? ""),
      notes: String(r["notes"] ?? ""),
      moves: (movesByLine.get(String(r["id"])) ?? []).sort((a, b) => a.ply - b.ply),
      updatedAt: String(r["updated_at"] ?? ""),
    }));
    const repertoires: Repertoire[] = ((reps ?? []) as Row[]).map((r) => {
      const id = String(r["id"]);
      const own = mappedLines.filter((l) => l.repertoireId === id);
      return {
        id,
        color: (r["color"] as RepertoireColor) ?? "white",
        name: String(r["name"] ?? ""),
        description: String(r["description"] ?? ""),
        isDefault: r["is_default"] === true,
        lines: own.length,
        moves: own.reduce((sum, l) => sum + l.moves.length, 0),
        updatedAt: String(r["updated_at"] ?? ""),
      };
    });
    return { repertoires, lines: mappedLines };
  });

/* ------------------------------ save a line ------------------------------- */

const SaveLine = z.object({
  color: Color,
  sans: z.array(z.string().max(10)).min(1).max(40),
  name: z.string().max(120).default(""),
  eco: z.string().max(8).nullable().default(null),
  openingName: z.string().max(160).nullable().default(null),
  notes: z.string().max(2000).default(""),
  kind: Kind.default("main"),
});

/**
 * Upserts a full line into the colour's repertoire and (re)builds the practice
 * cards for the owner's moves. `avoid` moves never become cards.
 */
export const saveRepertoireLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveLine.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const plies = replay(data.sans);
    const rootPath = pathOf(data.sans);
    const repertoireId = await ensureRepertoire(supabase as never, userId, data.color);

    const { data: line, error: lineError } = await supabase
      .from("repertoire_lines")
      .upsert(
        {
          repertoire_id: repertoireId,
          user_id: userId,
          name: data.name || data.openingName || rootPath,
          eco: data.eco,
          opening_name: data.openingName,
          root_path: rootPath,
          notes: data.notes,
        },
        { onConflict: "repertoire_id,root_path" },
      )
      .select("id")
      .single();
    if (lineError) throw new Error(lineError.message);
    const lineId = String((line as Row)["id"]);

    const rows = plies.map((p) => ({
      line_id: lineId,
      repertoire_id: repertoireId,
      user_id: userId,
      path: pathOf(data.sans.slice(0, p.ply + 1)),
      parent_path: pathOf(data.sans.slice(0, p.ply)),
      ply: p.ply,
      san: p.san,
      uci: p.uci,
      fen: p.fen,
      parent_fen: p.parentFen,
      kind: p.ply === plies.length - 1 ? data.kind : "main",
      is_own_move: isOwnPly(p.ply, data.color),
      notes: p.ply === plies.length - 1 ? data.notes : "",
    }));
    const { data: saved, error: moveError } = await supabase
      .from("repertoire_moves")
      .upsert(rows, { onConflict: "repertoire_id,path" })
      .select("id, path, fen, kind, is_own_move, san");
    if (moveError) throw new Error(moveError.message);

    const cards = ((saved ?? []) as Row[])
      .filter((r) => r["is_own_move"] === true && r["kind"] !== "avoid")
      .map((r) => ({
        user_id: userId,
        repertoire_id: repertoireId,
        move_id: String(r["id"]),
        path: String(r["path"]),
        fen: String(r["fen"]),
        expected_san: String(r["san"]),
        color: data.color,
      }));
    if (cards.length) {
      const { error: cardError } = await supabase
        .from("repertoire_cards")
        .upsert(cards, { onConflict: "move_id", ignoreDuplicates: true });
      if (cardError) throw new Error(cardError.message);
    }
    return { lineId, repertoireId, moves: rows.length, cards: cards.length };
  });

/* --------------------------- move-level updates --------------------------- */

export const updateRepertoireMove = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        moveId: z.string().uuid(),
        kind: Kind.optional(),
        notes: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: Row = {};
    if (data.kind) patch["kind"] = data.kind;
    if (data.notes !== undefined) patch["notes"] = data.notes;
    const { data: updated, error } = await supabase
      .from("repertoire_moves")
      .update(patch)
      .eq("id", data.moveId)
      .eq("user_id", userId)
      .select("id, kind, is_own_move")
      .single();
    if (error) throw new Error(error.message);
    // "avoid" moves must never be drilled.
    if ((updated as Row)["kind"] === "avoid") {
      await supabase.from("repertoire_cards").delete().eq("move_id", data.moveId).eq("user_id", userId);
    }
    return { ok: true };
  });

export const deleteRepertoireLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ lineId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("repertoire_lines")
      .delete()
      .eq("id", data.lineId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const renameRepertoire = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        repertoireId: z.string().uuid(),
        name: z.string().min(1).max(120),
        description: z.string().max(500).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("repertoires")
      .update({ name: data.name, description: data.description })
      .eq("id", data.repertoireId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export { sansOf };
