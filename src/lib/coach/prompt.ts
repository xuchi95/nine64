import type { CoachDigest } from "./digest";

export const COACH_MODEL = "google/gemini-3-flash";

export const COACH_SYSTEM = `Bạn là một chuyên gia bình luận và huấn luyện cờ vua (trình độ FIDE Master, kinh nghiệm coaching).
Bạn viết bằng TIẾNG VIỆT, giọng điệu của một nhà phân tích chuyên nghiệp: sắc sảo, thẳng thắn nhưng tôn trọng, dùng đúng thuật ngữ cờ vua (tempo, cấu trúc tốt, cột mở, trung tâm, phối hợp quân, an toàn Vua, nước chờ, đổi quân có lợi...).
Nguyên tắc:
- Chỉ dựa vào dữ liệu ván đấu được cung cấp (nước đi, nhãn engine, mức thiệt hại win%, eval, motif). Không bịa nước đi hay biến không có trong dữ liệu.
- Phân loại lỗi theo mức độ: basic (lỗi cơ bản về nguyên tắc: chậm phát triển, đi quân hai lần, mất tempo), moderate (mất ưu thế nhỏ), serious (mất ưu thế lớn/bỏ lỡ thắng), critical (mất quân, bị mat, sụp đổ hoàn toàn).
- Với mỗi lỗi: nói chuyện gì đã xảy ra và ý tưởng ĐÚNG lẽ ra nên làm (kế hoạch, không cần biến dài).
- Lời khuyên phải cụ thể và làm được ngay, không nói chung chung kiểu "hãy tập nhiều hơn".
- Không dùng emoji. Không markdown trong các trường văn bản.`;

/** Compact, token-bounded description of the game for the model. */
export function buildCoachPrompt(d: CoachDigest): string {
  const lines: string[] = [];
  lines.push(`Người chơi được phân tích: ${d.playerName} (bên ${d.side === "w" ? "Trắng" : "Đen"})`);
  lines.push(`Đối thủ: ${d.opponentName}`);
  lines.push(`Kết quả của người chơi: ${d.outcome}`);
  lines.push(`Thể loại: ${d.variant} | Thời gian: ${d.timeControl} | Số nước: ${d.moveCount}`);
  lines.push(`Khai cuộc: ${d.opening ?? "không xác định"}`);
  if (d.accuracy)
    lines.push(`Độ chính xác: người chơi ${d.accuracy.player}% - đối thủ ${d.accuracy.opponent}%`);
  if (d.acpl) lines.push(`ACPL: người chơi ${d.acpl.player} - đối thủ ${d.acpl.opponent}`);
  if (d.estimatedRating) lines.push(`Trình độ engine ước lượng: ~${d.estimatedRating}`);
  if (d.labelCounts) {
    const counts = Object.entries(d.labelCounts)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${k}:${n}`)
      .join(", ");
    if (counts) lines.push(`Thống kê nhãn nước đi của người chơi: ${counts}`);
  }
  lines.push(`FEN cuối ván: ${d.finalFen}`);

  if (d.keyMoments.length) {
    lines.push("");
    lines.push("Các thời điểm then chốt của người chơi (theo dữ liệu engine):");
    for (const k of d.keyMoments) {
      lines.push(
        `- Nước ${k.moveNumber} ${k.san}: ${k.label}, mất ${k.lossPct}% win, eval sau nước ${k.evalAfter}, giai đoạn ${k.phase}` +
          (k.bestMove ? `, engine đề xuất ${k.bestMove}` : "") +
          (k.motifs.length ? `, motif: ${k.motifs.join("/")}` : ""),
      );
    }
  }

  lines.push("");
  lines.push("Diễn biến ván đấu:");
  lines.push(d.timeline.join(" "));
  lines.push("");
  lines.push(
    "Hãy viết bản phân tích cho người chơi này: nhận định tổng quan, đánh giá từng giai đoạn, điểm mạnh, danh sách lỗi sắp xếp từ cơ bản đến trầm trọng, thói quen xấu lặp lại, lời khuyên hành động và bài tập nên luyện.",
  );
  return lines.join("\n");
}

export const COACH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "headline",
    "verdict",
    "levelImpression",
    "phases",
    "strengths",
    "mistakes",
    "habits",
    "advice",
    "drills",
  ],
  properties: {
    headline: { type: "string", description: "Một câu tóm tắt ván đấu, tối đa 90 ký tự" },
    verdict: { type: "string", description: "3-5 câu nhận định tổng quan của chuyên gia" },
    levelImpression: { type: "string", description: "1-2 câu về trình độ hiện tại và điểm nghẽn" },
    phases: {
      type: "object",
      additionalProperties: false,
      required: ["opening", "middlegame", "endgame"],
      properties: {
        opening: { type: "string" },
        middlegame: { type: "string" },
        endgame: { type: "string" },
      },
    },
    strengths: { type: "array", items: { type: "string" } },
    mistakes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["moveNumber", "san", "severity", "title", "whatHappened", "betterPlan"],
        properties: {
          moveNumber: { type: "integer" },
          san: { type: "string" },
          severity: { type: "string", enum: ["basic", "moderate", "serious", "critical"] },
          title: { type: "string" },
          whatHappened: { type: "string" },
          betterPlan: { type: "string" },
        },
      },
    },
    habits: { type: "array", items: { type: "string" } },
    advice: { type: "array", items: { type: "string" } },
    drills: { type: "array", items: { type: "string" } },
  },
} as const;
