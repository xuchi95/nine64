import { createFileRoute, Link } from "@tanstack/react-router";
import { APP } from "@/config/app";
import { pageHead } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { useT, type Locale } from "@/lib/i18n";

export const Route = createFileRoute("/about")({
  head: () =>
    pageHead({
      path: "/about",
      title: `Về Nine64 — Nền tảng cờ vua trực tuyến`,
      description:
        "Nine64 là nền tảng cờ vua trực tuyến: chơi với máy Stockfish 18, đấu xếp hạng Glicko-2, phân tích AI và luyện câu đố. Giới thiệu song ngữ Việt – Anh.",
    }),
  component: AboutPage,
});

interface Copy {
  eyebrow: string;
  title: string;
  intro: string;
  featuresTitle: string;
  features: { name: string; text: string }[];
  accountTitle: string;
  account: string[];
  trustTitle: string;
  trust: string[];
  ctaPlay: string;
  ctaSignIn: string;
  legal: string;
  privacy: string;
  terms: string;
  cookies: string;
  contact: string;
}

const COPY: Record<Locale, Copy> = {
  vi: {
    eyebrow: "Giới thiệu",
    title: `${APP.name} — Chơi. Phân tích. Vươn lên.`,
    intro:
      "Nine64 là nền tảng cờ vua trực tuyến do đội ngũ Việt Nam phát triển, phục vụ người chơi từ mới bắt đầu đến trình độ thi đấu. Bạn có thể chơi ngay trên trình duyệt, không cần cài đặt.",
    featuresTitle: "Nine64 mang lại gì cho bạn",
    features: [
      { name: "Đấu trực tuyến xếp hạng", text: "Ghép cặp nhanh theo trình độ với hệ số Glicko-2, đồng hồ đồng bộ máy chủ và giải đấu Swiss/Arena." },
      { name: "Máy cờ Stockfish 18", text: "16 cấp độ, 7 tính cách bot với độ trễ suy nghĩ như người thật, kể cả biến thể Chess960." },
      { name: "Phân tích và huấn luyện viên AI", text: "Xem lại từng nước đi, biểu đồ đánh giá, chỉ ra sai lầm và gợi ý kế hoạch luyện tập cá nhân hoá." },
      { name: "Câu đố và khoá học", text: "Kho câu đố có lặp lại ngắt quãng, bài học khai cuộc – trung cuộc – tàn cuộc theo lộ trình." },
      { name: "Fair Play", text: "Hệ thống chống gian lận tự phát triển, chỉ áp dụng khoá xếp hạng có thời hạn thay vì cấm tài khoản." },
    ],
    accountTitle: "Tài khoản và đăng nhập Google",
    account: [
      "Bạn có thể đăng ký bằng email hoặc chọn “Tiếp tục với Google” để đăng nhập nhanh và an toàn.",
      "Khi dùng Google, Nine64 chỉ nhận email, tên hiển thị và ảnh đại diện của bạn để tạo hồ sơ người chơi. Chúng tôi không truy cập Gmail, Drive hay bất kỳ dữ liệu Google nào khác.",
      "Bạn có thể thu hồi quyền truy cập hoặc xoá tài khoản Nine64 bất cứ lúc nào.",
    ],
    trustTitle: "Cam kết của chúng tôi",
    trust: [
      "Không bán dữ liệu cá nhân của người chơi.",
      "Minh bạch về dữ liệu công khai: tên hiển thị, rating và ván đấu trực tuyến hiển thị trên bảng xếp hạng.",
      "Hỗ trợ song ngữ Việt – Anh trên toàn bộ nền tảng.",
    ],
    ctaPlay: "Chơi ngay",
    ctaSignIn: "Đăng nhập",
    legal: "Tài liệu pháp lý",
    privacy: "Chính sách bảo mật",
    terms: "Điều khoản sử dụng",
    cookies: "Chính sách cookie",
    contact: "Liên hệ",
  },
  en: {
    eyebrow: "About",
    title: `${APP.name} — Play. Analyse. Ascend.`,
    intro:
      "Nine64 is an online chess platform built by a Vietnamese team for players from complete beginners to competitive level. Everything runs in your browser — no installation required.",
    featuresTitle: "What Nine64 gives you",
    features: [
      { name: "Rated online play", text: "Fast skill-based matchmaking with Glicko-2 ratings, server-synchronised clocks and Swiss/Arena tournaments." },
      { name: "Stockfish 18 engine", text: "16 strength levels and 7 bot personalities with human-like thinking delays, including Chess960." },
      { name: "Analysis and AI coach", text: "Move-by-move review, evaluation graphs, mistake grading and a personalised training plan." },
      { name: "Puzzles and courses", text: "A spaced-repetition puzzle library plus structured opening, middlegame and endgame lessons." },
      { name: "Fair Play", text: "Our in-house anti-cheat applies time-limited rating locks rather than account bans." },
    ],
    accountTitle: "Accounts and Google sign-in",
    account: [
      "You can register with email or choose “Continue with Google” for fast, secure sign-in.",
      "With Google, Nine64 receives only your email address, display name and profile picture to create your player profile. We never access Gmail, Drive or any other Google data.",
      "You can revoke access or delete your Nine64 account at any time.",
    ],
    trustTitle: "Our commitments",
    trust: [
      "We never sell players' personal data.",
      "We are clear about what is public: display name, rating and online games appear on leaderboards.",
      "Full Vietnamese and English support across the platform.",
    ],
    ctaPlay: "Play now",
    ctaSignIn: "Sign in",
    legal: "Legal documents",
    privacy: "Privacy Policy",
    terms: "Terms of Service",
    cookies: "Cookie Policy",
    contact: "Contact",
  },
};

function AboutPage() {
  const { locale, setLocale } = useT();
  const c = COPY[locale];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs uppercase tracking-[0.3em] text-muted-foreground">{c.eyebrow}</span>
        <div className="flex gap-1">
          <Button size="sm" variant={locale === "vi" ? "default" : "outline"} onClick={() => setLocale("vi")}>
            Tiếng Việt
          </Button>
          <Button size="sm" variant={locale === "en" ? "default" : "outline"} onClick={() => setLocale("en")}>
            English
          </Button>
        </div>
      </div>

      <h1 className="mt-6 text-3xl font-bold tracking-tight">{c.title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-foreground/90">{c.intro}</p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button asChild>
          <Link to="/play">{c.ctaPlay}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/auth/login" search={{ redirect: "/" }}>
            {c.ctaSignIn}
          </Link>
        </Button>
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">{c.featuresTitle}</h2>
        <ul className="mt-3 space-y-3 text-sm leading-relaxed text-foreground/90">
          {c.features.map((f) => (
            <li key={f.name}>
              <span className="font-semibold text-brass">{f.name}</span> — {f.text}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">{c.accountTitle}</h2>
        <div className="mt-3 space-y-2 text-sm leading-relaxed text-foreground/90">
          {c.account.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">{c.trustTitle}</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-foreground/90">
          {c.trust.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </section>

      <section className="mt-10 border-t border-border pt-6 text-sm">
        <h2 className="font-semibold">{c.legal}</h2>
        <div className="mt-3 flex flex-wrap gap-4">
          <Link to="/privacy" className="text-brass underline">
            {c.privacy}
          </Link>
          <Link to="/terms" className="text-brass underline">
            {c.terms}
          </Link>
          <Link to="/cookie-policy" className="text-brass underline">
            {c.cookies}
          </Link>
          <Link to="/contact" className="text-brass underline">
            {c.contact}
          </Link>
        </div>
      </section>
    </div>
  );
}
