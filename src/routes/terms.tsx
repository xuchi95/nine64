import { createFileRoute } from "@tanstack/react-router";
import { APP } from "@/config/app";
import { pageHead } from "@/lib/seo";
import { LegalArticle, type LegalDoc } from "@/components/legal/LegalArticle";
import type { Locale } from "@/lib/i18n";

export const Route = createFileRoute("/terms")({
  head: () =>
    pageHead({
      path: "/terms",
      title: `Điều khoản sử dụng — ${APP.name}`,
      description:
        "Điều khoản sử dụng nền tảng cờ vua Nine64: tài khoản, fair play, nội dung, thanh toán và giới hạn trách nhiệm (song ngữ Việt – Anh).",
    }),
  component: TermsPage,
});

const DOCS: Record<Locale, LegalDoc> = {
  vi: {
    title: "Điều khoản sử dụng",
    updatedLabel: "Có hiệu lực từ",
    intro:
      `Chào mừng bạn đến với ${APP.name}. Khi truy cập hoặc sử dụng nền tảng, bạn đồng ý với các điều khoản dưới đây. Nếu không đồng ý, vui lòng ngừng sử dụng dịch vụ.`,
    sections: [
      {
        heading: "Tài khoản",
        body: [
          "Bạn phải cung cấp thông tin chính xác, đủ 13 tuổi trở lên và chịu trách nhiệm bảo mật thông tin đăng nhập. Mọi hoạt động phát sinh từ tài khoản của bạn được xem là do bạn thực hiện.",
          "Mỗi người chỉ được sử dụng một tài khoản xếp hạng. Tài khoản phụ dùng để né tránh xử lý hoặc thao túng rating sẽ bị vô hiệu hoá.",
        ],
      },
      {
        heading: "Hành vi bị cấm",
        body: [
          "Sử dụng máy cờ, phần mềm hỗ trợ, gợi ý từ người khác hoặc bất kỳ trợ giúp bên ngoài nào trong ván đấu xếp hạng.",
          "Thông đồng, cố tình thua, thao túng ghép cặp, tự động hoá thao tác, khai thác lỗi hệ thống, dò quét hoặc gây quá tải hạ tầng.",
          "Quấy rối, phát ngôn thù ghét, spam, quảng cáo hoặc chia sẻ nội dung vi phạm pháp luật trong chat và nội dung công khai.",
        ],
      },
      {
        heading: "Fair Play và biện pháp xử lý",
        body: [
          "Nine64 vận hành hệ thống Fair Play riêng, phân tích nước đi, thời gian suy nghĩ và hành vi để phát hiện gian lận.",
          "Khi phát hiện vi phạm, chúng tôi có thể áp dụng khoá xếp hạng có thời hạn (tăng dần theo mức độ tái phạm), điều chỉnh hoặc thu hồi rating, huỷ kết quả ván đấu và giải thưởng liên quan.",
          "Quyết định của Nine64 dựa trên bằng chứng thống kê và được xem là quyết định cuối cùng, tuy nhiên bạn luôn có quyền khiếu nại qua trang Liên hệ.",
        ],
      },
      {
        heading: "Nội dung của bạn",
        body: [
          "Bạn giữ quyền sở hữu đối với nội dung mình tạo ra (bình luận, study, chú thích ván đấu).",
          "Bạn cấp cho Nine64 quyền không độc quyền, miễn phí bản quyền, phạm vi toàn cầu, có thể chuyển giao cho nhà cung cấp hạ tầng, để lưu trữ, hiển thị, sao chép, chuyển đổi định dạng, phân tích và quảng bá nội dung đó trong khuôn khổ vận hành và giới thiệu dịch vụ.",
          "Chúng tôi có thể gỡ bỏ nội dung vi phạm điều khoản mà không cần báo trước.",
        ],
      },
      {
        heading: "Đăng nhập bằng Google",
        body: [
          "Nine64 cho phép đăng nhập bằng tài khoản Google. Khi bạn chọn phương thức này, Google xác thực bạn và chuyển cho chúng tôi địa chỉ email, tên hiển thị, ảnh đại diện và mã định danh người dùng (sub). Nine64 KHÔNG yêu cầu và KHÔNG truy cập Gmail, Google Drive, Calendar, Danh bạ hay mật khẩu Google của bạn.",
          "Việc Nine64 sử dụng thông tin nhận được từ Google API tuân thủ Chính sách Dữ liệu Người dùng Dịch vụ Google API (Google API Services User Data Policy), bao gồm các yêu cầu Sử dụng Giới hạn (Limited Use). Dữ liệu Google chỉ được dùng để tạo và bảo vệ tài khoản, không bán, không dùng cho quảng cáo và không chuyển cho bên thứ ba ngoài nhà cung cấp hạ tầng phục vụ chính dịch vụ.",
          "Bạn có thể thu hồi quyền truy cập bất kỳ lúc nào tại trang Quyền ứng dụng của tài khoản Google. Sau khi thu hồi, bạn cần đặt mật khẩu Nine64 hoặc dùng phương thức đăng nhập khác để tiếp tục truy cập tài khoản.",
          "Việc sử dụng tài khoản Google của bạn còn chịu điều chỉnh bởi điều khoản và chính sách của Google. Nine64 không kiểm soát và không chịu trách nhiệm về dịch vụ của Google.",
        ],
      },
      {
        heading: "Quyền riêng tư và dữ liệu",
        body: [
          "Cách chúng tôi thu thập, sử dụng, chia sẻ, bảo vệ, lưu giữ và xoá dữ liệu được mô tả trong Chính sách quyền riêng tư, là một phần không tách rời của Điều khoản này.",
          "Bạn có thể tự xuất dữ liệu hoặc yêu cầu xoá tài khoản tại trang Quyền dữ liệu. Yêu cầu xoá có thời gian chờ 72 giờ để bạn kịp huỷ nếu đổi ý; sau đó định danh cá nhân sẽ được xoá hoặc ẩn danh trong vòng 30 ngày, trừ các trường hợp phải lưu theo pháp luật hoặc phục vụ điều tra Fair Play.",
        ],
      },
      {
        heading: "Dịch vụ và tích hợp bên thứ ba",
        body: [
          "Nine64 sử dụng nhà cung cấp bên thứ ba cho hạ tầng, xác thực, máy cờ hiệu năng cao và các tính năng AI. Họ chỉ xử lý dữ liệu theo chỉ dẫn của chúng tôi và trong phạm vi cần thiết để cung cấp dịch vụ.",
          "Nếu bạn kết nối Nine64 với ứng dụng bên ngoài hoặc ngược lại, bạn chịu trách nhiệm về phạm vi quyền mà mình cấp và có thể thu hồi quyền đó bất cứ lúc nào.",
        ],
      },
      {
        heading: "Truy cập tự động và API",
        body: [
          "Bạn không được dùng bot, script hoặc công cụ tự động để truy cập Nine64 nếu không được chúng tôi cho phép bằng văn bản, và không được vượt qua giới hạn tần suất, cơ chế xác thực hay biện pháp bảo vệ khác.",
          "Mọi thông tin đăng nhập, token hoặc khoá API cấp cho bạn là cá nhân, không được chia sẻ; bạn phải thông báo ngay cho chúng tôi nếu nghi ngờ bị lộ.",
        ],
      },
      {
        heading: "Sở hữu trí tuệ của Nine64",
        body: [
          "Thương hiệu, logo, giao diện, mã nguồn, cơ sở dữ liệu câu đố, khoá học và nội dung do Nine64 tạo ra thuộc sở hữu của Nine64.",
          "Bạn không được sao chép, phân phối lại, thu thập dữ liệu tự động (scraping) hoặc tạo sản phẩm phái sinh nếu không có văn bản chấp thuận của chúng tôi.",
        ],
      },
      {
        heading: "Dịch vụ trả phí và tín dụng",
        body: [
          "Một số tính năng (phân tích sâu, huấn luyện viên AI, máy chủ hiệu năng cao) có thể bị giới hạn theo hạn mức hoặc yêu cầu gói trả phí.",
          "Trừ khi pháp luật bắt buộc, các khoản đã thanh toán hoặc tín dụng đã sử dụng không được hoàn lại. Chúng tôi có thể thay đổi hạn mức và giá dịch vụ với thông báo hợp lý.",
        ],
      },
      {
        heading: "Tính sẵn sàng của dịch vụ",
        body: [
          "Dịch vụ được cung cấp “nguyên trạng” và “theo khả năng sẵn có”. Chúng tôi có thể thay đổi, tạm ngưng hoặc chấm dứt bất kỳ tính năng nào, bao gồm bảo trì theo kế hoạch.",
          "Chúng tôi không cam kết thời gian hoạt động liên tục hay kết quả ván đấu không bị ảnh hưởng bởi sự cố mạng, thiết bị hoặc bên thứ ba.",
        ],
      },
      {
        heading: "Giới hạn trách nhiệm",
        body: [
          "Trong phạm vi pháp luật cho phép, Nine64 không chịu trách nhiệm cho thiệt hại gián tiếp, ngẫu nhiên hoặc hệ quả, bao gồm mất rating, mất dữ liệu, mất cơ hội hoặc gián đoạn kết nối.",
          "Tổng trách nhiệm của Nine64 trong mọi trường hợp không vượt quá số tiền bạn đã thanh toán cho dịch vụ trong 12 tháng liền trước sự kiện phát sinh khiếu nại.",
        ],
      },
      {
        heading: "Chấm dứt",
        body: [
          "Bạn có thể ngừng sử dụng và xoá tài khoản bất kỳ lúc nào. Chúng tôi có thể tạm ngưng hoặc chấm dứt quyền truy cập khi bạn vi phạm điều khoản hoặc gây rủi ro cho nền tảng và người chơi khác.",
        ],
      },
      {
        heading: "Luật áp dụng và thay đổi điều khoản",
        body: [
          "Các điều khoản này được điều chỉnh bởi pháp luật Việt Nam; tranh chấp sẽ được giải quyết tại toà án có thẩm quyền tại Việt Nam, sau khi hai bên đã nỗ lực thương lượng thiện chí.",
          "Điều khoản có thể được cập nhật; việc tiếp tục sử dụng sau khi cập nhật đồng nghĩa với việc bạn chấp nhận bản mới.",
        ],
      },
    ],
    contact: "Cần hỗ trợ hoặc muốn khiếu nại? Hãy dùng trang Liên hệ của Nine64.",
  },
  en: {
    title: "Terms of Service",
    updatedLabel: "Effective from",
    intro:
      `Welcome to ${APP.name}. By accessing or using the platform you agree to the terms below. If you do not agree, please stop using the service.`,
    sections: [
      {
        heading: "Accounts",
        body: [
          "You must provide accurate information, be at least 13 years old, and keep your credentials secure. Activity under your account is treated as your own.",
          "Only one rated account per person is allowed. Alternate accounts used to evade enforcement or manipulate ratings will be disabled.",
        ],
      },
      {
        heading: "Prohibited conduct",
        body: [
          "Using chess engines, assisting software, third-party advice or any outside help during rated games.",
          "Collusion, sandbagging, matchmaking manipulation, automation, exploiting bugs, scraping or overloading our infrastructure.",
          "Harassment, hate speech, spam, advertising or unlawful content in chat and public areas.",
        ],
      },
      {
        heading: "Fair Play and enforcement",
        body: [
          "Nine64 runs its own Fair Play system that analyses moves, think times and behaviour to detect cheating.",
          "Where a violation is found we may apply time-limited rating locks (escalating on repeat offences), adjust or revoke ratings, and void affected game results and prizes.",
          "Our decisions are based on statistical evidence and are final, though you may always appeal through the Contact page.",
        ],
      },
      {
        heading: "Your content",
        body: [
          "You keep ownership of content you create (chat, studies, annotations).",
          "You grant Nine64 a non-exclusive, royalty-free, worldwide licence, sublicensable to our infrastructure providers, to host, display, reproduce, reformat, analyse and promote that content as part of operating and marketing the service.",
          "We may remove content that breaches these terms without prior notice.",
        ],
      },
      {
        heading: "Signing in with Google",
        body: [
          "Nine64 offers Google sign-in. When you use it, Google authenticates you and shares your email address, display name, profile picture and user identifier (sub) with us. Nine64 does NOT request or access your Gmail, Google Drive, Calendar, Contacts or Google password.",
          "Nine64's use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements. Google data is used only to create and protect your account; it is never sold, never used for advertising, and never transferred to third parties other than infrastructure providers serving the core service.",
          "You can revoke access at any time from your Google Account permissions page. After revoking, set a Nine64 password or use another sign-in method to keep access to your account.",
          "Your use of your Google account is also governed by Google's own terms and policies. Nine64 does not control and is not responsible for Google's services.",
        ],
      },
      {
        heading: "Privacy and your data",
        body: [
          "How we collect, use, share, protect, retain and delete data is described in our Privacy Policy, which forms an integral part of these Terms.",
          "You can export your data or request account deletion on the Data rights page. Deletion requests have a 72-hour grace period so you can cancel; afterwards personal identifiers are deleted or anonymised within 30 days, except where retention is legally required or needed for a Fair Play investigation.",
        ],
      },
      {
        heading: "Third-party services and integrations",
        body: [
          "Nine64 relies on third-party providers for infrastructure, authentication, high-performance chess engines and AI features. They process data only on our instructions and only as needed to deliver the service.",
          "If you connect Nine64 to an external app, or an external app to Nine64, you are responsible for the scope of access you grant and may revoke it at any time.",
        ],
      },
      {
        heading: "Automated access and APIs",
        body: [
          "You may not use bots, scripts or automated tools to access Nine64 without our written permission, and you may not bypass rate limits, authentication or other protective measures.",
          "Any credentials, tokens or API keys issued to you are personal and must not be shared; notify us immediately if you suspect they have been exposed.",
        ],
      },
      {
        heading: "Nine64 intellectual property",
        body: [
          "Our brand, logo, interface, source code, puzzle database, courses and original content belong to Nine64.",
          "You may not copy, redistribute, scrape or create derivative works without our written permission.",
        ],
      },
      {
        heading: "Paid features and credits",
        body: [
          "Some features (deep analysis, AI coach, high-performance engine servers) may be quota-limited or require a paid plan.",
          "Unless required by law, payments made and credits consumed are non-refundable. We may change quotas and pricing with reasonable notice.",
        ],
      },
      {
        heading: "Service availability",
        body: [
          "The service is provided “as is” and “as available”. We may modify, suspend or discontinue any feature, including for planned maintenance.",
          "We do not guarantee uninterrupted uptime or that games will be unaffected by network, device or third-party failures.",
        ],
      },
      {
        heading: "Limitation of liability",
        body: [
          "To the maximum extent permitted by law, Nine64 is not liable for indirect, incidental or consequential damages, including lost rating, lost data, lost opportunity or connection interruptions.",
          "Our total liability for any claim will not exceed the amount you paid us for the service in the 12 months preceding the event giving rise to the claim.",
        ],
      },
      {
        heading: "Termination",
        body: [
          "You may stop using the service and delete your account at any time. We may suspend or terminate access if you breach these terms or create risk for the platform or other players.",
        ],
      },
      {
        heading: "Governing law and changes",
        body: [
          "These terms are governed by the laws of Vietnam; disputes will be settled by the competent courts of Vietnam after good-faith negotiation.",
          "We may update these terms; continued use after an update means you accept the new version.",
        ],
      },
    ],
    contact: "Need support or want to appeal? Use the Nine64 Contact page.",
  },
};

function TermsPage() {
  return <LegalArticle docs={DOCS} />;
}
