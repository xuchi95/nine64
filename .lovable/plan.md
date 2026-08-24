# Hệ thống chống gian lận Nexus Chess (Fair Play Engine)

Hiện tại app chỉ có một lớp heuristic duy nhất: `src/lib/fairplay/score.ts` tính z-score từ 4 tín hiệu (engine match, hard-move match, biến động thời gian, accuracy khó) khi review ván, lưu trong lịch sử máy người dùng. Bảng `game_fairplay` đã tồn tại nhưng **chưa có gì ghi vào** (chỉ admin đọc được), và không có tín hiệu hành vi nào được thu ở ván online. Kế hoạch dưới đây xây một hệ thống nhiều lớp, tự phát hiện và tự xử lý.

Về mục tiêu "95%": không hệ thống nào tuyên bố con số này một cách trung thực nếu chỉ dùng một chỉ số. Cách đạt được: nhiều lớp phát hiện độc lập cộng dồn, và mục tiêu 95% được **đo bằng benchmark tự sinh** (mô phỏng 6 loại gian lận + người chơi thật ở nhiều trình độ), yêu cầu ≥95% recall với false-positive ≤2% trước khi coi là nghiệm thu.

## Lớp 1 — Thu tín hiệu hành vi (client, ván online)

Ghi nhận theo từng nước, không thu nội dung ngoài trang:
- Thời gian nghĩ từng nước, thời điểm nhấc quân/thả quân, độ trễ giữa lúc đối thủ đi và lúc mình bắt đầu tương tác.
- Số lần rời tab/mất focus và tổng thời gian rời tab trong lúc đến lượt mình (dấu hiệu tra engine ngoài).
- Cách nhập nước: kéo-thả, click hai ô, thời gian di chuyển chuột/ngón tay, số nước "không do dự" (thao tác đầu tiên là đúng ô đích).
- Dán bàn cờ/FEN từ clipboard, mở nhiều tab cùng ván, thay đổi kích thước cửa sổ bất thường.
- Fingerprint nhẹ (không PII): timezone, loại thiết bị, hash user-agent — chỉ để phát hiện multi-account/farming.

## Lớp 2 — Phân tích engine phía sau ván

- Chạy phân tích ván bằng Stockfish với MultiPV, tính cho từng bên:
  - Tỉ lệ khớp nước top-1 và top-3, tách riêng theo độ phức tạp vị trí và theo giai đoạn ván.
  - CPL trung bình, phương sai CPL (người thật dao động lớn, engine rất phẳng).
  - Chỉ số "nước chỉ engine mới thấy": nước hi sinh/không tự nhiên nhưng đúng best move.
  - Độ ổn định theo độ sâu: người thật sai nhiều hơn khi thế cần tính sâu.
- So khớp với đường cong kỳ vọng theo rating (một bảng chuẩn theo dải Glicko): lệch quá xa dải kỳ vọng là tín hiệu.

## Lớp 3 — Mô hình tổng hợp và profile theo người chơi

- Kết hợp các tín hiệu bằng hồi quy logistic có trọng số (hệ số hiệu chỉnh trên benchmark), cho ra xác suất gian lận 0–100 kèm khoảng tin cậy theo số nước mẫu.
- Phát hiện theo dòng thời gian (sequential test kiểu SPRT): tích lũy bằng chứng qua nhiều ván, tránh kết luận từ một ván may mắn.
- Phát hiện "bật/tắt engine giữa ván": phân đoạn ván (change-point detection) để bắt trường hợp chỉ dùng engine ở thế khó.
- Phát hiện sandbagging (cố thua để hạ rating) và boosting (dàn xếp với account phụ: cặp đối thủ lặp lại, kết quả một chiều, thời gian ván cực ngắn).
- Profile dài hạn mỗi người chơi: rating tăng vọt bất thường, độ chính xác nhảy bậc, khác biệt giữa ván online và ván luyện.

## Lớp 4 — Xử lý tự động (server-authoritative)

Ngưỡng và hành động:
- < 40: bình thường, không lưu cờ.
- 40–69: theo dõi, lưu báo cáo nội bộ, ghép cặp ưu tiên với nhóm cùng mức để bảo vệ người chơi sạch.
- 70–84: ván không tính rating, gửi cảnh báo trong app, yêu cầu vào hàng đợi "fair play" (giới hạn rời tab).
- ≥ 85 (hoặc SPRT kết luận sau ≥3 ván): tự động khoá xếp hạng, hoàn rating cho đối thủ bị hại, tạo hồ sơ cho admin xem xét.
- Mọi quyết định chạy trong server function; điểm và bằng chứng không bao giờ do client tự khai (client chỉ gửi tín hiệu thô có ký thời gian máy chủ).

## Lớp 5 — Trang quản trị & minh bạch

- `/admin/fairplay`: danh sách hồ sơ theo mức nghi vấn, chi tiết từng tín hiệu, biểu đồ CPL/thời gian, danh sách ván liên quan, nút xác nhận hoặc bỏ cờ (ghi lại người quyết định).
- Trang cho người chơi: trạng thái fair-play của chính mình, lý do bị hạn chế ở mức chung, và cách khiếu nại.

## Chi tiết kỹ thuật

- Bảng mới/mở rộng: `fairplay_signals` (tín hiệu thô theo ván/người), `fairplay_reports` (điểm + bằng chứng + phiên bản model), `fairplay_actions` (hành động đã áp dụng, ai quyết định), mở rộng `game_fairplay` với các cột tín hiệu mới; mọi bảng có GRANT + RLS (người chơi chỉ đọc bản rút gọn của mình, admin đọc đủ qua `has_role`).
- Module mới: `src/lib/fairplay/{signals,engineProfile,model,sprt,segments,collusion,thresholds}.ts`; hook `useFairplayTelemetry` gắn vào ván online; server functions `submitFairplaySignals`, `evaluateFairplay`, `listFairplayCases`, `resolveFairplayCase` (admin, kiểm tra role qua `context.supabase`).
- Phân tích engine chạy trong Web Worker Stockfish hiện có, xếp hàng nền sau khi ván kết thúc; kết quả tổng hợp gửi lên server để chấm điểm.
- Hiệu chỉnh model bằng benchmark tự sinh trong repo (`src/lib/fairplay/__tests__/benchmark`): người chơi mô phỏng 800–2400 Elo + 6 kiểu gian lận (engine toàn ván, engine chỉ thế khó, engine ở tàn cuộc, engine độ sâu thấp, hỗ trợ mở đầu bằng sách, dàn xếp kết quả).

## Nghiệm thu

- Unit test (vitest) cho từng module tín hiệu, SPRT, change-point, collusion, ngưỡng xử lý.
- Benchmark: ≥95% phát hiện trên tập gian lận mô phỏng, ≤2% false positive trên tập người chơi sạch; in bảng kết quả khi chạy test.
- Kiểm thử Playwright: chơi ván online 2 phiên, mô phỏng rời tab + nước hoàn hảo → thấy hồ sơ xuất hiện ở trang admin, ván bị đánh dấu không tính rating, đối thủ được hoàn rating.
- Kiểm tra RLS: người chơi thường không đọc được hồ sơ của người khác; không rò tín hiệu thô ra client.
- Build sạch, không lỗi console/runtime, kiểm tra responsive 390px.
