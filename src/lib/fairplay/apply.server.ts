import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { evaluateGame } from "./evaluate";
import { sprt } from "./sprt";
import { detectCollusion, type GameRecord } from "./collusion";
import { THRESHOLDS } from "./thresholds";
import { isLockActive, lockHoursFor } from "./lockPolicy";
import type { FairplayEvaluation } from "./evaluate";
import type { MoveObservation, TurnTelemetry } from "./types";

type Admin = SupabaseClient<Database>;

export interface EvaluateArgs {
  gameId: string;
  subjectId: string;
  observations: MoveObservation[];
  rating: number;
  /** Wall-clock ms the engine spent producing the verdict (observability). */
  evalMs?: number;
}

/** Read the subject's own behavioural telemetry — never taken from the reporter. */
export async function loadTurns(admin: Admin, gameId: string, subjectId: string): Promise<TurnTelemetry[]> {
  const { data } = await admin
    .from("fairplay_signals")
    .select("turns")
    .eq("game_id", gameId)
    .eq("user_id", subjectId)
    .maybeSingle();
  const raw = (data?.turns ?? []) as unknown;
  return Array.isArray(raw) ? (raw as TurnTelemetry[]) : [];
}

/**
 * Persist a per-game report. Reports may arrive from either player, so we keep
 * the strongest verdict: a cheater re-submitting a flattering analysis of their
 * own game cannot lower a report their opponent's client already produced.
 */
export async function upsertReport(
  admin: Admin,
  args: EvaluateArgs,
  verdict: FairplayEvaluation,
): Promise<{ stored: boolean; score: number }> {
  const { data: existing } = await admin
    .from("fairplay_reports")
    .select("id, score")
    .eq("game_id", args.gameId)
    .eq("user_id", args.subjectId)
    .maybeSingle();

  if (existing && existing.score >= verdict.score) {
    return { stored: false, score: existing.score };
  }

  const row = {
    game_id: args.gameId,
    user_id: args.subjectId,
    score: verdict.score,
    probability: verdict.probability,
    confidence: verdict.confidence,
    action: verdict.action,
    features: JSON.parse(JSON.stringify(verdict.features)) as Database["public"]["Tables"]["fairplay_reports"]["Row"]["features"],
    contributions: JSON.parse(JSON.stringify(verdict.contributions)) as Database["public"]["Tables"]["fairplay_reports"]["Row"]["contributions"],
    reasons: JSON.parse(JSON.stringify(verdict.reasons)) as Database["public"]["Tables"]["fairplay_reports"]["Row"]["reasons"],
    model: verdict.model,
    eval_ms: Math.max(0, Math.round(args.evalMs ?? 0)),
    rating: Math.round(args.rating),
  };

  if (existing) {
    await admin.from("fairplay_reports").update(row).eq("id", existing.id);
  } else {
    await admin.from("fairplay_reports").insert(row);
  }
  return { stored: true, score: verdict.score };
}

