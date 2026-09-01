import { createFileRoute } from "@tanstack/react-router";
import { APP } from "@/config/app";
import { pageHead } from "@/lib/seo";
import { LegalArticle, type LegalDoc } from "@/components/legal/LegalArticle";
import type { Locale } from "@/lib/i18n";

export const Route = createFileRoute("/privacy")({
  head: () =>
    pageHead({
      path: "/privacy",
      title: `Chính sách bảo mật — ${APP.name}`,
      description:
        "Cách Nine64 thu thập, sử dụng, lưu trữ và bảo vệ dữ liệu tài khoản, dữ liệu Google và lịch sử ván đấu của bạn (song ngữ Việt – Anh).",
    }),
  component: PrivacyPage,
});

const DOCS: Record<Locale, LegalDoc> = {
  vi: {
    title: "Chính sách bảo mật",
    updatedLabel: "Cập nhật lần cuối",
    intro:
      `${APP.name} là nền tảng cờ vua trực tuyến. Chính sách này giải thích rõ ràng những dữ liệu chúng tôi thu thập, lý do thu thập, cách chúng tôi bảo vệ dữ liệu và quyền của bạn. Bằng việc sử dụng dịch vụ, bạn đồng ý với chính sách này.`,
    sections: [
      {
        heading: "Dữ liệu chúng tôi thu thập",
        body: [
          "Dữ liệu tài khoản: email, tên hiển thị, ảnh đại diện, ngôn ngữ và cài đặt hiển thị.",
          "Dữ liệu chơi cờ: ván đấu (PGN/FEN), thời gian mỗi nước, hệ số Glicko-2, câu đố đã giải, tiến độ học tập và bình luận trong ván.",
          "Dữ liệu kỹ thuật cần thiết cho vận hành và chống gian lận: địa chỉ IP rút gọn, loại trình duyệt/thiết bị, thời điểm truy cập, log lỗi.",
        ],
      },
      {
        heading: "Đăng nhập bằng Google",
        body: [
          "Khi bạn chọn “Tiếp tục với Google”, chúng tôi chỉ nhận các trường cơ bản trong hồ sơ Google của bạn: địa chỉ email, tên hiển thị, ảnh đại diện và mã định danh người dùng.",
          "Chúng tôi không đọc Gmail, Google Drive, danh bạ hay bất kỳ dữ liệu Google nào khác, và không lưu mật khẩu Google của bạn.",
          "Dữ liệu Google chỉ dùng để tạo và xác thực tài khoản Nine64. Việc sử dụng dữ liệu này tuân thủ Chính sách dữ liệu người dùng dịch vụ API của Google, bao gồm các yêu cầu Sử dụng hạn chế (Limited Use).",
        ],
      },
      {
        heading: "Mục đích sử dụng",
        body: [
          "Vận hành tài khoản, ghép cặp thi đấu, tính điểm rating, lưu và hiển thị lịch sử ván đấu.",
          "Cung cấp phân tích ván đấu, huấn luyện viên AI, câu đố và lộ trình học tập cá nhân hoá.",
          "Bảo vệ tính công bằng: hệ thống Fair Play phân tích nước đi và hành vi để phát hiện gian lận.",
          "Đo lường và cải thiện hiệu năng, độ ổn định cũng như chất lượng sản phẩm.",
        ],
      },
      {
        heading: "Nội dung công khai",
        body: [
          "Tên hiển thị, ảnh đại diện, điểm rating và các ván đấu trực tuyến của bạn có thể hiển thị công khai trên bảng xếp hạng, hồ sơ người chơi, trang xem trực tiếp và các liên kết chia sẻ.",
          "Ván đấu với máy hoặc ván cục bộ chỉ hiển thị công khai khi bạn chủ động chia sẻ.",
        ],
      },
      {
        heading: "Quyền của Nine64 đối với dữ liệu ván đấu",
        body: [
          "Bạn cấp cho Nine64 quyền không độc quyền, miễn phí bản quyền, phạm vi toàn cầu để lưu trữ, hiển thị, phân tích và sử dụng dữ liệu ván đấu, bình luận và nội dung bạn đăng nhằm vận hành, quảng bá và cải thiện dịch vụ (bao gồm huấn luyện mô hình phát hiện gian lận và tính năng phân tích).",
          "Dữ liệu dùng cho mục đích nghiên cứu, thống kê hoặc quảng bá sẽ được tổng hợp hoặc ẩn danh khi không cần thiết phải nhận diện cá nhân.",
        ],
      },
      {
        heading: "Chia sẻ với bên thứ ba",
        body: [
          "Chúng tôi không bán dữ liệu cá nhân của bạn.",
          "Chúng tôi sử dụng các nhà cung cấp hạ tầng cần thiết (lưu trữ đám mây, cơ sở dữ liệu, máy chủ cờ, dịch vụ AI, gửi email, chống lạm dụng). Họ chỉ xử lý dữ liệu theo chỉ dẫn của chúng tôi.",
          "Chúng tôi có thể tiết lộ dữ liệu khi luật pháp yêu cầu hoặc khi cần thiết để bảo vệ quyền lợi hợp pháp, an toàn của người dùng và của Nine64.",
        ],
      },
      {
        heading: "Lưu trữ và bảo mật",
        body: [
          "Kết nối được mã hoá TLS; truy cập dữ liệu được kiểm soát theo vai trò và chính sách bảo mật ở tầng cơ sở dữ liệu.",
          "Chúng tôi lưu dữ liệu tài khoản trong thời gian tài khoản còn hoạt động. Sau khi xoá tài khoản, dữ liệu định danh sẽ được xoá hoặc ẩn danh trong vòng 30 ngày, trừ dữ liệu cần giữ để tuân thủ pháp luật, xử lý tranh chấp hoặc phục vụ hồ sơ Fair Play.",
          "Không hệ thống nào an toàn tuyệt đối; chúng tôi không thể cam kết mức bảo mật vượt quá các biện pháp hợp lý theo tiêu chuẩn ngành.",
        ],
      },
      {
        heading: "Quyền của bạn",
        body: [
          "Bạn có thể xem, chỉnh sửa hoặc tải dữ liệu tài khoản, và yêu cầu xoá tài khoản bất kỳ lúc nào trong phần Cài đặt hoặc qua trang Liên hệ.",
          "Bạn có thể thu hồi quyền truy cập của Nine64 trong phần quản lý tài khoản Google của bạn bất kỳ lúc nào.",
        ],
      },
      {
        heading: "Cookie và bộ nhớ cục bộ",
        body: [
          "Chúng tôi dùng cookie/bộ nhớ cục bộ để duy trì phiên đăng nhập, ghi nhớ ngôn ngữ, giao diện bàn cờ và trạng thái ván đang chơi ngoại tuyến. Chi tiết xem trang Chính sách cookie.",
        ],
      },
      {
        heading: "Trẻ em",
        body: [
          "Dịch vụ không dành cho người dưới 13 tuổi. Nếu phát hiện tài khoản vi phạm, chúng tôi sẽ xoá tài khoản đó.",
        ],
      },
      {
        heading: "Thay đổi chính sách",
        body: [
          "Chúng tôi có thể cập nhật chính sách này. Thay đổi quan trọng sẽ được thông báo trong ứng dụng hoặc qua email. Việc tiếp tục sử dụng dịch vụ sau khi cập nhật đồng nghĩa với việc bạn chấp nhận bản mới.",
        ],
      },
    ],
    contact: "Câu hỏi về quyền riêng tư? Liên hệ với chúng tôi qua trang Liên hệ của Nine64.",
  },
  en: {
    title: "Privacy Policy",
    updatedLabel: "Last updated",
    intro:
      `${APP.name} is an online chess platform. This policy explains what data we collect, why we collect it, how we protect it, and the rights you have. By using the service you agree to this policy.`,
    sections: [
      {
        heading: "Data we collect",
        body: [
          "Account data: email address, display name, avatar, language and display preferences.",
          "Chess data: games (PGN/FEN), move times, Glicko-2 ratings, puzzles solved, learning progress and in-game chat.",
          "Technical data needed for operations and anti-cheat: truncated IP address, browser/device type, access timestamps, error logs.",
        ],
      },
      {
        heading: "Signing in with Google",
        body: [
          "When you choose “Continue with Google” we receive only basic Google profile fields: email address, display name, profile picture and user identifier.",
          "We do not read Gmail, Google Drive, contacts or any other Google data, and we never store your Google password.",
          "Google data is used solely to create and authenticate your Nine64 account. Our use of it complies with the Google API Services User Data Policy, including the Limited Use requirements.",
        ],
      },
      {
        heading: "How we use data",
        body: [
          "Operating accounts, matchmaking, rating calculations, and storing and displaying your game history.",
          "Providing game analysis, the AI coach, puzzles and personalised training plans.",
          "Protecting fair play: our Fair Play system analyses moves and behaviour to detect cheating.",
          "Measuring and improving performance, reliability and product quality.",
        ],
      },
      {
        heading: "Public content",
        body: [
          "Your display name, avatar, rating and online games may appear publicly on leaderboards, player profiles, spectator pages and shared links.",
          "Games against bots or local games become public only when you choose to share them.",
        ],
      },
      {
        heading: "Nine64's rights to game data",
        body: [
          "You grant Nine64 a non-exclusive, royalty-free, worldwide right to store, display, analyse and use your game data, chat and posted content in order to operate, promote and improve the service (including training anti-cheat models and analysis features).",
          "Data used for research, statistics or promotion is aggregated or anonymised where individual identification is not required.",
        ],
      },
      {
        heading: "Sharing with third parties",
        body: [
          "We do not sell your personal data.",
          "We rely on necessary infrastructure providers (cloud hosting, database, chess engine servers, AI services, email delivery, abuse prevention). They process data only on our instructions.",
          "We may disclose data where required by law or where necessary to protect the legitimate rights and safety of users and of Nine64.",
        ],
      },
      {
        heading: "Retention and security",
        body: [
          "Connections are encrypted with TLS; data access is controlled by roles and database-level security policies.",
          "We keep account data while the account is active. After deletion, identifying data is erased or anonymised within 30 days, except data we must retain for legal compliance, dispute resolution or Fair Play records.",
          "No system is perfectly secure; we cannot guarantee protection beyond reasonable, industry-standard measures.",
        ],
      },
      {
        heading: "Your rights",
        body: [
          "You can view, edit or export your account data and request deletion at any time from Settings or via the Contact page.",
          "You can revoke Nine64's access at any time from your Google Account permissions page.",
        ],
      },
      {
        heading: "Cookies and local storage",
        body: [
          "We use cookies/local storage to keep you signed in and to remember language, board theme and offline game state. See the Cookie Policy page for details.",
        ],
      },
      {
        heading: "Children",
        body: ["The service is not intended for anyone under 13. Accounts found in breach will be removed."],
      },
      {
        heading: "Changes to this policy",
        body: [
          "We may update this policy. Material changes will be announced in-app or by email. Continued use after an update means you accept the new version.",
        ],
      },
    ],
    contact: "Privacy questions? Reach us through the Nine64 Contact page.",
  },
};

function PrivacyPage() {
  return <LegalArticle docs={DOCS} />;
}
