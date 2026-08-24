import type { CoachDigest } from "./digest";
import type { CoachMistake, CoachReport, MistakeSeverity } from "./types";
import { COACH_MODEL, COACH_SCHEMA, COACH_SYSTEM, buildCoachPrompt } from "./prompt";

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

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function strList(value: unknown, max = 8): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => str(v))
    .filter(Boolean)
    .slice(0, max);
}

function toMistakes(value: unknown): CoachMistake[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      const m = raw as Record<string, unknown>;
      const severity = SEVERITIES.includes(m['severity'] as MistakeSeverity)
        ? (m['severity'] as MistakeSeverity)
        : "moderate";
      const title = str(m['title']);
      if (!title) return null;
      return {
        moveNumber: Number.isFinite(Number(m['moveNumber'])) ? Number(m['moveNumber']) : 0,
        san: str(m['san'], "—"),
        severity,
        title,
        whatHappened: str(m['whatHappened']),
        betterPlan: str(m['betterPlan']),
      } satisfies CoachMistake;
    })
    .filter((m): m is CoachMistake => m !== null)
    .slice(0, 12);
}

/** Calls the Lovable AI gateway and normalises the coach report. */
export async function requestCoachReport(digest: CoachDigest): Promise<CoachReport> {
  const apiKey = process.env['LOVABLE_API_KEY'];
  if (!apiKey) throw new Error("AI chưa được cấu hình (thiếu khoá API).");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: COACH_MODEL,
      messages: [
        { role: "system", content: COACH_SYSTEM },
        { role: "user", content: buildCoachPrompt(digest) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "coach_report", strict: true, schema: COACH_SCHEMA },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429) throw new Error("AI đang quá tải, thử lại sau ít phút.");
    if (res.status === 402)
      throw new Error("Hết credit AI của workspace — chủ app cần nạp thêm để dùng tính năng này.");
    if (res.status === 403) throw new Error("Tính năng AI đang bị chặn bởi thiết lập workspace.");
    throw new Error(`AI lỗi ${res.status}: ${body.slice(0, 200)}`);
  }

  const payload = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content ?? "";
  let parsed: RawReport;
  try {
    parsed = JSON.parse(content) as RawReport;
  } catch {
    throw new Error("AI trả về dữ liệu không đọc được, thử lại nhé.");
  }

  return {
    createdAt: new Date().toISOString(),
    side: digest.side,
    headline: str(parsed.headline, "Phân tích ván đấu"),
    verdict: str(parsed.verdict),
    levelImpression: str(parsed.levelImpression),
    phases: {
      opening: str(parsed.phases?.opening),
      middlegame: str(parsed.phases?.middlegame),
      endgame: str(parsed.phases?.endgame),
    },
    strengths: strList(parsed.strengths, 6),
    mistakes: toMistakes(parsed.mistakes),
    habits: strList(parsed.habits, 6),
    advice: strList(parsed.advice, 6),
    drills: strList(parsed.drills, 6),
  };
}
