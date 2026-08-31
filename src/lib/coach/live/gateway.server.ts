/**
 * Optional AI rephrasing for a Live Play Coach moment.
 *
 * The model receives an ALREADY DECIDED explanation and may only restyle it.
 * It cannot introduce a move: every SAN-looking token that is not the played
 * move or the engine's best move is stripped before the text reaches the user.
 * If anything fails, the caller falls back to the deterministic text.
 */
import { COACH_LIVE_MODEL_LIMITS } from "@/lib/ratelimit/policy";

const ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.7-flash";

export interface LiveCoachStyleRequest {
  locale: "vi" | "en";
  personality: "friendly_teacher" | "concise_master" | "socratic_coach";
  mode: "quiet" | "normal" | "teaching";
  kind: string;
  playedSan: string;
  bestSan: string | null;
  lossCp: number;
  /** Deterministic text the model must preserve the meaning of. */
  baseMessage: string;
  baseQuestion: string | null;
  /** Squares the deterministic text already refers to (hanging square, engine move). */
  allowedSquares: string[];
}

export interface LiveCoachStyleResult {
  message: string;
  question: string | null;
}

const SAN_TOKEN = /\b(O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)\b/g;

/** Removes any move the engine did not sanction. */
export function stripUnsanctionedMoves(text: string, allowed: string[]): string {
  const ok = new Set(allowed.filter(Boolean).map((m) => m.replace(/[+#]$/, "")));
  return text
    .replace(SAN_TOKEN, (token) => (ok.has(token.replace(/[+#]$/, "")) ? token : "…"))
    .replace(/\s+…/g, " …")
    .trim();
}

function cap(value: unknown, max: number): string {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw.length <= max ? raw : `${raw.slice(0, max).trimEnd()}…`;
}

const STYLE: Record<string, string> = {
  friendly_teacher: "warm, encouraging, plain language, at most two sentences",
  concise_master: "direct and terse, exactly one sentence, no filler",
  socratic_coach: "asks the learner to reason, never states the answer bluntly",
};

export async function styleCoachMoment(
  req: LiveCoachStyleRequest,
): Promise<LiveCoachStyleResult | null> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return null;

  const system = [
    "You restyle a chess coaching note for a learner.",
    "You are a fictional coaching persona — never claim to be, or imitate, a real titled player.",
    "You must NOT invent, suggest, or name any chess move. Only the moves given to you may appear.",
    "You must not change any evaluation, number, or chess fact.",
    `Answer in ${req.locale === "vi" ? "Vietnamese" : "English"}.`,
    `Tone: ${STYLE[req.personality] ?? "neutral"}.`,
    'Return JSON: {"message": string, "question": string|null}.',
  ].join(" ");

  const user = JSON.stringify({
    situation: req.kind,
    playedMove: req.playedSan,
    engineBestMove: req.bestSan,
    centipawnLoss: req.lossCp,
    messageToRestyle: req.baseMessage,
    questionToRestyle: req.baseQuestion,
  });

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: COACH_LIVE_MODEL_LIMITS.maxOutputTokens,
        reasoning_effort: "low",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "coach_moment",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["message", "question"],
              properties: {
                message: { type: "string" },
                question: { type: ["string", "null"] },
              },
            },
          },
        },
      }),
    });
  } catch {
    return null;
  }

  if (!res.ok) {
    // Gateway problems are never fatal here: deterministic coaching still works.
    console.error("[coach.live] gateway error", { status: res.status });
    return null;
  }

  let parsed: { message?: unknown; question?: unknown };
  try {
    const payload = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    parsed = JSON.parse(payload.choices?.[0]?.message?.content ?? "") as typeof parsed;
  } catch {
    return null;
  }

  const allowed = [req.playedSan, req.bestSan ?? "", ...req.allowedSquares];
  const message = stripUnsanctionedMoves(cap(parsed.message, 320), allowed);
  if (!message) return null;
  const questionRaw = cap(parsed.question, 200);
  return {
    message,
    question: questionRaw ? stripUnsanctionedMoves(questionRaw, allowed) : null,
  };
}
