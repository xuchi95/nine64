# Triển khai Cloud cho Nexus Chess

## Mục tiêu
Bổ sung hệ thống tài khoản, chơi online xếp hạng Elo, đồng bộ realtime và lưu lịch sử ván đấu lên Cloud.

## Phân chia công việc

### Phase 1 — Xác thực & hồ sơ người chơi
- Tạo Supabase client (`src/integrations/supabase/client.ts`, `client.server.ts`).
- Thêm middleware auth trong `src/start.ts` (`attachSupabaseAuth`) để server function nhận diện user.
- Tạo layout `_authenticated/route.tsx` bảo vệ các trang cần đăng nhập.
- Tạo route `/auth/login.tsx`, `/auth/register.tsx` với email/password.
- Tạo bảng `profiles` (id, username, display_name, avatar_url, elo_bullet, elo_blitz, elo_rapid, elo_classical, created_at) + trigger tạo profile khi auth.users INSERT.
- Tạo `user_roles` + `has_role` theo chuẩn bảo mật.
- Header hiển thị avatar/elo và nút logout.

### Phase 2 — Ghép cặp online realtime
- Bảng `matchmaking_queue` (user_id, time_control, rating_range, status, created_at) với RLS.
- Server function `findMatch` tìm đối thủ gần Elo nhất trong cùng time control.
- Khi ghép thành công, tạo bản ghi `games` với 2 người chơi, màu random, thời gian, FEN ban đầu.
- Route `/play/online.tsx` với giao diện chọn time control, nút "Find match" và trạng thái chờ.
- Toast + âm thanh thông báo khi tìm được đối thủ.

### Phase 3 — Đồng bộ bàn cờ, đồng hồ và kết quả
- Realtime channel theo `game_id` nhận sự kiện `move`, `clock`, `resign`, `draw_offer`, `game_over`.
- Mỗi nước đi được lưu vào bảng `moves` (game_id, move_number, san, uci, fen, white_ms, black_ms, played_at) qua server function để đảm bảo hợp lệ.
- Đồng hồ server-authoritative: server function `getGameClock` trả về thời gian còn lại đã tính tại server.
- Client cập nhật đồng hồ mỗi giây và khi nhận realtime event.
- Xử lý hết giờ, chiếu hết, bỏ cuộc, hòa đồng ý — cập nhật kết quả và Elo.

### Phase 4 — Lịch sử ván đấu trên Cloud
- Bảng `games` lưu kết quả, Elo 2 bên, PGN, độ chính xác, eval curve.
- Server function `saveOnlineGame` lưy ván khi kết thúc.
- Trang `/games` hiển thị danh sách ván online + offline (merge localStorage).
- Trang `/games/$gameId` hỗ trợ cả game online (fetch từ DB) và offline (localStorage).
- Có thể chạy review engine trên ván online đã lưu.

## Kiến trúc kỹ thuật
- Sử dụng `createServerFn` cho mọi API nội bộ.
- Supabase Realtime cho sync trạng thái game.
- RLS bảo vệ queue và games; server function dùng `supabaseAdmin` chỉ khi cần quyền cao hơn.
- Mọi bảng public đều có `GRANT` đầy đủ trong migration.
- Auth route không dùng loader bảo vệ; `_authenticated/` layout redirect về `/auth/login` nếu chưa đăng nhập.

## Các file/route sẽ tạo/sửa
- Mới: `src/integrations/supabase/*`, `src/lib/auth.ts`, `src/lib/online.ts`, `src/lib/elo.ts`, `src/routes/_authenticated/route.tsx`, `src/routes/auth/login.tsx`, `src/routes/auth/register.tsx`, `src/routes/play.online.tsx`, `supabase/migrations/*`.
- Sửa: `src/start.ts`, `src/components/layout/AppShell.tsx`, `src/routes/__root.tsx`, `src/hooks/useChessGame.ts`, `src/lib/history.ts`.
