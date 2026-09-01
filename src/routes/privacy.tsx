import { createFileRoute, Link } from "@tanstack/react-router";
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
    updatedLabel: "Có hiệu lực từ",
    intro:
      `Chào mừng bạn đến với ${APP.name} — nền tảng cờ vua trực tuyến tập trung vào tính công bằng, phân tích chuyên sâu và trải nghiệm học tập cá nhân hoá. Chính sách này giải thích rõ ràng dữ liệu chúng tôi thu thập, lý do thu thập, cách chúng tôi bảo vệ dữ liệu và quyền của bạn khi sử dụng ứng dụng web, ứng dụng di động và các dịch vụ liên quan. Bằng việc sử dụng dịch vụ, bạn đồng ý với chính sách này.`,
    sections: [
      {
        heading: "Dữ liệu chúng tôi thu thập",
        body: [
          "Dữ liệu tài khoản: địa chỉ email, tên hiển thị, ảnh đại diện, mã định danh người dùng, ngôn ngữ, tùy chọn theme bàn cờ và cài đặt hiển thị.",
          "Dữ liệu chơi cờ: ván đấu (PGN/FEN), thời gian mỗi nước, điểm hệ số Glicko-2, câu đố đã giải, tiến độ học tập, bình luận trong ván và lịch sử xem trực tiếp.",
          "Dữ liệu kỹ thuật cần thiết cho vận hành và chống gian lận: địa chỉ IP rút gọn, loại trình duyệt/thiết bị, hệ điều hành, thời điểm truy cập, mã phiên, log lỗi và các số liệu tương tác với nền tảng.",
        ],
      },
      {
        heading: "Đăng nhập bằng Google",
        body: [
          "Khi bạn chọn “Tiếp tục với Google”, chúng tôi nhận các trường hồ sơ công khai cơ bản từ tài khoản Google của bạn: địa chỉ email, tên hiển thị, ảnh đại diện (nếu bạn đã công khai) và mã định danh người dùng Google duy nhất (sub).",
          "Chúng tôi KHÔNG đọc Gmail, Google Drive, Google Calendar, danh bạ, lịch sử tìm kiếm, vị trí, hoặc bất kỳ dữ liệu Google nhạy cảm nào khác. Chúng tôi cũng không lưu trữ hoặc tiếp cận mật khẩu Google của bạn.",
          "Dữ liệu Google chỉ được sử dụng để: (1) tạo và xác thực tài khoản Nine64 duy nhất, (2) hiển thị tên và ảnh đại diện của bạn trên hồ sơ công khai, (3) gửi email thông báo quan trọng về tài khoản nếu bạn đồng ý, và (4) duy trì bảo mật phiên đăng nhập.",
          "Việc sử dụng dữ liệu Google tuân thủ Chính sách dữ liệu người dùng dịch vụ API của Google, bao gồm các yêu cầu Sử dụng hạn chế (Limited Use) được mô tả chi tiết dưới đây.",
        ],
      },
      {
        heading: "Cam kết Sử dụng hạn chế của Google (Limited Use)",
        body: [
          "Nine64 tuân thủ nghiêm ngặt Chính sách dữ liệu người dùng dịch vụ API của Google, kể cả các yêu cầu Sử dụng hạn chế.",
          "Dữ liệu người dùng Google của bạn chỉ được sử dụng để cung cấp và cải thiện tính năng đăng nhập, hồ sơ tài khoản, bảo mật và liên lạc thiết yếu liên quan đến dịch vụ Nine64.",
          "Chúng tôi không bán, cho thuê, chuyển nhượng hoặc chia sẻ dữ liệu Google của bạn cho bên thứ ba nhằm mục đích quảng cáo, tiếp thị, phân tích hành vi tiêu dùng, hoặc xây dựng hồ sơ người dùng bên ngoài Nine64.",
          "Chúng tôi không sử dụng dữ liệu Google để cá nhân hoá quảng cáo, không kết hợp với dữ liệu từ nguồn bên thứ ba để theo dõi người dùng trên web, và không cho phép nhân viên hoặc nhà cung cấp truy cập rộng rãi ngoài phạm vi công việc cần thiết.",
          "Bạn có thể ngắt kết nối đăng nhập Google bất kỳ lúc nào trong phần Cài đặt tài khoản hoặc thu hồi quyền của Nine64 trong trang quản lý ứng dụng của Google Account.",
        ],
      },
      {
        heading: "Mục đích sử dụng dữ liệu",
        body: [
          "Vận hành tài khoản, ghép cặp thi đấu, tính toán điểm xếp hạng Glicko-2, lưu trữ và hiển thị lịch sử ván đấu.",
          "Cung cấp phân tích ván đấu, huấn luyện viên AI, câu đố cờ vua, bài học theo giáo trình và lộ trình học tập cá nhân hoá.",
          "Bảo vệ tính công bằng: hệ thống Fair Play phân tích nước đi, thời gian suy nghĩ và hành vi để phát hiện gian lận, đồng thời duy trì hồ sơ xử lý cần thiết.",
          "Cải thiện hiệu năng, độ ổn định, khả năng sử dụng và chất lượng sản phẩm thông qua số liệu tổng hợp, không nhằm xác định cá nhân.",
          "Gửi thông báo quan trọng về tài khoản, bảo mật, thay đổi điều khoản hoặc các sự kiện liên quan đến dịch vụ khi bạn đồng ý nhận.",
        ],
      },
      {
        heading: "Nội dung công khai",
        body: [
          "Tên hiển thị, ảnh đại diện, điểm rating và các ván đấu trực tuyến của bạn có thể hiển thị công khai trên bảng xếp hạng, hồ sơ người chơi, trang xem trực tiếp và các liên kết chia sẻ.",
          "Ván đấu với máy hoặc ván cục bộ chỉ hiển thị công khai khi bạn chủ động chia sẻ hoặc đăng tải.",
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
        heading: "Chia sẻ và chuyển giao dữ liệu",
        body: [
          "Chúng tôi không bán, trao đổi hoặc cho thuê dữ liệu cá nhân của bạn, kể cả dữ liệu Google, dưới bất kỳ hình thức nào.",
          "Chúng tôi sử dụng các nhà cung cấp hạ tầng cần thiết (lưu trữ đám mây, cơ sở dữ liệu, máy chủ cờ, dịch vụ AI phân tích, gửi email, chống lạm dụng) được chọn lọc. Họ chỉ xử lý dữ liệu theo chỉ dẫn của chúng tôi và theo các điều khoản bảo mật tương đương.",
          "Chúng tôi chỉ tiết lộ dữ liệu khi luật pháp yêu cầu, khi cần thiết để bảo vệ quyền lợi hợp pháp, an toàn của người dùng và của Nine64, hoặc khi bạn đã đồng ý rõ ràng.",
        ],
      },
      {
        heading: "Bảo vệ dữ liệu",
        body: [
          "Mọi kết nối giữa trình duyệt/ứng dụng và hạ tầng Nine64 đều được mã hoá bằng TLS.",
          "Truy cập cơ sở dữ liệu được kiểm soát theo vai trò (role-based access), có chính sách bảo mật ở tầng hàng (row-level security) và chỉ những người/khối mã có quyền hợp lệ mới có thể đọc/ghi dữ liệu.",
          "Mật khẩu không bao giờ được lưu dưới dạng văn bản thuần. Khóa bí mật dịch vụ được lưu trữ an toàn trên biến môi trường máy chủ và không bao giờ xuất hiện trong mã nguồn frontend.",
          "Chúng tôi áp dụng giới hạn tốc độ (rate limiting), xác thực đa yếu tố (MFA) cho admin, ghi log bảo mật và kiểm tra định kỳ để phát hiện truy cập bất thường.",
        ],
      },
      {
        heading: "Lưu trữ và xoá dữ liệu",
        body: [
          "Dữ liệu tài khoản và hồ sơ được lưu giữ trong thời gian tài khoản còn hoạt động. Bạn có thể yêu cầu xoá tài khoản bất kỳ lúc nào trong phần Cài đặt hoặc qua trang Liên hệ.",
          "Sau khi xoá tài khoản, dữ liệu định danh cá nhân (email, tên, ảnh đại diện) sẽ được xoá hoặc ẩn danh trong vòng 30 ngày, trừ dữ liệu cần giữ để tuân thủ pháp luật, xử lý tranh chấp hoặc phục vụ hồ sơ Fair Play.",
          "Dữ liệu ván đấu ẩn danh/tổng hợp có thể được giữ lại lâu hơn cho mục đích thống kê, nghiên cứu và cải thiện hệ thống chống gian lận.",
        ],
      },
      {
        heading: "Quyền của bạn",
        body: [
          "Bạn có quyền truy cập, chỉnh sửa, xuất (export) và xoá dữ liệu cá nhân của mình từ phần Cài đặt tài khoản.",
          "Bạn có thể thu hồi quyền truy cập của Nine64 trong phần quản lý tài khoản Google của bạn bất kỳ lúc nào. Lưu ý rằng việc thu hồi quyền Google có thể đăng xuất bạn khỏi Nine64 nhưng không tự động xoá tài khoản Nine64 đã tạo.",
          "Bạn có thể khiếu nại hoặc đặt câu hỏi về dữ liệu thông qua trang Liên hệ hoặc email chính thức của Nine64.",
        ],
      },
      {
        heading: "Cookie và bộ nhớ cục bộ",
        body: [
          "Chúng tôi dùng cookie và bộ nhớ cục bộ để duy trì phiên đăng nhập, ghi nhớ ngôn ngữ, theme bàn cờ, cài đặt giao diện và trạng thái ván đang chơi ngoại tuyến. Chi tiết xem trang Chính sách cookie.",
        ],
      },
      {
        heading: "Trẻ em",
        body: [
          "Dịch vụ không dành cho người dùng dưới 13 tuổi. Nếu phát hiện tài khoản vi phạm, chúng tôi sẽ xoá tài khoản đó và dữ liệu liên quan.",
        ],
      },
      {
        heading: "Câu hỏi thường gặp",
        body: [
          "Dữ liệu Google nào được truy cập? Chúng tôi chỉ nhận email, tên hiển thị, ảnh đại diện (nếu công khai) và mã định danh Google duy nhất (sub). Chúng tôi không đọc Gmail, Google Drive, Google Calendar, danh bạ, lịch sử tìm kiếm hay vị trí của bạn.",
          "Limited Use của Google nghĩa là gì? Nghĩa là dữ liệu Google chỉ dùng để xác thực tài khoản, hiển thị hồ sơ, bảo mật và liên lạc thiết yếu. Chúng tôi không bán, không dùng cho quảng cáo, không theo dõi bạn trên web và không kết hợp với dữ liệu bên thứ ba.",
          "Tôi có thể thu hồi quyền Google không? Có. Bạn có thể thu hồi quyền trong phần quản lý ứng dụng của Google Account, hoặc xoá tài khoản Nine64 trong phần Cài đặt. Lưu ý: thu hồi quyền Google có thể đăng xuất bạn nhưng không tự động xoá dữ liệu đã lưu trên Nine64.",
          "Ai có quyền truy cập dữ liệu cá nhân của tôi? Chỉ bạn và nhân viên hoặc khối mã Nine64 được ủy quyền trong phạm vi công việc cần thiết. Dữ liệu được bảo vệ bằng TLS, chính sách bảo mật tầng hàng (RLS), phân quyền theo vai trò (RBAC), xác thực đa yếu tố cho admin và nhật ký kiểm tra.",
          "Làm sao liên hệ hỗ trợ? Gửi yêu cầu qua trang Liên hệ trong ứng dụng hoặc email chính thức của Nine64. Chúng tôi phản hồi các câu hỏi về quyền riêng tư, dữ liệu Google và yêu cầu xoá tài khoản trong vòng 30 ngày.",
        ],
      },
      {
        heading: "Thay đổi chính sách",
        body: [
          "Chúng tôi có thể cập nhật chính sách này theo thời gian. Thay đổi quan trọng sẽ được thông báo trong ứng dụng, qua email hoặc qua thông báo tài khoản trước khi có hiệu lực. Việc tiếp tục sử dụng dịch vụ sau khi cập nhật đồng nghĩa với việc bạn chấp nhận bản mới.",
        ],
      },
    ],
    contact: "Câu hỏi về quyền riêng tư hoặc dữ liệu Google? Liên hệ với chúng tôi qua trang Liên hệ của Nine64.",
  },
  en: {
    title: "Privacy Policy",
    updatedLabel: "Effective as of",
    intro:
      `Welcome to ${APP.name} — an online chess platform focused on fair play, deep game analysis, and personalized learning. This policy explains what data we collect, why we collect it, how we protect it, and your rights when using our web app, mobile app, and related services. By using the service you agree to this policy.`,
    sections: [
      {
        heading: "Data we collect",
        body: [
          "Account data: email address, display name, avatar, user identifier, language, board theme and display preferences.",
          "Chess data: games (PGN/FEN), move times, Glicko-2 ratings, puzzles solved, learning progress, in-game chat and spectator history.",
          "Technical data needed for operations and anti-cheat: truncated IP address, browser/device type, operating system, access timestamps, session identifiers, error logs and platform interaction metrics.",
        ],
      },
      {
        heading: "Signing in with Google",
        body: [
          "When you choose “Continue with Google” we receive only basic public Google profile fields: email address, display name, profile picture (if you have made it public) and your unique Google user identifier (sub).",
          "We do NOT read Gmail, Google Drive, Google Calendar, contacts, search history, location, or any other sensitive Google data. We also never store or access your Google password.",
          "Google data is used solely to: (1) create and authenticate your unique Nine64 account, (2) display your name and avatar on your public profile, (3) send important account-related emails if you opt in, and (4) maintain a secure sign-in session.",
          "Our use of Google data complies with the Google API Services User Data Policy, including the Limited Use requirements described in detail below.",
        ],
      },
      {
        heading: "Google Limited Use commitment",
        body: [
          `${APP.name} strictly adheres to the Google API Services User Data Policy, including the Limited Use requirements.`,
          "Your Google user data is used only to provide and improve sign-in, account profile, security, and essential service-related communications for Nine64.",
          "We do not sell, lease, transfer, or share Google data with third parties for advertising, marketing, consumer behavior analysis, or building user profiles outside of Nine64.",
          "We do not use Google data to personalize ads, do not combine it with third-party data to track users across the web, and do not allow broad employee or vendor access beyond what is strictly necessary for their job function.",
          "You can disconnect Google sign-in at any time from your account settings, or revoke Nine64's access from your Google Account permissions page.",
        ],
      },
      {
        heading: "How we use data",
        body: [
          "Operating accounts, matchmaking, Glicko-2 rating calculations, and storing and displaying your game history.",
          "Providing game analysis, the AI coach, chess puzzles, course lessons, and personalized training plans.",
          "Protecting fair play: our Fair Play system analyses moves, think times and behavior to detect cheating and maintains necessary case records.",
          "Measuring and improving performance, reliability, usability and product quality through aggregated, non-identifying metrics.",
          "Sending important account, security, terms-of-service, or service-related notifications when you opt in.",
        ],
      },
      {
        heading: "Public content",
        body: [
          "Your display name, avatar, rating and online games may appear publicly on leaderboards, player profiles, spectator pages and shared links.",
          "Games against bots or local games become public only when you choose to share or upload them.",
        ],
      },
      {
        heading: `${APP.name}'s rights to game data`,
        body: [
          "You grant Nine64 a non-exclusive, royalty-free, worldwide right to store, display, analyse and use your game data, chat and posted content in order to operate, promote and improve the service (including training anti-cheat models and analysis features).",
          "Data used for research, statistics or promotion is aggregated or anonymised where individual identification is not required.",
        ],
      },
      {
        heading: "Sharing and transfer",
        body: [
          "We do not sell, trade, or rent your personal data, including Google data, in any form.",
          "We rely on select infrastructure providers (cloud hosting, database, chess engine servers, AI analysis services, email delivery, abuse prevention). They process data only on our instructions and under equivalent security obligations.",
          "We may disclose data where required by law, where necessary to protect the legitimate rights and safety of users and Nine64, or where you have given explicit consent.",
        ],
      },
      {
        heading: "Data security",
        body: [
          "All connections between your browser/app and Nine64 infrastructure are encrypted with TLS.",
          "Database access is role-based, protected by row-level security policies, and only authorized personnel and code paths can read or write data.",
          "Passwords are never stored in plain text. Service secrets are held in server environment variables and never appear in frontend source code.",
          "We apply rate limiting, multi-factor authentication for admins, security logging, and periodic reviews to detect anomalous access.",
        ],
      },
      {
        heading: "Retention and deletion",
        body: [
          "Account and profile data are retained while your account remains active. You can request account deletion at any time from Settings or via the Contact page.",
          "After account deletion, personally identifying data (email, name, avatar) is erased or anonymised within 30 days, except data we must retain for legal compliance, dispute resolution or Fair Play records.",
          "Anonymised or aggregated game data may be kept longer for statistical, research, and anti-cheat improvement purposes.",
        ],
      },
      {
        heading: "Your rights",
        body: [
          "You have the right to access, edit, export, and delete your personal data from your account settings.",
          "You can revoke Nine64's Google access at any time from your Google Account permissions page. Note that revoking Google access may sign you out of Nine64 but does not automatically delete your existing Nine64 account.",
          "You can raise questions or complaints about data handling through our Contact page or official Nine64 email.",
        ],
      },
      {
        heading: "Cookies and local storage",
        body: [
          "We use cookies and local storage to keep you signed in and to remember language, board theme, UI preferences and offline game state. See the Cookie Policy page for details.",
        ],
      },
      {
        heading: "Children",
        body: ["The service is not intended for anyone under 13. Accounts found in breach will be removed along with related data."],
      },
      {
        heading: "Frequently asked questions",
        body: [
          "Which Google data does Nine64 access? We receive only your email address, display name, profile picture (if public), and unique Google identifier (sub). We do not read Gmail, Google Drive, Google Calendar, contacts, search history, or location.",
          "What is Google Limited Use? It means Google data is used solely for account authentication, profile display, security, and essential service communication. We do not sell it, use it for advertising, track you across the web, or combine it with third-party data.",
          "Can I revoke Google access? Yes. You can revoke access from your Google Account permissions page, or delete your Nine64 account in Settings. Note: revoking Google access may sign you out but does not automatically erase data already stored on Nine64.",
          "Who can access my personal data? Only you and authorized Nine64 personnel or code paths within the scope of their job. Data is protected by TLS, row-level security (RLS), role-based access control (RBAC), admin MFA, and audit logs.",
          "How do I contact support? Submit a request through the in-app Contact page or the official Nine64 email. We respond to privacy, Google data, and account-deletion inquiries within 30 days.",
        ],
      },
      {
        heading: "Changes to this policy",
        body: [
          "We may update this policy from time to time. Material changes will be announced in-app, by email, or through account notice before taking effect. Continued use after an update means you accept the new version.",
        ],
      },
    ],
    contact: "Questions about privacy or Google data? Reach us through the Nine64 Contact page.",
  },
};

function PrivacyPage() {
  return (
    <LegalArticle docs={DOCS}>
      <div className="mt-8 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        <p>
          This privacy notice also supports our Google OAuth application review. For terms of service, see{" "}
          <Link to="/terms" className="text-foreground underline underline-offset-4 hover:text-primary">
            Terms of Service
          </Link>
          .
        </p>
      </div>
    </LegalArticle>
  );
}
