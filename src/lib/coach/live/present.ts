/**
 * Presentation layer for the Live Play Coach.
 *
 * Personalities change TONE ONLY. Chess content (best move, evaluation, which
 * piece hangs) is passed in from the rules engine + Stockfish, and every
 * personality renders exactly the same facts. No real grandmaster is imitated.
 */
import type {
  CoachMode,
  CoachMoment,
  CoachPersonalityId,
  MoveFacts,
} from "./types";
import type { TriggerDecision } from "./detect";

export type Locale = "vi" | "en";

export interface PersonalityMeta {
  id: CoachPersonalityId;
  name: Record<Locale, string>;
  blurb: Record<Locale, string>;
  /** Prefix used by the deterministic renderer. */
  opener: Record<Locale, string>;
  /** Teaching mode always asks; this style asks in every mode. */
  alwaysAsks: boolean;
  /** Keeps the deterministic text to one sentence. */
  terse: boolean;
}

export const PERSONALITIES: Record<CoachPersonalityId, PersonalityMeta> = {
  friendly_teacher: {
    id: "friendly_teacher",
    name: { vi: "Thầy giáo thân thiện", en: "Friendly Teacher" },
    blurb: {
      vi: "Giải thích nhẹ nhàng, luôn động viên trước khi chỉ ra lỗi.",
      en: "Warm explanations, encouragement before correction.",
    },
    opener: { vi: "Khoan đã nhé,", en: "Hold on a second —" },
    alwaysAsks: false,
    terse: false,
  },
  concise_master: {
    id: "concise_master",
    name: { vi: "Kiện tướng ngắn gọn", en: "Concise Master" },
    blurb: {
      vi: "Một câu, đúng trọng tâm, không vòng vo.",
      en: "One sentence, straight to the point.",
    },
    opener: { vi: "", en: "" },
    alwaysAsks: false,
    terse: true,
  },
  socratic_coach: {
    id: "socratic_coach",
    name: { vi: "Huấn luyện viên Socrates", en: "Socratic Coach" },
    blurb: {
      vi: "Luôn hỏi trước, để bạn tự tìm ra câu trả lời.",
      en: "Always asks first so you find the answer yourself.",
    },
    opener: { vi: "Thử nghĩ xem:", en: "Think for a moment:" },
    alwaysAsks: true,
    terse: false,
  },
};

export function personalityName(id: CoachPersonalityId, locale: Locale): string {
  return PERSONALITIES[id].name[locale];
}

const PIECE_NAMES: Record<string, Record<Locale, string>> = {
  p: { vi: "tốt", en: "pawn" },
  n: { vi: "mã", en: "knight" },
  b: { vi: "tượng", en: "bishop" },
  r: { vi: "xe", en: "rook" },
  q: { vi: "hậu", en: "queen" },
  k: { vi: "vua", en: "king" },
};

const OPENING_TEXT: Record<string, Record<Locale, string>> = {
  early_queen: {
    vi: "Hậu ra quá sớm sẽ bị các quân nhẹ của đối thủ đuổi, và bạn mất nhịp phát triển.",
    en: "An early queen gets chased by minor pieces and you lose development tempo.",
  },
  same_piece_twice: {
    vi: "Bạn đang di chuyển cùng một quân nhiều lần trong khi các quân khác còn ở nhà.",
    en: "You are moving the same piece again while other pieces are still at home.",
  },
  too_many_pawn_moves: {
    vi: "Quá nhiều nước tốt trong khai cuộc: quân nhẹ chưa ra trận thì trung tâm khó giữ.",
    en: "Too many pawn moves early: without developed pieces the centre is hard to hold.",
  },
  king_uncastled: {
    vi: "Vua vẫn ở trung tâm sau nhiều nước — nhập thành trước khi ván cờ mở tung.",
    en: "The king is still in the centre — castle before the position opens up.",
  },
  undeveloped_pieces: {
    vi: "Còn nhiều quân nhẹ chưa ra trận; hãy phát triển trước khi tấn công.",
    en: "Several minor pieces are still undeveloped; develop before attacking.",
  },
};

const STRATEGIC_TEXT: Record<string, Record<Locale, string>> = {
  trapped_rook: {
    vi: "Xe của bạn đang bị kẹt và gần như không có nước đi — hãy mở đường cho nó.",
    en: "Your rook is boxed in with almost no squares — open a file for it.",
  },
  loose_king: {
    vi: "Vua của bạn đang thoáng gió; đối thủ có thể dồn quân sang cánh đó.",
    en: "Your king is airy; the opponent can pile up on that wing.",
  },
  passive_pieces: {
    vi: "Các quân đang khá thụ động — tìm một nước cải thiện quân xấu nhất.",
    en: "Your pieces are passive — improve your worst-placed piece.",
  },
};

function pieceName(type: string | null, locale: Locale): string {
  if (!type) return locale === "vi" ? "quân" : "piece";
  return PIECE_NAMES[type]?.[locale] ?? (locale === "vi" ? "quân" : "piece");
}

function lossPawns(lossCp: number): string {
  return (lossCp / 100).toFixed(1);
}

