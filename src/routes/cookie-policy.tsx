import { createFileRoute } from "@tanstack/react-router";
import { APP } from "@/config/app";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/cookie-policy")({
  head: () =>
    pageHead({
      path: "/cookie-policy",
      title: `Chính sách cookie — ${APP.name}`,
      description:
        "Thông tin về cookie và công nghệ tương tự mà Nine64 sử dụng để vận hành nền tảng cờ vua trực tuyến.",
    }),
  component: CookiePolicyPage,
});

function CookiePolicyPage() {
  return (
    <div className="mx-auto max-w-3xl py-8">
      <h1 className="text-3xl font-bold tracking-tight">Chính sách cookie</h1>
      <p className="mt-2 text-sm text-muted-foreground">Cập nhật lần cuối: {new Date().toLocaleDateString("vi-VN")}</p>

      <section className="mt-8 space-y-6 text-sm leading-relaxed text-foreground/90">
        <p>
          {APP.name} sử dụng cookie và các công nghệ tương tự để cung cấp, bảo mật và cải thiện trải nghiệm chơi cờ của bạn.
        </p>

        <div>
          <h2 className="text-lg font-semibold">1. Cookie là gì?</h2>
          <p className="mt-2">
            Cookie là các tệp nhỏ được lưu trên thiết bị của bạn khi truy cập website. Chúng giúp website ghi nhớ trạng thái đăng nhập, tùy chọn giao diện và các thông tin cần thiết khác.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">2. Cookie chúng tôi sử dụng</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>
              <strong>Cookie cần thiết:</strong> Duy trì phiên đăng nhập, bảo mật tài khoản và đảm bảo các tính năng cốt lõi hoạt động.
            </li>
            <li>
              <strong>Cookie tùy chọn:</strong> Ghi nhớ chế độ sáng/tối, ngôn ngữ, theme bàn cờ và các cài đặt cá nhân hóa khác.
            </li>
            <li>
              <strong>Cookie phân tích:</strong> Giúp chúng tôi hiểu cách người chơi sử dụng nền tảng để cải thiện hiệu năng và trải nghiệm.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold">3. Mục đích sử dụng</h2>
          <p className="mt-2">
            Cookie được dùng để xác thực người dùng, lưu tùy chọn giao diện, đồng bộ hóa cài đặt giữa các phiên, phân tích lỗi và bảo vệ nền tảng khỏi hành vi gian lận.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">4. Quản lý cookie</h2>
          <p className="mt-2">
            Bạn có thể kiểm soát hoặc xóa cookie thông qua cài đặt trình duyệt. Tuy nhiên, việc tắt cookie cần thiết có thể ảnh hưởng đến khả năng đăng nhập và sử dụng một số tính năng của {APP.name}.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">5. Thay đổi chính sách</h2>
          <p className="mt-2">
            Chính sách cookie này có thể được cập nhật theo thời gian. Mọi thay đổi quan trọng sẽ được thông báo qua email hoặc thông báo trong ứng dụng.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">6. Liên hệ</h2>
          <p className="mt-2">
            Nếu có câu hỏi về cách chúng tôi sử dụng cookie, vui lòng liên hệ qua trang hỗ trợ hoặc email chính thức của {APP.name}.
          </p>
        </div>
      </section>
    </div>
  );
}
