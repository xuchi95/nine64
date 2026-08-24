# Nâng cấp Nexus Chess bằng các thuật toán "hơn chess.com"

Hiện tại app đã có: engine Stockfish 15 cấp + 7 personality, review ván bằng eval từng ply với accuracy, Elo cổ điển K=32 cố định (`update_ratings_after_game`), ghép cặp theo khoảng Elo, opening book tra tiền tố SAN. Kế hoạch dưới đây thay các phần "đủ dùng" bằng thuật toán chuẩn cao hơn và thêm những thuật toán chess.com không có/không mở.

## Phase 1 — Rating & ghép cặp thông minh

1. **Glicko-2 thay Elo K cố định**
   - Lưu thêm `rating_deviation` (RD) và `volatility` cho từng time-control trong `profiles`.
   - Hàm SQL `apply_glicko2(_game_id)`: cập nhật rating + RD + volatility theo công thức Glicko-2 (τ = 0.5, hội tụ Illinois cho σ').
   - Hiển thị rating dạng `1542 ±78` và "provisional" khi RD > 110.
2. **Ghép cặp theo hàng đợi có điểm ưu tiên**
   - Điểm ghép = w1·|ΔRating| + w2·|ΔRD| − w3·thời gian chờ (nới dần cửa sổ theo hàm mở rộng tuyến tính mỗi 5s, trần ±400).
   - Ưu tiên tránh gặp lại đối thủ vừa đấu (khoá 2 ván gần nhất) và cân bằng màu theo lịch sử màu đã chơi.
3. **Phát hiện bất thường (fair-play heuristic)**
   - Chỉ số per-ván: tỉ lệ khớp top-1 engine theo độ sâu, phương sai thời gian nghĩ, accuracy theo độ phức tạp vị trí.
   - Điểm nghi vấn tổng hợp z-score, lưu vào `game_fairplay`; hiện cờ nội bộ cho admin (không tự khoá tài khoản).

## Phase 2 — Phân tích ván sâu hơn chess.com

4. **Phân loại nước đi chuẩn CPL + độ phức tạp**
   - Chuyển eval sang win% bằng sigmoid, tính win-loss mỗi ply, gán nhãn: Brilliant / Great / Best / Excellent / Good / Inaccuracy / Mistake / Blunder / Missed win.
   - Brilliant xác định bằng kiểm tra hy sinh quân thật (SEE âm nhưng vẫn là best move và giữ ưu thế) — không chỉ dựa vào delta eval.
5. **Accuracy có trọng số theo độ phức tạp**
   - Độ phức tạp = độ phân tán eval của MultiPV=5 + số nước hợp lệ; nước "chỉ có một lối đi" không cộng điểm, nước khó cộng nhiều.
   - Ước lượng "Elo ván này" từ CPL trung bình theo hồi quy logistic.
6. **Nhận diện motif chiến thuật**
   - So sánh PV thực tế với cây tìm kiếm ngắn để gắn nhãn: pin, fork, discovered attack, back-rank, hanging piece, mate net, zugzwang cơ bản.
   - Timeline motif trong trang chi tiết ván.
7. **Đánh giá phase & kế hoạch**
   - Phân loại giai đoạn theo material phase value; đánh giá cấu trúc tốt (isolated/doubled/passed pawn, open file, king safety attack-unit) để đưa gợi ý kế hoạch bằng chữ.

## Phase 3 — Học tập cá nhân hoá (khác biệt lớn nhất)

8. **Puzzle sinh tự động từ ván của chính người chơi**
   - Quét ván đã review, chọn vị trí có win% swing ≥ 25% và có đúng một nước thắng rõ (kiểm tra bằng MultiPV): sinh puzzle "bạn đã bỏ lỡ".
   - Puzzle rating theo Glicko-2 riêng; chấm điểm theo số lần thử.
9. **Lịch ôn tập SRS (FSRS-lite)**
   - Mỗi puzzle/motif sai được xếp lịch lặp lại theo độ khó – độ bền – độ nhớ (FSRS), ưu tiên điểm yếu.
   - Hàng đợi "Ôn hôm nay" trên trang chủ.
10. **Bản đồ điểm yếu & chọn bot đối kháng**
    - Tổng hợp CPL theo phase / theo opening / theo motif → radar điểm yếu.
    - Multi-armed bandit (UCB1) chọn level + personality bot sao cho tỉ lệ thắng người chơi giữ quanh 50%, đồng thời tấn công đúng điểm yếu.

## Phase 4 — Khai cuộc & báo cáo

11. **Cây khai cuộc thống kê cá nhân**
    - Xây trie từ toàn bộ ván đã lưu (local + cloud): win%, CPL trung bình, nước lệch sách đầu tiên cho mỗi node.
    - Trang `/openings` duyệt cây, chỉ ra "nước bạn hay sai nhất trong biến này".
12. **Ước lượng sức mạnh & dự đoán tiến bộ**
    - Elo hiệu năng (performance rating) theo cửa sổ trượt + hồi quy tuyến tính có trọng số giảm dần để dự báo rating 30 ngày.

## Chi tiết kỹ thuật

- Toàn bộ tính toán engine (MultiPV, SEE, motif, puzzle sinh) chạy trong Web Worker Stockfish sẵn có; thêm hàng đợi tác vụ nền có huỷ để không chặn UI.
- Module mới: `src/lib/rating/glicko2.ts`, `src/lib/analysis/{winrate,classify,complexity,motifs,phase}.ts`, `src/lib/learn/{puzzleGen,fsrs,bandit}.ts`, `src/lib/openings/tree.ts`, `src/lib/fairplay/score.ts`.
- Migration mới: cột Glicko cho `profiles`, bảng `puzzles`, `puzzle_attempts`, `srs_cards`, `game_fairplay`, `weakness_profile`; mọi bảng public có GRANT + RLS theo `auth.uid()`.
- Ghép cặp và Glicko chạy trong server function/RPC (server-authoritative); puzzle/SRS đọc-ghi qua RLS của chính user.
- Route mới: `/puzzles`, `/train`, `/openings`, `/insights`; nhúng thêm tab vào trang chi tiết ván.

## Nghiệm thu

- Unit test cho glicko2, win%, classify, SEE, FSRS, UCB1, cây khai cuộc (vitest).
- Kiểm thử Playwright: chơi 1 ván AI → review → thấy nhãn nước đi + accuracy mới → puzzle được sinh → giải puzzle → thẻ SRS lên lịch → radar điểm yếu cập nhật.
- Kiểm thử ghép cặp 2 phiên đăng nhập, xác nhận Glicko cập nhật cả rating và RD sau ván.
- Build sạch, không lỗi console/runtime, kiểm tra responsive mobile 430px.
