/**
 * Personal Chess Brain — skill profile, adaptive daily plan, weekly report.
 */
export default {
  vi: {
    "shell.nav.trainingPlan": "Kế hoạch tập",

    "brain.title": "Bộ não cờ vua cá nhân",
    "brain.subtitle":
      "Hồ sơ kỹ năng được tính hoàn toàn từ dữ liệu engine trong các ván bạn đã chơi và luyện tập.",
    "brain.tab.plan": "Kế hoạch hôm nay",
    "brain.tab.profile": "Hồ sơ kỹ năng",
    "brain.tab.weekly": "Báo cáo tuần",
    "brain.loading": "Đang tổng hợp dữ liệu…",
    "brain.error": "Không tải được dữ liệu luyện tập. Thử lại sau nhé.",

    "brain.profile.score": "Điểm",
    "brain.profile.confidence": "Độ tin cậy",
    "brain.profile.sample": "Mẫu",
    "brain.profile.updated": "Cập nhật",
    "brain.profile.never": "chưa có",
    "brain.profile.lowConfidence": "Mẫu còn nhỏ — chưa kết luận chắc chắn.",
    "brain.profile.empty":
      "Chưa có dữ liệu. Hãy chơi và phân tích vài ván để hệ thống bắt đầu đo kỹ năng.",
    "brain.trend.up": "Đang lên",
    "brain.trend.down": "Đang xuống",
    "brain.trend.flat": "Ổn định",
    "brain.trend.unknown": "Chưa đủ dữ liệu",

    "brain.dim.opening": "Khai cuộc",
    "brain.dim.tactics": "Chiến thuật",
    "brain.dim.strategy": "Chiến lược",
    "brain.dim.endgame": "Tàn cuộc",
    "brain.dim.calculation": "Tính toán",
    "brain.dim.defence": "Phòng thủ",
    "brain.dim.conversion": "Chuyển hoá ưu thế",
    "brain.dim.king_safety": "An toàn vua",
    "brain.dim.pawn_structure": "Cấu trúc tốt",
    "brain.dim.time_management": "Quản lý thời gian",
    "brain.dim.blunder_frequency": "Tần suất sai lầm nặng",
    "brain.dim.missed_win_frequency": "Bỏ lỡ cơ hội thắng",
    "brain.dim.complex_position": "Thế cờ phức tạp",

    "brain.plan.title": "Kế hoạch hôm nay",
    "brain.plan.budget": "Thời gian bạn có",
    "brain.plan.minutes": "{n} phút",
    "brain.plan.total": "Tổng {n} phút",
    "brain.plan.fatigue": "Bạn đang có dấu hiệu quá tải — hôm nay kế hoạch nhẹ hơn.",
    "brain.plan.start": "Bắt đầu",
    "brain.plan.done": "Đã xong",
    "brain.plan.failed": "Chưa đạt",
    "brain.plan.why": "Vì sao bài này?",
    "brain.plan.saved": "Đã lưu tiến độ buổi tập.",
    "brain.plan.saveError": "Không lưu được buổi tập.",
    "brain.plan.difficulty.easy": "Dễ",
    "brain.plan.difficulty.normal": "Vừa",
    "brain.plan.difficulty.hard": "Khó",

    "brain.block.tactics": "Chiến thuật",
    "brain.block.opening_recall": "Ôn khai cuộc",
    "brain.block.endgame": "Tàn cuộc",
    "brain.block.srs_review": "Ôn thẻ đến hạn",
    "brain.block.retry": "Chơi lại nước sai",
    "brain.block.bot_challenge": "Thách đấu máy",
    "brain.block.review": "Xem lại ván nhẹ nhàng",

    "brain.reason.weakest_skill":
      "Đây là kỹ năng yếu nhất của bạn hiện tại: {dimension} đạt {score}/100 trên {sample} tình huống.",
    "brain.reason.low_confidence_probe":
      "Hệ thống chưa chắc về {dimension} (chỉ {sample} tình huống, tin cậy {confidence}%), nên cần thêm dữ liệu.",
    "brain.reason.srs_due": "Bạn có {count} thẻ ôn tập đã đến hạn theo lịch FSRS.",
    "brain.reason.recent_mistake":
      "Ván gần đây bạn mắc lỗi ({label}) ở nước thứ {ply} — chơi lại để sửa thói quen.",
    "brain.reason.rating_calibration":
      "Một ván ngắn với máy ở mức phù hợp hệ số {rating} để kiểm chứng tiến bộ.",
    "brain.reason.fatigue_easy":
      "Bạn vừa thất bại {failures} bài trong {sessions} buổi gần đây, nên hôm nay ưu tiên bài nhẹ.",
    "brain.reason.maintenance": "Bài duy trì để giữ nhịp luyện tập hằng ngày.",

    "brain.weekly.title": "Báo cáo tuần",
    "brain.weekly.refresh": "Tạo lại báo cáo",
    "brain.weekly.improved": "Đang cải thiện",
    "brain.weekly.declining": "Đang tụt",
    "brain.weekly.recurring": "Lỗi lặp lại",
    "brain.weekly.openingLeak": "Rò rỉ khai cuộc",
    "brain.weekly.focus": "Nên tập trung tuần tới",
    "brain.weekly.activity": "Hoạt động",
    "brain.weekly.activityLine":
      "{sessions} buổi tập · {minutes} phút · {games} ván · {events} tình huống được ghi nhận",
    "brain.weekly.none": "Chưa có thay đổi đáng kể trong tuần này.",
    "brain.weekly.lowData":
      "Dữ liệu tuần này còn ít — các nhận xét chỉ mang tính tham khảo.",
    "brain.weekly.summary": "Tóm tắt của huấn luyện viên AI",
    "brain.weekly.summaryNote": "Mọi con số đều lấy từ hồ sơ kỹ năng, AI chỉ diễn đạt lại.",
  },
  en: {
    "shell.nav.trainingPlan": "Training plan",

    "brain.title": "Personal Chess Brain",
    "brain.subtitle":
      "Your skill profile is computed purely from engine data across the games and training you have done.",
    "brain.tab.plan": "Today's plan",
    "brain.tab.profile": "Skill profile",
    "brain.tab.weekly": "Weekly report",
    "brain.loading": "Aggregating your data…",
    "brain.error": "Could not load your training data. Please try again later.",

    "brain.profile.score": "Score",
    "brain.profile.confidence": "Confidence",
    "brain.profile.sample": "Sample",
    "brain.profile.updated": "Updated",
    "brain.profile.never": "none yet",
    "brain.profile.lowConfidence": "Small sample — no strong conclusion yet.",
    "brain.profile.empty":
      "No data yet. Play and review a few games so the system can start measuring your skills.",
    "brain.trend.up": "Improving",
    "brain.trend.down": "Slipping",
    "brain.trend.flat": "Stable",
    "brain.trend.unknown": "Not enough data",

    "brain.dim.opening": "Opening",
    "brain.dim.tactics": "Tactics",
    "brain.dim.strategy": "Strategy",
    "brain.dim.endgame": "Endgame",
    "brain.dim.calculation": "Calculation",
    "brain.dim.defence": "Defence",
    "brain.dim.conversion": "Conversion",
    "brain.dim.king_safety": "King safety",
    "brain.dim.pawn_structure": "Pawn structure",
    "brain.dim.time_management": "Time management",
    "brain.dim.blunder_frequency": "Blunder frequency",
    "brain.dim.missed_win_frequency": "Missed wins",
    "brain.dim.complex_position": "Complex positions",

    "brain.plan.title": "Today's plan",
    "brain.plan.budget": "Time available",
    "brain.plan.minutes": "{n} min",
    "brain.plan.total": "{n} min total",
    "brain.plan.fatigue": "You look fatigued — today's plan is lighter.",
    "brain.plan.start": "Start",
    "brain.plan.done": "Done",
    "brain.plan.failed": "Struggled",
    "brain.plan.why": "Why this exercise?",
    "brain.plan.saved": "Session progress saved.",
    "brain.plan.saveError": "Could not save the session.",
    "brain.plan.difficulty.easy": "Easy",
    "brain.plan.difficulty.normal": "Normal",
    "brain.plan.difficulty.hard": "Hard",

    "brain.block.tactics": "Tactics",
    "brain.block.opening_recall": "Opening recall",
    "brain.block.endgame": "Endgame",
    "brain.block.srs_review": "Due card review",
    "brain.block.retry": "Retry your mistake",
    "brain.block.bot_challenge": "Bot challenge",
    "brain.block.review": "Light game review",

    "brain.reason.weakest_skill":
      "This is currently your weakest area: {dimension} scores {score}/100 over {sample} situations.",
    "brain.reason.low_confidence_probe":
      "We are not sure about {dimension} yet ({sample} situations, {confidence}% confidence), so we need more data.",
    "brain.reason.srs_due": "You have {count} spaced-repetition cards due today.",
    "brain.reason.recent_mistake":
      "You made a {label} on move {ply} in a recent game — replay it to fix the habit.",
    "brain.reason.rating_calibration":
      "A short bot game matched to your {rating} rating to verify progress.",
    "brain.reason.fatigue_easy":
      "You failed {failures} exercises across {sessions} recent sessions, so today favours lighter work.",
    "brain.reason.maintenance": "A maintenance block to keep your daily rhythm.",

    "brain.weekly.title": "Weekly report",
    "brain.weekly.refresh": "Regenerate report",
    "brain.weekly.improved": "Improving",
    "brain.weekly.declining": "Slipping",
    "brain.weekly.recurring": "Recurring mistakes",
    "brain.weekly.openingLeak": "Opening leak",
    "brain.weekly.focus": "Focus next week",
    "brain.weekly.activity": "Activity",
    "brain.weekly.activityLine":
      "{sessions} sessions · {minutes} min · {games} games · {events} recorded situations",
    "brain.weekly.none": "No significant change this week.",
    "brain.weekly.lowData": "Thin week of data — treat these notes as indicative only.",
    "brain.weekly.summary": "AI coach summary",
    "brain.weekly.summaryNote": "Every number comes from the deterministic profile; the AI only rephrases it.",
  },
} as const;
