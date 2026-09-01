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
