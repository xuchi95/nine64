import type { CoachDigest } from "./digest";

export const COACH_MODEL = "google/gemini-3-flash";

const COACH_SYSTEM_VI = `Bạn là một chuyên gia bình luận và huấn luyện viên cờ vua chuyên nghiệp (trình độ FIDE Master).
Bạn viết bằng TIẾNG VIỆT, giọng điệu của một nhà phân tích chuyên nghiệp: sắc sảo, thẳng thắn nhưng tôn trọng, dùng đúng thuật ngữ cờ vua (tempo, cấu trúc chốt, cột mở, trung tâm, phối hợp quân, an toàn vua, nước chờ, đổi quân có lợi...).
Nguyên tắc:
- Chỉ dựa vào dữ liệu ván đấu được cung cấp (nước đi, nhãn engine, mức thiệt hại win%, eval, motif). Tuyệt đối không bịa nước đi hay các biến thể không có trong dữ liệu.
- Phân loại sai lầm theo mức độ: nước kém chính xác (lỗi cơ bản: chậm phát triển, đi quân hai lần, mất tempo), sai sót (mất ưu thế nhỏ), sai lầm (mất ưu thế lớn hoặc bỏ lỡ thắng), sai lầm nghiêm trọng (mất quân, bị chiếu hết, sụp đổ hoàn toàn).
- Với mỗi lỗi: nói chuyện gì đã xảy ra và ý tưởng ĐÚNG lẽ ra nên làm (kế hoạch, không cần biến dài).
- Lời khuyên phải cụ thể và làm được ngay, không nói chung chung kiểu "hãy tập nhiều hơn".
- Viết tiếng Việt CÓ DẤU đầy đủ, đúng chính tả; tuyệt đối không viết tiếng Việt không dấu.
- Không dùng emoji. Không markdown trong các trường văn bản.`;

const COACH_SYSTEM_EN = `You are an expert chess commentator and coach (FIDE Master strength, real coaching experience).
You write in ENGLISH, in the voice of a professional analyst: sharp, direct but respectful, using precise chess terminology (tempo, pawn structure, open file, the centre, piece coordination, king safety, waiting move, favourable trade...).
Principles:
- Rely only on the supplied game data (moves, engine labels, win% loss, eval, motifs). Never invent moves or lines that are not in the data.
- Classify mistakes by severity: basic (fundamental principle errors: slow development, moving a piece twice, losing tempo), moderate (small loss of advantage), serious (large loss of advantage/missed win), critical (losing material, getting mated, total collapse).
- For each mistake: explain what happened and the correct idea that should have been played (a plan, no need for long lines).
- Advice must be specific and actionable now, never generic like "practise more".
- Write natural, correct English.
- No emoji. No markdown inside text fields.`;

export function coachSystem(locale: "vi" | "en" = "vi"): string {
  return locale === "en" ? COACH_SYSTEM_EN : COACH_SYSTEM_VI;
}

/** Compact, token-bounded description of the game for the model. */
export function buildCoachPrompt(d: CoachDigest, locale: "vi" | "en" = "vi"): string {
  if (locale === "en") return buildCoachPromptEn(d);
  const lines: string[] = [];
  lines.push(`Kỳ thủ được phân tích: ${d.playerName} (bên ${d.side === "w" ? "Trắng" : "Đen"})`);
  lines.push(`Đối thủ: ${d.opponentName}`);
  lines.push(`Kết quả của người chơi: ${d.outcome}`);
  lines.push(`Thể loại: ${d.variant} | Thời gian: ${d.timeControl} | Số nước: ${d.moveCount}`);
  lines.push(`Khai cuộc: ${d.opening ?? "không xác định"}`);
  if (d.accuracy)
    lines.push(`Độ chính xác: người chơi ${d.accuracy.player}% - đối thủ ${d.accuracy.opponent}%`);
  if (d.acpl) lines.push(`ACPL: người chơi ${d.acpl.player} - đối thủ ${d.acpl.opponent}`);
  if (d.estimatedRating) lines.push(`Sức cờ ước tính (theo máy phân tích): ~${d.estimatedRating}`);
  if (d.labelCounts) {
    const counts = Object.entries(d.labelCounts)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${k}:${n}`)
      .join(", ");
    if (counts) lines.push(`Phân loại nước đi của kỳ thủ: ${counts}`);
  }
  lines.push(`FEN cuối ván: ${d.finalFen}`);

  if (d.keyMoments.length) {
    lines.push("");
    lines.push("Các tình huống then chốt (theo máy phân tích):");
    for (const k of d.keyMoments) {
      lines.push(
        `- Nước ${k.moveNumber} ${k.san}: ${k.label}, mất ${k.lossPct}% win, eval sau nước ${k.evalAfter}, giai đoạn ${k.phase}` +
          (k.bestMove ? `, máy gợi ý ${k.bestMove}` : "") +
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

function buildCoachPromptEn(d: CoachDigest): string {
  const lines: string[] = [];
  lines.push(`Player being analysed: ${d.playerName} (${d.side === "w" ? "White" : "Black"})`);
  lines.push(`Opponent: ${d.opponentName}`);
  lines.push(`Player's result: ${d.outcome}`);
  lines.push(`Variant: ${d.variant} | Time control: ${d.timeControl} | Moves: ${d.moveCount}`);
  lines.push(`Opening: ${d.opening ?? "unknown"}`);
  if (d.accuracy)
    lines.push(`Accuracy: player ${d.accuracy.player}% - opponent ${d.accuracy.opponent}%`);
  if (d.acpl) lines.push(`ACPL: player ${d.acpl.player} - opponent ${d.acpl.opponent}`);
  if (d.estimatedRating) lines.push(`Estimated engine strength: ~${d.estimatedRating}`);
  if (d.labelCounts) {
    const counts = Object.entries(d.labelCounts)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${k}:${n}`)
      .join(", ");
    if (counts) lines.push(`Player's move-label stats: ${counts}`);
  }
  lines.push(`Final FEN: ${d.finalFen}`);

  if (d.keyMoments.length) {
    lines.push("");
    lines.push("Player's key moments (from engine data):");
    for (const k of d.keyMoments) {
      lines.push(
        `- Move ${k.moveNumber} ${k.san}: ${k.label}, lost ${k.lossPct}% win, eval after ${k.evalAfter}, phase ${k.phase}` +
          (k.bestMove ? `, engine suggests ${k.bestMove}` : "") +
          (k.motifs.length ? `, motifs: ${k.motifs.join("/")}` : ""),
      );
    }
  }

  lines.push("");
  lines.push("Game narrative:");
  lines.push(d.timeline.join(" "));
  lines.push("");
  lines.push(
    "Write the analysis for this player: overall verdict, phase-by-phase assessment, strengths, a list of mistakes ranked from minor to critical, recurring bad habits, actionable advice, and drills to practise.",
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
