/**
 * AI narrative for the Weekly Progress Report.
 *
 * The model receives ONLY the deterministic report and must not invent
 * numbers. If the gateway is unavailable we degrade to `null` — the numeric
 * report still renders.
 */
import type { WeeklyReport } from "./weekly";

const ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";
const MAX_CHARS = 900;

function system(locale: "vi" | "en"): string {
  return locale === "en"
    ? "You are a chess coach. Summarise the weekly report in 4-6 short sentences. Use ONLY the numbers given; never invent statistics. If the data is marked low-confidence, say the sample is still small. No leaderboards, no comparisons to other players."
    : "Bạn là huấn luyện viên cờ vua. Tóm tắt báo cáo tuần trong 4-6 câu ngắn. CHỈ dùng các con số được cung cấp, tuyệt đối không bịa thêm số liệu. Nếu dữ liệu được đánh dấu ít, hãy nói rõ mẫu còn nhỏ. Không so sánh với người chơi khác.";
}

export async function summariseWeek(report: WeeklyReport, locale: "vi" | "en"): Promise<string | null> {
  const apiKey = process.env['LOVABLE_API_KEY'];
  if (!apiKey) return null;

  const facts = JSON.stringify({
    activity: report.activity,
    improved: report.improved,
    declining: report.declining,
    recurringMistakes: report.recurringMistakes,
    openingLeak: report.openingLeak,
    recommendedFocus: report.recommendedFocus,
    lowData: report.lowData,
  });

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        messages: [
          { role: "system", content: system(locale) },
          { role: "user", content: facts },
        ],
      }),
    });
    if (!res.ok) {
      console.error("[brain] narrative gateway error", { status: res.status });
      return null;
    }
    const payload = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = (payload.choices?.[0]?.message?.content ?? "").trim();
    if (!text) return null;
    return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS).trimEnd()}…` : text;
  } catch (err) {
    console.error("[brain] narrative failed", err);
    return null;
  }
}
