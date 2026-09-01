# Hotfix Titan Production Qualification

## Mục tiêu
Đưa đúng cấu hình draft Titan hiện tại qua toàn bộ gate phát hành bằng kết quả benchmark thật; không giả mạo `passed`, không bỏ qua lỗi engine và không làm lộ secrets.

## Thực hiện
1. **Sửa gate theo đúng cấu hình**
   - Chọn benchmark mới nhất theo từng `kind` trong phạm vi đúng `config_signature`, thay vì để một run mới hơn của cấu hình khác che mất run hợp lệ.
   - Giữ fail-closed cho missing, timeout, engine error, no-move và illegal move.

2. **Ổn định bộ kiểm định thật**
   - Kiểm tra log Cloud Engine và dữ liệu benchmark hiện tại để xác định timeout/EPD fail.
   - Điều chỉnh request budget hoặc draft config trong giới hạn an toàn để Bench, Speedtest, EPD và Positions hoàn tất ổn định trên Stockfish 18.
   - Không fallback sang WASM, không tự gán kết quả pass.

3. **Chạy lại và đối chiếu**
   - Chạy một qualification mới với duy nhất một fingerprint.
   - Xác nhận mỗi benchmark bắt buộc có row riêng, `passed=true`, không timeout/illegal/error/no-move.
   - Xác nhận readiness của chính draft hiện tại trả `ready=true` và giao diện Admin hiển thị “ĐỦ ĐIỀU KIỆN PHÁT HÀNH”.

4. **Kiểm thử hồi quy**
   - Thêm test cho trường hợp benchmark mới hơn thuộc fingerprint khác không được làm cấu hình hiện tại mất trạng thái hợp lệ.
   - Chạy test liên quan, kiểm tra build/runtime và nghiệm thu trên Admin.

## Ràng buộc kỹ thuật
- OIDC/Cloud Engine/Stockfish 18 và mô hình secrets hiện tại được giữ nguyên.
- Publish vẫn cần quyền admin, lý do audit và benchmark thật.
- Nếu cấu hình draft thay đổi trong lúc chạy, kết quả qualification bị vô hiệu hóa.
