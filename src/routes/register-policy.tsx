import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { APP } from "@/config/app";
import { pageHead } from "@/lib/seo";
import { useT } from "@/lib/i18n";
import { acceptPolicy, getPolicyConsent, POLICY_VERSION } from "@/lib/policyConsent";
import { BrandMark } from "@/components/layout/BrandMark";

export const Route = createFileRoute("/register-policy")({
  head: () =>
    pageHead({
      path: "/register-policy",
      title: `Đồng ý chính sách trước khi đăng ký — ${APP.name}`,
      description:
        "Tóm tắt điều khoản sử dụng, quyền riêng tư, cookie và Fair Play mà bạn cần đồng ý trước khi tạo tài khoản Nine64 (song ngữ Việt – Anh).",
    }),
  component: RegisterPolicyPage,
});

const COPY = {
  vi: {
    title: "Đồng ý chính sách",
    lead: `Trước khi tạo tài khoản ${APP.name}, vui lòng đọc và xác nhận bạn đồng ý với các chính sách dưới đây. Bản đầy đủ luôn có sẵn tại các liên kết tương ứng.`,
    items: [
      {
        h: "Điều khoản sử dụng",
        p: "Bạn đủ 13 tuổi, cung cấp thông tin chính xác, chỉ dùng một tài khoản xếp hạng và chịu trách nhiệm với hoạt động phát sinh từ tài khoản của mình.",
        to: "/terms" as const,
        cta: "Đọc Điều khoản đầy đủ",
      },
      {
        h: "Fair Play",
        p: "Không dùng máy cờ, phần mềm hỗ trợ hay trợ giúp bên ngoài trong ván xếp hạng. Vi phạm có thể dẫn tới khoá xếp hạng có thời hạn và huỷ kết quả ván đấu.",
        to: "/terms" as const,
        cta: "Xem quy định Fair Play",
      },
      {
        h: "Quyền riêng tư & dữ liệu Google",
        p: "Khi đăng nhập bằng Google, chúng tôi chỉ nhận email, tên hiển thị, ảnh đại diện và mã định danh. Nine64 không truy cập Gmail, Drive, Calendar hay danh bạ và tuân thủ yêu cầu Limited Use.",
        to: "/privacy" as const,
        cta: "Đọc Chính sách quyền riêng tư",
      },
      {
        h: "Cookie",
        p: "Cookie bắt buộc giữ phiên đăng nhập và chống gian lận. Cookie tuỳ chọn giao diện và phân tích ẩn danh có thể bật/tắt bất cứ lúc nào.",
        to: "/cookie-policy" as const,
        cta: "Đọc Chính sách cookie",
      },
      {
        h: "Quyền dữ liệu của bạn",
        p: "Bạn có thể xuất toàn bộ dữ liệu cá nhân dạng JSON hoặc yêu cầu ẩn danh/xoá tài khoản với 72 giờ chờ có thể huỷ.",
        to: "/data-rights" as const,
        cta: "Xem trang Quyền dữ liệu",
      },
    ],
    agree: "Tôi đã đọc và đồng ý với Điều khoản sử dụng, Chính sách quyền riêng tư và Chính sách cookie của Nine64.",
    continue: "Đồng ý và tiếp tục đăng ký",
    haveAccount: "Đã có tài khoản?",
    signIn: "Đăng nhập",
    accepted: (d: string) => `Bạn đã đồng ý phiên bản chính sách ${POLICY_VERSION} vào ${d}.`,
  },
  en: {
    title: "Policy agreement",
    lead: `Before creating a ${APP.name} account, please read and confirm that you agree to the policies below. Full versions are always available at the linked pages.`,
    items: [
      {
        h: "Terms of Service",
        p: "You are at least 13, provide accurate information, use a single rated account and are responsible for all activity on your account.",
        to: "/terms" as const,
        cta: "Read the full Terms",
      },
      {
        h: "Fair Play",
        p: "No chess engines, assistance software or outside help in rated games. Violations can lead to time-limited rating locks and voided game results.",
        to: "/terms" as const,
        cta: "See the Fair Play rules",
      },
      {
        h: "Privacy & Google data",
        p: "When you sign in with Google we only receive your email, display name, avatar and user identifier. Nine64 never accesses Gmail, Drive, Calendar or contacts and complies with Limited Use requirements.",
        to: "/privacy" as const,
        cta: "Read the Privacy Policy",
      },
      {
        h: "Cookies",
        p: "Strictly necessary cookies keep you signed in and prevent cheating. Preference and anonymous analytics cookies can be toggled at any time.",
        to: "/cookie-policy" as const,
        cta: "Read the Cookie Policy",
      },
      {
        h: "Your data rights",
        p: "You can export all of your personal data as JSON or request anonymisation/deletion with a cancellable 72-hour grace period.",
        to: "/data-rights" as const,
        cta: "Open the Data rights page",
      },
    ],
    agree: "I have read and agree to Nine64's Terms of Service, Privacy Policy and Cookie Policy.",
    continue: "Agree and continue to sign up",
    haveAccount: "Already have an account?",
    signIn: "Sign in",
    accepted: (d: string) => `You accepted policy version ${POLICY_VERSION} on ${d}.`,
  },
} as const;

