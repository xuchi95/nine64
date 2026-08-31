import type { CoachDigest, CoachKeyMoment } from "./digest";
import type { CoachMistake, CoachReport, MistakeSeverity } from "./types";
import {
  COACH_MODEL,
  COACH_OUTPUT_LIMITS as L,
  COACH_SCHEMA,
  coachSystem,
  buildCoachPrompt,
} from "./prompt";
import { COACH_MODEL_LIMITS } from "@/lib/ratelimit/policy";

const ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const SEVERITIES: MistakeSeverity[] = ["basic", "moderate", "serious", "critical"];

interface RawReport {
  headline?: unknown;
  verdict?: unknown;
  levelImpression?: unknown;
  phases?: { opening?: unknown; middlegame?: unknown; endgame?: unknown };
  strengths?: unknown;
  mistakes?: unknown;
  habits?: unknown;
  advice?: unknown;
  drills?: unknown;
}

/** Trims to a hard character ceiling without cutting mid-word when avoidable. */
export function cap(value: unknown, max: number, fallback = ""): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return fallback;
  if (raw.length <= max) return raw;
  const sliced = raw.slice(0, max);
  const lastSpace = sliced.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? sliced.slice(0, lastSpace) : sliced).trimEnd() + "…";
}

function capList(value: unknown, maxItems: number, maxChars: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => cap(v, maxChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

/**
 * Maps model output onto canonical key moments.
 *
 * The model may only return a `momentId`; move number and SAN always come from
 * the digest, so a hallucinated or forged reference is dropped instead of being
 * shown to the player as a real move.
 */
export function toMistakes(value: unknown, moments: CoachKeyMoment[]): CoachMistake[] {
  if (!Array.isArray(value)) return [];
  const byId = new Map(moments.map((m) => [m.id, m]));
  const seen = new Set<string>();
  const out: CoachMistake[] = [];

  for (const raw of value) {
    const m = raw as Record<string, unknown>;
    const momentId = typeof m['momentId'] === "string" ? m['momentId'].trim() : "";
    const moment = byId.get(momentId);
    if (!moment || seen.has(momentId)) continue;
    const title = cap(m['title'], L.mistakeTitle);
    if (!title) continue;
    seen.add(momentId);
    out.push({
      momentId: moment.id,
      plyIndex: moment.plyIndex,
      moveNumber: moment.moveNumber,
      san: moment.san,
      severity: SEVERITIES.includes(m['severity'] as MistakeSeverity)
        ? (m['severity'] as MistakeSeverity)
        : "moderate",
      title,
      whatHappened: cap(m['whatHappened'], L.whatHappened),
      betterPlan: cap(m['betterPlan'], L.betterPlan),
    });
    if (out.length >= L.mistakes) break;
  }
  return out;
}

/** Normalises raw model JSON into a safe, capped CoachReport. */
export function normalizeReport(
  parsed: RawReport,
  digest: CoachDigest,
  locale: "vi" | "en",
): CoachReport {
  return {
    createdAt: new Date().toISOString(),
    side: digest.side,
    sourceReviewedAt: digest.reviewedAt ?? null,
    headline: cap(
      parsed.headline,
      L.headline,
      locale === "en" ? "Game analysis" : "Phân tích ván đấu",
    ),
    verdict: cap(parsed.verdict, L.verdict),
    levelImpression: cap(parsed.levelImpression, L.levelImpression),
    phases: {
      opening: cap(parsed.phases?.opening, L.phase),
      middlegame: cap(parsed.phases?.middlegame, L.phase),
      endgame: cap(parsed.phases?.endgame, L.phase),
    },
    strengths: capList(parsed.strengths, L.strengths, L.strength),
    mistakes: toMistakes(parsed.mistakes, digest.keyMoments),
    habits: capList(parsed.habits, L.habits, L.habit),
    advice: capList(parsed.advice, L.advice, L.adviceItem),
    drills: capList(parsed.drills, L.drills, L.drill),
  };
}

/** Calls the Lovable AI gateway and normalises the coach report. */
export async function requestCoachReport(
  digest: CoachDigest,
  locale: "vi" | "en" = "vi",
): Promise<CoachReport> {
  const apiKey = process.env['LOVABLE_API_KEY'];
  if (!apiKey) throw new Error(locale === "en" ? "AI is not configured (missing API key)." : "AI chưa được cấu hình (thiếu khoá API).");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      // Model and output budget are server constants — never client input.
      model: COACH_MODEL,
      max_tokens: COACH_MODEL_LIMITS.maxOutputTokens,
      messages: [
        { role: "system", content: coachSystem(locale) },
        { role: "user", content: buildCoachPrompt(digest, locale) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "coach_report", strict: true, schema: COACH_SCHEMA },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    // Provider internals stay in the server log; the client gets a safe message.
    console.error("[coach] gateway error", { status: res.status });
    if (res.status === 429)
      throw new Error(locale === "en" ? "AI is overloaded, try again in a few minutes." : "AI đang quá tải, thử lại sau ít phút.");
    if (res.status === 402)
      throw new Error(
        locale === "en"
          ? "The workspace is out of AI credits — the app owner needs to top up to use this feature."
          : "Hết credit AI của workspace — chủ app cần nạp thêm để dùng tính năng này.",
      );
    if (res.status === 403)
      throw new Error(locale === "en" ? "AI features are blocked by workspace settings." : "Tính năng AI đang bị chặn bởi thiết lập workspace.");
    void body;
    throw new Error(
      locale === "en"
        ? "The AI service is temporarily unavailable. Please try again later."
        : "Dịch vụ AI tạm thời không khả dụng. Vui lòng thử lại sau.",
    );
  }

  const payload = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content ?? "";
  let parsed: RawReport;
  try {
    parsed = JSON.parse(content) as RawReport;
  } catch {
    throw new Error(locale === "en" ? "AI returned unreadable data, please try again." : "AI trả về dữ liệu không đọc được, thử lại nhé.");
  }

  return normalizeReport(parsed, digest, locale);
}
