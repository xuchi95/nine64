import { createFileRoute } from "@tanstack/react-router";
import { APP } from "@/config/app";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/terms")({
  head: () =>
    pageHead({
      path: "/terms",
      title: `Điều khoản sử dụng — ${APP.name}`,
      description:
        "Điều khoản sử dụng nền tảng cờ vua Nine64: tài khoản, fair play, nội dung và giới hạn trách nhiệm.",
    }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl py-8">
      <h1 className="text-3xl font-bold tracking-tight">Điều khoản sử dụng</h1>
      <p className="mt-2 text-sm text-muted-foreground">Có hiệu lực từ: {new Date().toLocaleDateString("vi-VN")}</p>

      <section className="mt-8 space-y-6 text-sm leading-relaxed text-foreground/90">
        <p>
          Chào mừng bạn đến với {APP.name}. Bằng việc truy cập hoặc sử dụng nền tảng của chúng tôi, bạn đồng ý tuân thủ các điều khoản và điều kiện dưới đây.
        </p>

        <div>
          <h2 className="text-lg font-semibold">1. Chấp nhận điều khoản</h2>
          <p className="mt-2">
            Khi tạo tài khoản hoặc sử dụng dịch vụ, bạn xác nhận rằng mình đã đọc, hiểu và đồng ý với các điều khoản này. Nếu không đồng ý, vui lòng ngừng sử dụng dịch vụ.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">2. Tài khoản người dùng</h2>
          <p className="mt-2">
            Bạn chịu trách nhiệm bảo mật thông tin đăng nhập của mình. Mọi hoạt động diễn ra dưới tài khoản của bạn đều được coi là trách nhiệm của bạn.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">3. Hành vi bị cấm</h2>
          <p className="mt-2">
            Nghiêm cấm sử dụng phần mềm hỗ trợ gian lận, tự động hóa lối chơi, khai thác lỗi hệ thống, quấy rối người chơi khác, hoặc bất kỳ hành vi nào làm tổn hại đến tính công bằng của nền tảng.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">4. Hệ thống công bằng (Fair Play)</h2>
          <p className="mt-2">
            {APP.name} sử dụng công cụ phát hiện gian lận để duy trì môi trường chơi công bằng. Vi phạm có thể dẫn đến khóa xếp hạng tạm thời hoặc các hạn chế khác theo mức độ nghiêm trọng.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">5. Nội dung và quyền sở hữu</h2>
          <p className="mt-2">
            Mọi nội dung, thiết kế, mã nguồn và thương hiệu trên nền tảng đều thuộc sở hữu của {APP.name} và được bảo vệ bởi luật sở hữu trí tuệ.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">6. Giới hạn trách nhiệm</h2>
          <p className="mt-2">
            Chúng tôi không chịu trách nhiệm cho các thiệt hại gián tiếp hoặc do ngắt kết nối mạng, lỗi thiết bị, hoặc sự cố ngoài tầm kiểm soát của chúng tôi.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">7. Thay đổi điều khoản</h2>
          <p className="mt-2">
            Các điều khoản này có thể được cập nhật. Việc tiếp tục sử dụng dịch vụ sau khi thay đổi có hiệu lực đồng nghĩa với việc bạn chấp nhận các điều khoản mới.
          </p>
        </div>
      </section>
    </div>
  );
}
