import { createFileRoute, Link } from "@tanstack/react-router";
import { APP } from "@/config/app";
import { pageHead } from "@/lib/seo";
import { LegalArticle, type LegalDoc } from "@/components/legal/LegalArticle";
import type { Locale } from "@/lib/i18n";

export const Route = createFileRoute("/cookie-policy")({
  head: () =>
    pageHead({
      path: "/cookie-policy",
      title: `Chính sách cookie — ${APP.name}`,
      description:
        "Chính sách cookie Nine64: từng nhóm cookie, mục đích, thời hạn lưu và cách thay đổi lựa chọn (song ngữ Việt – Anh).",
    }),
  component: CookiePolicyPage,
});

const DOCS: Record<Locale, LegalDoc> = {
  vi: {
    title: "Chính sách cookie",
    updatedLabel: "Cập nhật lần cuối",
    intro: `${APP.name} sử dụng cookie và các công nghệ lưu trữ tương tự (localStorage, sessionStorage) để duy trì phiên đăng nhập, ghi nhớ tuỳ chọn giao diện, bảo vệ nền tảng khỏi gian lận và hiểu cách sản phẩm được sử dụng. Trang này giải thích chi tiết từng nhóm cookie, mục đích và cách bạn kiểm soát chúng.`,
    sections: [
      {
        heading: "Cookie là gì?",
        body: [
          "Cookie là tệp văn bản nhỏ mà website lưu trên thiết bị của bạn. Chúng cho phép website nhận ra trình duyệt giữa các lần truy cập, nhờ đó bạn không phải đăng nhập lại hay thiết lập lại giao diện mỗi lần mở trang.",
          "Nine64 cũng dùng localStorage của trình duyệt cho cùng mục đích: lưu ngôn ngữ, theme bàn cờ, lịch sử ván đấu ngoại tuyến và lựa chọn cookie của bạn. Chúng tôi gọi chung tất cả các công nghệ này là “cookie” trong trang này.",
        ],
      },
      {
        heading: "Nhóm 1 — Cookie bắt buộc (không thể tắt)",
        body: [
          "Mục đích: duy trì phiên đăng nhập và token xác thực, ghi nhớ xác thực hai lớp, bảo vệ biểu mẫu khỏi tấn công CSRF, giới hạn tần suất yêu cầu, phục vụ hệ thống Fair Play và lưu trạng thái ván đang chơi để bạn không mất ván khi tải lại trang.",
          "Ví dụ: token phiên Nine64 (do nhà cung cấp xác thực đặt), khoá lưu trạng thái ván đang chơi, khoá lưu chính lựa chọn cookie của bạn (nine64.cookie-consent).",
          "Thời hạn: từ hết phiên trình duyệt đến tối đa 180 ngày với lựa chọn cookie. Không thể tắt vì nếu thiếu, bạn không thể đăng nhập hoặc chơi.",
        ],
      },
      {
        heading: "Nhóm 2 — Cookie tuỳ chọn giao diện (bật/tắt được)",
        body: [
          "Mục đích: ghi nhớ ngôn ngữ hiển thị (Tiếng Việt/English), theme bàn cờ và bộ quân cờ, âm thanh, tốc độ hoạt ảnh, bố cục bảng phân tích và các thiết lập cá nhân hoá khác.",
          "Nếu bạn tắt nhóm này, nền tảng vẫn hoạt động bình thường nhưng sẽ quay lại thiết lập mặc định mỗi khi bạn mở lại trình duyệt.",
          "Thời hạn: tối đa 180 ngày, lưu trên thiết bị của bạn.",
        ],
      },
      {
        heading: "Nhóm 3 — Cookie phân tích ẩn danh (bật/tắt được)",
        body: [
          "Mục đích: đo lường tổng hợp và ẩn danh về số lượt truy cập, trang được xem, hiệu năng tải trang và lỗi phát sinh, giúp chúng tôi tìm điểm nghẽn và cải thiện sản phẩm.",
          "Dữ liệu phân tích được tổng hợp, không dùng để nhận dạng cá nhân bạn, không bán cho bên thứ ba và không dùng cho quảng cáo nhắm mục tiêu.",
          "Nhóm này mặc định TẮT. Cookie chỉ được đặt sau khi bạn bật trong bảng lựa chọn cookie.",
        ],
      },
      {
        heading: "Cookie quảng cáo",
        body: [
          "Nine64 không sử dụng cookie quảng cáo, không theo dõi bạn trên các website khác và không chia sẻ dữ liệu với mạng lưới quảng cáo.",
        ],
      },
      {
        heading: "Cookie của bên thứ ba",
        body: [
          "Khi bạn đăng nhập bằng Google, Google có thể đặt cookie của riêng họ trong quá trình xác thực; việc đó tuân theo chính sách quyền riêng tư của Google.",
          "Nhà cung cấp hạ tầng của chúng tôi (cơ sở dữ liệu, xác thực, CDN, chống lạm dụng) có thể đặt cookie kỹ thuật cần thiết để dịch vụ hoạt động và chống tấn công tự động.",
        ],
      },
      {
        heading: "Cách thay đổi lựa chọn của bạn",
        body: [
          "Bạn có thể mở lại bảng lựa chọn cookie bất cứ lúc nào bằng liên kết “Tuỳ chọn cookie” ở chân trang, rồi bật/tắt từng nhóm và lưu lại.",
          "Bạn cũng có thể xoá hoặc chặn cookie trong cài đặt trình duyệt. Lưu ý: chặn cookie bắt buộc sẽ khiến bạn không đăng nhập hoặc không chơi được.",
        ],
      },
      {
        heading: "Thay đổi chính sách",
        body: [
          "Khi có thay đổi quan trọng về cách sử dụng cookie, chúng tôi sẽ cập nhật trang này và hiển thị lại bảng lựa chọn để bạn xác nhận lần nữa.",
        ],
      },
    ],
    contact: `Mọi câu hỏi về cookie, vui lòng liên hệ ${APP.name} qua trang Liên hệ.`,
  },
  en: {
    title: "Cookie Policy",
    updatedLabel: "Last updated",
    intro: `${APP.name} uses cookies and similar storage technologies (localStorage, sessionStorage) to keep you signed in, remember your interface preferences, protect the platform against cheating and understand how the product is used. This page explains each cookie category, its purpose and how you control it.`,
    sections: [
      {
        heading: "What are cookies?",
        body: [
          "Cookies are small text files a website stores on your device. They let the site recognise your browser between visits so you do not have to sign in again or reconfigure the interface every time.",
          "Nine64 also uses browser localStorage for the same purposes: language, board theme, offline game history and your cookie choices. On this page we refer to all of these technologies collectively as “cookies”.",
        ],
      },
      {
        heading: "Category 1 — Strictly necessary cookies (cannot be disabled)",
        body: [
          "Purpose: maintain your session and authentication tokens, remember two-factor authentication, protect forms against CSRF, apply rate limiting, support the Fair Play system and store live game state so you do not lose a game when reloading.",
          "Examples: the Nine64 session token set by our authentication provider, live game state keys, and the key that stores your cookie choices themselves (nine64.cookie-consent).",
          "Lifetime: from browser session only up to 180 days for the consent record. They cannot be turned off — without them you cannot sign in or play.",
        ],
      },
      {
        heading: "Category 2 — Preference cookies (optional)",
        body: [
          "Purpose: remember your display language (Vietnamese/English), board theme and piece set, sound, animation speed, analysis panel layout and other personalisation settings.",
          "If you turn this category off the platform still works, but it reverts to default settings every time you reopen your browser.",
          "Lifetime: up to 180 days, stored on your device.",
        ],
      },
      {
        heading: "Category 3 — Anonymous analytics cookies (optional)",
        body: [
          "Purpose: aggregated, anonymous measurement of visits, pages viewed, load performance and errors, so we can find bottlenecks and improve the product.",
          "Analytics data is aggregated, is not used to identify you personally, is never sold to third parties and is never used for targeted advertising.",
          "This category is OFF by default. These cookies are only set after you enable them in the cookie preferences dialog.",
        ],
      },
      {
        heading: "Advertising cookies",
        body: [
          "Nine64 does not use advertising cookies, does not track you across other websites and does not share data with ad networks.",
        ],
      },
      {
        heading: "Third-party cookies",
        body: [
          "When you sign in with Google, Google may set its own cookies during authentication; that is governed by Google's privacy policy.",
          "Our infrastructure providers (database, authentication, CDN, abuse protection) may set technical cookies required to run the service and block automated attacks.",
        ],
      },
      {
        heading: "How to change your choices",
        body: [
          "You can reopen the cookie preferences dialog at any time via the “Cookie preferences” link in the footer, then toggle each category and save.",
          "You can also delete or block cookies in your browser settings. Note that blocking strictly necessary cookies will prevent you from signing in or playing.",
        ],
      },
      {
        heading: "Changes to this policy",
        body: [
          "If we make material changes to how we use cookies we will update this page and show the preferences dialog again so you can confirm your choices.",
        ],
      },
    ],
    contact: `For any questions about cookies, please contact ${APP.name} through the Contact page.`,
  },
};

function CookiePolicyPage() {
  return (
    <LegalArticle docs={DOCS}>
      <p className="text-sm">
        <Link to="/privacy" className="text-primary hover:underline">
          Chính sách quyền riêng tư / Privacy Policy
        </Link>
        {" · "}
        <Link to="/terms" className="text-primary hover:underline">
          Điều khoản sử dụng / Terms of Service
        </Link>
        {" · "}
        <Link to="/data-rights" className="text-primary hover:underline">
          Quyền dữ liệu / Data rights
        </Link>
      </p>
    </LegalArticle>
  );
}
