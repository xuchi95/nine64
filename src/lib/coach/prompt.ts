import type { CoachDigest } from "./digest";

export const COACH_MODEL = "google/gemini-3-flash";

/** Hard output ceilings, mirrored in the JSON schema and re-applied server-side. */
export const COACH_OUTPUT_LIMITS = {
  headline: 90,
  verdict: 450,
  levelImpression: 200,
  phase: 240,
  strength: 160,
  strengths: 3,
  mistakes: 4,
  mistakeTitle: 90,
  whatHappened: 260,
  betterPlan: 220,
  habits: 3,
  habit: 160,
  advice: 3,
  adviceItem: 180,
  drills: 3,
  drill: 80,
} as const;

const COACH_SYSTEM_VI = `Bạn là huấn luyện viên cờ vua đang nói chuyện trực tiếp với một người chơi khoảng 800–1600 Elo.
Cách viết:
- Câu ngắn, tự nhiên, thân thiện, dễ hiểu. Nói "quân của bạn", "khu vực quanh Vua", "trung tâm bàn cờ", "quân đang không được bảo vệ".
- Nếu buộc phải dùng thuật ngữ (tempo, ghim quân, cột mở...), giải thích ngay bằng một cụm từ đơn giản trong ngoặc.
- Không đưa chuỗi biến thể dài. Không liệt kê tọa độ hay ký hiệu nước cờ liên tiếp.
- Không nhắc FEN, UCI, centipawn, độ sâu, win percentage hay bất kỳ số liệu máy nào trong phần giải thích.
- Không lặp lại diễn biến ván đấu theo kiểu danh sách nước đi.
Nội dung:
- Chỉ dựa vào dữ liệu được cung cấp. Không bịa nước đi, không bịa biến.
- Phân tích tối đa 4 sai lầm quan trọng nhất, mỗi sai lầm gồm: một tiêu đề ngắn, 1–2 câu "điều đã xảy ra", một câu "lần sau nên làm".
- Mỗi sai lầm phải tham chiếu bằng momentId có sẵn trong danh sách. Tuyệt đối không tự viết số nước hay ký hiệu nước cờ.
- Tôn trọng người chơi, không dùng từ ngữ xúc phạm hay chê bai.
- Khi nói về trình độ, chỉ nói đây là ước lượng từ một ván duy nhất, không kết luận chắc chắn.
- Viết tiếng Việt CÓ DẤU đầy đủ, đúng chính tả. Không emoji, không markdown.`;

const COACH_SYSTEM_EN = `You are a chess coach talking directly to a player rated roughly 800–1600.
How to write:
- Short, natural, friendly sentences. Say "your pieces", "the area around your king", "the centre of the board", "a piece with nothing defending it".
- If you must use a term (tempo, pin, open file...), explain it immediately in simple words in brackets.
- No long variations. No strings of coordinates or move symbols.
- Never mention FEN, UCI, centipawns, depth, win percentage or any engine number in your explanations.
- Never replay the game as a move list.
Content:
- Use only the supplied data. Never invent moves or lines.
- Cover at most 4 important mistakes; each has a short title, 1–2 sentences of "what happened", and one sentence of "what to do next time".
- Reference each mistake by a momentId from the supplied list. Never write your own move number or move symbol.
- Be respectful; never insult the player.
- Any rating impression is an estimate from a single game — say so, don't state it as fact.
- Natural, correct English. No emoji, no markdown.`;

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
  if (d.estimatedRating) lines.push(`Sức cờ ước tính (chỉ từ một ván): ~${d.estimatedRating}`);

  if (d.keyMoments.length) {
    lines.push("");
    lines.push("Danh sách tình huống then chốt (chỉ được tham chiếu bằng momentId):");
    for (const k of d.keyMoments) {
      lines.push(
        `- momentId=${k.id}: ${k.label}, mất ${k.lossPct}% cơ hội thắng, giai đoạn ${k.phase}` +
          (k.motifs.length ? `, motif: ${k.motifs.join("/")}` : ""),
      );
    }
  }

  lines.push("");
  lines.push(
    "Dữ liệu nội bộ (chỉ để bạn hiểu ván đấu, TUYỆT ĐỐI không chép lại hay liệt kê trong câu trả lời):",
  );
  lines.push(d.timeline.join(" "));
  lines.push("");
  lines.push(
    "Hãy viết bằng lời dễ hiểu: nhận định tổng quan ngắn gọn, một câu cho mỗi giai đoạn, tối đa 3 điểm mạnh, tối đa 4 sai lầm (mỗi sai lầm kèm momentId), tối đa 3 thói quen cần sửa, tối đa 3 lời khuyên và tối đa 3 bài tập. Không lặp lại cùng một ý ở nhiều phần.",
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
  if (d.estimatedRating) lines.push(`Rating impression from this single game: ~${d.estimatedRating}`);

  if (d.keyMoments.length) {
    lines.push("");
    lines.push("Key moments (reference them only by momentId):");
    for (const k of d.keyMoments) {
      lines.push(
        `- momentId=${k.id}: ${k.label}, lost ${k.lossPct}% of winning chances, phase ${k.phase}` +
          (k.motifs.length ? `, motifs: ${k.motifs.join("/")}` : ""),
      );
    }
  }

  lines.push("");
  lines.push(
    "Internal data (for your understanding only — never copy or list it in your answer):",
  );
  lines.push(d.timeline.join(" "));
  lines.push("");
  lines.push(
    "Write in plain language: a short overall verdict, one sentence per phase, up to 3 strengths, up to 4 mistakes (each with its momentId), up to 3 habits, up to 3 pieces of advice and up to 3 drills. Do not repeat the same point in several sections.",
  );
  return lines.join("\n");
}

const L = COACH_OUTPUT_LIMITS;

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
    headline: { type: "string", maxLength: L.headline },
    verdict: { type: "string", maxLength: L.verdict },
    levelImpression: { type: "string", maxLength: L.levelImpression },
    phases: {
      type: "object",
      additionalProperties: false,
      required: ["opening", "middlegame", "endgame"],
      properties: {
        opening: { type: "string", maxLength: L.phase },
        middlegame: { type: "string", maxLength: L.phase },
        endgame: { type: "string", maxLength: L.phase },
      },
    },
    strengths: {
      type: "array",
      maxItems: L.strengths,
      items: { type: "string", maxLength: L.strength },
    },
    mistakes: {
      type: "array",
      maxItems: L.mistakes,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["momentId", "severity", "title", "whatHappened", "betterPlan"],
        properties: {
          momentId: { type: "string", maxLength: 24 },
          severity: { type: "string", enum: ["basic", "moderate", "serious", "critical"] },
          title: { type: "string", maxLength: L.mistakeTitle },
          whatHappened: { type: "string", maxLength: L.whatHappened },
          betterPlan: { type: "string", maxLength: L.betterPlan },
        },
      },
    },
    habits: { type: "array", maxItems: L.habits, items: { type: "string", maxLength: L.habit } },
    advice: { type: "array", maxItems: L.advice, items: { type: "string", maxLength: L.adviceItem } },
    drills: { type: "array", maxItems: L.drills, items: { type: "string", maxLength: L.drill } },
  },
} as const;