/** Body text for a trigger. Always available — this is the AI-free fallback. */
export function deterministicMessage(
  decision: TriggerDecision,
  facts: MoveFacts,
  locale: Locale,
): string {
  const best = facts.bestSan;
  const vi = locale === "vi";
  switch (decision.kind) {
    case "blunder":
      return vi
        ? `${facts.playedSan} làm mất khoảng ${lossPawns(decision.lossCp)} tốt. ${best ? `Engine chọn ${best}.` : ""}`.trim()
        : `${facts.playedSan} drops about ${lossPawns(decision.lossCp)} pawns. ${best ? `The engine prefers ${best}.` : ""}`.trim();
    case "missed_tactic":
      return vi
        ? `Có một đòn phối hợp trong thế cờ vừa rồi${best ? ` — ${best}` : ""}. ${facts.mateBefore ? `Đó là đường chiếu hết trong ${facts.mateBefore} nước.` : `Bạn bỏ lỡ khoảng ${lossPawns(decision.lossCp)} tốt.`}`
        : `There was a tactic in that position${best ? ` — ${best}` : ""}. ${facts.mateBefore ? `It was mate in ${facts.mateBefore}.` : `You missed about ${lossPawns(decision.lossCp)} pawns.`}`;
    case "hanging_piece":
      return vi
        ? `${pieceName(facts.hangingPiece, locale)} ở ${facts.hangingSquare} đang không được bảo vệ và có thể bị bắt.${best ? ` Engine chọn ${best}.` : ""}`
        : `Your ${pieceName(facts.hangingPiece, locale)} on ${facts.hangingSquare} is undefended and can be taken.${best ? ` The engine plays ${best}.` : ""}`;
    case "mistake":
      return vi
        ? `${facts.playedSan} làm thế cờ xấu đi khoảng ${lossPawns(decision.lossCp)} tốt.${best ? ` Nước mạnh hơn: ${best}.` : ""}`
        : `${facts.playedSan} costs roughly ${lossPawns(decision.lossCp)} pawns.${best ? ` Stronger was ${best}.` : ""}`;
    case "opening_principle":
      return OPENING_TEXT[facts.openingIssue ?? "undeveloped_pieces"]?.[locale] ?? "";
    case "strategic_lesson":
      return STRATEGIC_TEXT[facts.strategicIssue ?? "passive_pieces"]?.[locale] ?? "";
  }
}

/** Socratic question shown before the answer is revealed. */
export function deterministicQuestion(
  decision: TriggerDecision,
  facts: MoveFacts,
  locale: Locale,
): string {
  const vi = locale === "vi";
  switch (decision.kind) {
    case "hanging_piece":
      return vi
        ? "Bạn có thấy quân nào của mình đang không được bảo vệ không?"
        : "Can you spot one of your pieces that is left undefended?";
    case "missed_tactic":
      return vi
        ? "Bạn có thấy quân nào của đối thủ đang không được bảo vệ không?"
        : "Do you see an opponent piece that is not defended?";
    case "blunder":
      return vi
        ? "Sau nước vừa rồi, đối thủ có nước đáp trả mạnh nào?"
        : "After that move, what is the opponent's strongest reply?";
    case "mistake":
      return vi
        ? "Nước nào cải thiện quân yếu nhất của bạn?"
        : "Which move improves your worst-placed piece?";
    case "opening_principle":
      return vi
        ? "Trong khai cuộc, quân nào của bạn còn chưa ra trận?"
        : "In the opening, which of your pieces is still at home?";
    case "strategic_lesson":
      return vi ? "Kế hoạch dài hơi của bạn ở đây là gì?" : "What is your long-term plan here?";
  }
}

/** First-level hint: points at the area, never at the exact move. */
export function deterministicHint(
  decision: TriggerDecision,
  facts: MoveFacts,
  locale: Locale,
): string {
  const vi = locale === "vi";
  if (facts.hangingSquare) {
    return vi ? `Nhìn quanh ô ${facts.hangingSquare}.` : `Look around ${facts.hangingSquare}.`;
  }
  if (facts.bestUci) {
    const from = facts.bestUci.slice(0, 2);
    return vi ? `Quân đang đứng ở ${from} muốn nói điều gì đó.` : `The piece on ${from} wants your attention.`;
  }
  return vi ? "Kiểm tra lại các nước bắt quân và chiếu." : "Re-check every capture and check.";
}

/** Squares worth highlighting: the hanging square plus the engine move squares. */
function highlightSquares(facts: MoveFacts): string[] {
  const out = new Set<string>();
  if (facts.hangingSquare) out.add(facts.hangingSquare);
  if (facts.bestUci) {
    out.add(facts.bestUci.slice(0, 2));
    out.add(facts.bestUci.slice(2, 4));
  }
  return [...out];
}

/**
 * Builds the full moment. `mode` and `personality` only affect whether a
 * question is asked first and how long the text is.
 */
export function buildMoment(
  decision: TriggerDecision,
  facts: MoveFacts,
  opts: { mode: CoachMode; personality: CoachPersonalityId; locale: Locale },
): CoachMoment {
  const meta = PERSONALITIES[opts.personality];
  const body = deterministicMessage(decision, facts, opts.locale);
  const opener = meta.opener[opts.locale];
  const message = meta.terse || !opener ? body : `${opener} ${body}`;
  const asks = opts.mode === "teaching" || meta.alwaysAsks;

  return {
    id: `ply-${facts.plyIndex}`,
    kind: decision.kind,
    severity: decision.severity,
    plyIndex: facts.plyIndex,
    moveNumber: facts.moveNumber,
    playedSan: facts.playedSan,
    bestSan: facts.bestSan,
    bestUci: facts.bestUci,
    lossCp: decision.lossCp,
    skillKey: decision.skillKey,
    highlight: highlightSquares(facts),
    arrow: facts.bestUci
      ? { from: facts.bestUci.slice(0, 2), to: facts.bestUci.slice(2, 4) }
      : null,
    message,
    question: asks ? deterministicQuestion(decision, facts, opts.locale) : null,
    hint: deterministicHint(decision, facts, opts.locale),
    retryable: decision.kind !== "opening_principle" && decision.kind !== "strategic_lesson",
  };
}
