import { createFileRoute } from "@tanstack/react-router";
import { APP } from "@/config/app";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/privacy")({
  head: () =>
    pageHead({
      path: "/privacy",
      title: `Chính sách bảo mật — ${APP.name}`,
      description:
        "Cách Nine64 thu thập, sử dụng và bảo vệ dữ liệu tài khoản cùng lịch sử ván đấu của bạn.",
    }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl py-8">
      <h1 className="text-3xl font-bold tracking-tight">Chính sách bảo mật</h1>
      <p className="mt-2 text-sm text-muted-foreground">Cập nhật lần cuối: {new Date().toLocaleDateString("vi-VN")}</p>

      <section className="mt-8 space-y-6 text-sm leading-relaxed text-foreground/90">
        <p>
          {APP.name} cam kết bảo vệ thông tin cá nhân của bạn. Chính sách này giải thích cách chúng tôi thu thập, sử dụng và bảo vệ dữ liệu khi bạn sử dụng nền tảng cờ vua trực tuyến của chúng tôi.
        </p>

        <div>
          <h2 className="text-lg font-semibold">1. Thông tin chúng tôi thu thập</h2>
          <p className="mt-2">
            Chúng tôi thu thập địa chỉ email, tên hiển thị, ảnh đại diện (nếu có), lịch sử ván đấu, đánh giá, và dữ liệu liên quan đến hoạt động chơi cờ để cung cấp trải nghiệm cá nhân hóa và công bằng.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">2. Cách chúng tôi sử dụng thông tin</h2>
          <p className="mt-2">
            Dữ liệu được dùng để vận hành tài khoản, ghép đấu, lưu trữ lịch sử ván đấu, phân tích trò chơi, cải thiện hệ thống chống gian lận, và gửi thông báo quan trọng về tài khoản.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">3. Chia sẻ thông tin</h2>
          <p className="mt-2">
            Chúng tôi không bán hoặc chia sẻ thông tin cá nhân với bên thứ ba, trừ khi có yêu cầu pháp lý hoặc để bảo vệ quyền lợi hợp pháp của nền tảng và cộng đồng người chơi.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">4. Bảo mật</h2>
          <p className="mt-2">
            Chúng tôi áp dụng các biện pháp kỹ thuật và tổ chức để bảo vệ dữ liệu, bao gồm mã hóa kết nối, xác thực bảo mật, và kiểm soát truy cập dựa trên vai trò.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">5. Quyền của bạn</h2>
          <p className="mt-2">
            Bạn có quyền truy cập, chỉnh sửa hoặc xóa thông tin cá nhân của mình. Để yêu cầu xóa tài khoản, vui lòng liên hệ qua trang hồ sơ hoặc email hỗ trợ.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">6. Thay đổi chính sách</h2>
          <p className="mt-2">
            Chính sách này có thể được cập nhật theo thời gian. Mọi thay đổi quan trọng sẽ được thông báo qua email hoặc thông báo trong ứng dụng.
          </p>
        </div>
      </section>
    </div>
  );
}