/** Aggregate the player's recent reports + result patterns into a status row. */
export async function refreshStatus(admin: Admin, userId: string) {
  const { data: reports } = await admin
    .from("fairplay_reports")
    .select("game_id, score, probability, reasons, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  const list = reports ?? [];
  const probabilities = list.map((r) => Number(r.probability));
  const sequential = sprt(probabilities);
  const peak = list.reduce((a, r) => Math.max(a, r.score), 0);

  const { data: games } = await admin
    .from("games")
    .select(
      "id, white_id, black_id, white_rating, black_rating, result, created_at, updated_at, status",
    )
    .or(`white_id.eq.${userId},black_id.eq.${userId}`)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(30);

  const featureByGame = new Map(list.map((r) => [r.game_id, r]));
  const records: GameRecord[] = (games ?? []).map((g) => {
    const isWhite = g.white_id === userId;
    const score = g.result === "1/2-1/2" ? 0.5 : g.result === (isWhite ? "1-0" : "0-1") ? 1 : 0;
    const report = featureByGame.get(g.id);
    const features = (report as { features?: { cplMean?: number; moves?: number } } | undefined)
      ?.features;
    return {
      gameId: g.id,
      opponentId: isWhite ? g.black_id : g.white_id,
      score,
      moves: features?.moves ?? 30,
      cplMean: features?.cplMean ?? 6,
      ratingBefore: isWhite ? g.white_rating : g.black_rating,
      opponentRating: isWhite ? g.black_rating : g.white_rating,
      durationMs: Math.max(0, new Date(g.updated_at).getTime() - new Date(g.created_at).getTime()),
      playedAt: g.created_at,
    };
  });
  const collusion = detectCollusion(records);

  const shouldLock =
    sequential.decision === "assisted" ||
    peak >= THRESHOLDS.hold ||
    collusion.boostingScore >= 80 ||
    collusion.sandbaggingScore >= 80;

  // Existing lock window + escalation history.
  const [{ data: current }, { count: priorLocks }] = await Promise.all([
    admin
      .from("fairplay_status")
      .select("rating_locked, lock_started_at, lock_expires_at, lock_hours")
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("fairplay_actions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("action", "rating_hold")
      .eq("automatic", true),
  ]);

  const nowMs = Date.now();
  const activeLock = current ? isLockActive(current, nowMs) : false;
  let lockStartedAt = activeLock ? current?.lock_started_at ?? null : null;
  let lockExpiresAt = activeLock ? current?.lock_expires_at ?? null : null;
  let lockHours = activeLock ? current?.lock_hours ?? 0 : 0;
  let locked = activeLock;

  if (shouldLock) {
    const hours = lockHoursFor({
      score: peak,
      sprtDecision: sequential.decision,
      boostingScore: collusion.boostingScore,
      sandbaggingScore: collusion.sandbaggingScore,
      priorLocks: priorLocks ?? 0,
    });
    if (hours > 0) {
      const candidateExpiry = nowMs + hours * 3_600_000;
      // Never shorten an active lock — only extend it.
      if (!lockExpiresAt || new Date(lockExpiresAt).getTime() < candidateExpiry) {
        lockExpiresAt = new Date(candidateExpiry).toISOString();
        lockHours = hours;
        lockStartedAt = lockStartedAt ?? new Date(nowMs).toISOString();
      }
      locked = true;
    }
  }

  const action = locked
    ? "rating_hold"
    : peak >= THRESHOLDS.unrated
      ? "unrated"
      : peak >= THRESHOLDS.monitor
        ? "monitor"
        : "none";

  const reasons = [
    ...new Set([
      ...(list[0]?.reasons && Array.isArray(list[0].reasons) ? (list[0].reasons as string[]) : []),
      ...collusion.flags,
      ...(sequential.decision === "assisted" ? ["Chuỗi ván liên tiếp có dấu hiệu dùng engine"] : []),
    ]),
  ];

  await admin.from("fairplay_status").upsert(
    {
      user_id: userId,
      score: peak,
      action,
      sprt_llr: sequential.llr,
      sprt_decision: sequential.decision,
      boosting_score: collusion.boostingScore,
      sandbagging_score: collusion.sandbaggingScore,
      rating_locked: locked,
      lock_started_at: locked ? lockStartedAt : null,
      lock_expires_at: locked ? lockExpiresAt : null,
      lock_hours: locked ? lockHours : 0,
      games_reviewed: list.length,
      reasons: JSON.parse(JSON.stringify(reasons)) as Database["public"]["Tables"]["fairplay_status"]["Row"]["reasons"],
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  return {
    action,
    locked,
    peak,
    sequential,
    collusion,
    reasons,
    lockExpiresAt: locked ? lockExpiresAt : null,
    lockHours: locked ? lockHours : 0,
  };
}


/** Enforce the automatic consequences of a verdict. */
export async function enforce(
  admin: Admin,
  args: { userId: string; gameId: string; action: string; score: number; automatic?: boolean },
) {
  if (args.action === "unrated" || args.action === "rating_hold") {
    await admin.from("games").update({ rated: false }).eq("id", args.gameId);
  }
  if (args.action === "none") return;

  await admin.from("fairplay_actions").insert({
    user_id: args.userId,
    game_id: args.gameId,
    action: args.action,
    score: args.score,
    automatic: args.automatic ?? true,
  });
}

export { evaluateGame };