function RegisterPolicyPage() {
  const { locale, setLocale } = useT();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { redirect?: string };
  const [checked, setChecked] = useState(false);
  const [acceptedAt, setAcceptedAt] = useState<string | null>(null);
  const copy = COPY[locale];
  const redirectTo = search.redirect && search.redirect.startsWith("/") ? search.redirect : "/";

  useEffect(() => {
    const saved = getPolicyConsent();
    if (saved?.version === POLICY_VERSION) {
      setChecked(true);
      setAcceptedAt(new Date(saved.acceptedAt).toLocaleString(locale === "vi" ? "vi-VN" : "en-GB"));
    }
  }, [locale]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center justify-between gap-4">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          Nine64
        </Link>
        <div className="flex gap-1">
          <Button size="sm" variant={locale === "vi" ? "default" : "outline"} onClick={() => setLocale("vi")}>
            Tiếng Việt
          </Button>
          <Button size="sm" variant={locale === "en" ? "default" : "outline"} onClick={() => setLocale("en")}>
            English
          </Button>
        </div>
      </div>

      <div className="mt-8 text-center">
        <BrandMark className="mx-auto mb-4 size-12" />
        <h1 className="text-3xl font-bold tracking-tight">{copy.title}</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{copy.lead}</p>
      </div>

      <div className="mt-8 space-y-4">
        {copy.items.map((item) => (
          <div key={item.h} className="rounded-xl border border-border/70 bg-card/60 p-4">
            <h2 className="border-l-2 border-primary/70 pl-3 text-lg font-extrabold tracking-tight">{item.h}</h2>
            <p className="mt-2 text-sm leading-relaxed text-foreground/90">{item.p}</p>
            <Link to={item.to} className="mt-2 inline-block text-sm text-primary hover:underline">
              {item.cta} →
            </Link>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-border/80 bg-secondary/20 p-4">
        <label className="flex items-start gap-3 text-sm leading-relaxed">
          <Checkbox
            checked={checked}
            onCheckedChange={(v) => setChecked(v === true)}
            className="mt-0.5"
            aria-label={copy.agree}
          />
          <span>{copy.agree}</span>
        </label>
        {acceptedAt ? <p className="mt-2 text-xs text-muted-foreground">{copy.accepted(acceptedAt)}</p> : null}

        <Button
          className="mt-4 w-full"
          disabled={!checked}
          onClick={() => {
            acceptPolicy();
            navigate({ to: "/auth/register", search: { redirect: redirectTo } });
          }}
        >
          {copy.continue}
        </Button>

        <p className="mt-3 text-center text-sm text-muted-foreground">
          {copy.haveAccount}{" "}
          <Link to="/auth/login" search={{ redirect: redirectTo }} className="text-primary hover:underline">
            {copy.signIn}
          </Link>
        </p>
      </div>
    </div>
  );
}
