# Nine64 AI Player Network — kết quả audit và kế hoạch triển khai

## 1. Audit: kiến trúc hiện tại (đã đọc trực tiếp)

**Matchmaking**
- `create_online_match(_queue_id,_user_id,_initial_fen,_white_is_requester)` là nơi duy nhất tạo ván online. Nó khoá pool bằng `pg_advisory_xact_lock('nine64_match_pool', variant:time_control)`, khoá hàng chờ của người gọi `FOR UPDATE`, tìm đối thủ người thật trong window `least(800, 120 + floor(wait/3)*80)`, tạo `games`, rồi `UPDATE matchmaking_queue ... WHERE id IN (me, opponent)` và **bắt buộc `changed_rows = 2`**.
- `find_match()` chỉ là hàm tìm ứng viên (window hẹp hơn) — không tạo ván.
- Client: `useMatchmaking.ts` join queue → subscribe realtime hàng chờ của chính mình + poll `tryMatch` mỗi 2 giây → `presentMatch` → dialog chấp nhận 15 giây.

**Thời gian & luật**
- `tc_spec()` là nguồn sự thật: legacy `blitz1m/blitz3m/blitz5m/rapid10m/rapid15m/rapid30m`, generic `base+inc` (15–10800 giây, inc 0–180), `daily1/2/3/7`; trả về `pace`, `base_ms`, `inc_ms`, `daily_move_ms`, `pool`.
- `rating_pool()` = `chess960` cho Chess960, còn lại lấy pool từ `tc_spec`.
- Move pipeline server-authoritative: `makeMove` → `applyIntent()` (canonical rules, đã xử lý quy ước nhập thành Chess960 `e1g1`) → `commit_move_internal` (khoá hàng, kiểm tra version/lượt đi, tự tính đồng hồ theo timestamp DB, tăng version) → `apply_rating_once` khi ván kết thúc.

**Biến thể**: chỉ `standard` và `chess960` có `onlineSupport=true` + `ratedSupport=true`. Các biến thể khác `false` → AI cũng chỉ bật cho 2 biến thể này.

**Điểm phải thay đổi (root cause)**
1. `changed_rows = 2` khiến ván human-vs-AI (chỉ 1 hàng chờ) không thể tạo được.
2. Không có khái niệm identity AI: `profiles`/`games` gắn `auth.users`, không có cờ `is_ai`.
3. Không có đường đi nước cờ phía server cho bên không có trình duyệt — AI sẽ đứng im.
4. Notification/Fair Play/leaderboard hiện coi mọi participant là người thật.

## 2. Kế hoạch triển khai theo 5 giai đoạn

Khối lượng công việc rất lớn (100 profile, RPC mới, job pipeline, admin UI, ~70 test). Tôi đề xuất chia thành 5 lần giao hàng để mỗi bước đều verify được, thay vì một lần đổi khổng lồ không kiểm chứng nổi.

### Giai đoạn A — Nền tảng dữ liệu (migration + roster)
- `profiles.is_ai boolean not null default false` (+ index partial).
- Bảng `ai_players` (khoá chính `profile_id`, `ai_key` unique, `base_target_rating`, `engine_level`, `personality_id`, `enabled`, `standard_enabled`, `chess960_enabled`, `max_concurrent_games`, `min_think_ms`, `max_think_ms`, `last_assigned_at`) + CHECK ràng buộc + GRANT (`authenticated` chỉ SELECT cột an toàn qua view, `service_role` ALL) + RLS.
- Bảng `ai_move_jobs` (`game_id`, `expected_version`, unique `(game_id, expected_version)`, `status`, `attempts`, `available_at`, `last_error`) — chỉ `service_role` ghi.
- `games.ai_game boolean default false`, `games.ai_profile_id uuid null references profiles(id)`, CHECK không cho cả hai bên là AI.
- System settings: `ranked_ai_enabled` (mặc định **false**), `ranked_ai_fallback_delay_ms` (3000), `ranked_ai_rollout_percent` (0).
- `src/config/aiRoster.ts`: đúng 100 entry (key `nine64_ai_001..100`, tên tổng hợp không trùng, target rating trải 700→3000+ theo phân bố đã nêu, personality, avatarSeed). Cấu hình sức mạnh nội bộ nằm ở `*.server.ts`, không bundle ra browser.
- Test roster: 100 entry, key/tên unique, rating/level/personality hợp lệ.

### Giai đoạn B — Seed identity + lựa chọn AI
- `scripts/seed-ai-roster.ts` (server-only, Supabase Admin API): tạo/khớp 100 identity theo `ai_key`, email tổng hợp, mật khẩu entropy cao **không log/không lưu**, `app_metadata.system_ai = true`, profile `is_ai=true`, seed `user_variant_ratings` theo base target. Idempotent.
- `src/lib/rankedAi/`: `types.ts`, `roster.server.ts`, `selection.server.ts` (điểm = |Δrating| + phạt lặp đối thủ + phạt tải + phạt vừa được chọn, tie-break xác định), `strength.server.ts` (`rankedAiConfigForRating` — ≥1320 dùng `UCI_LimitStrength`+`UCI_Elo`; <1320 dùng Skill Level + giới hạn depth/nodes/movetime; threads=1, hash 64–256, multiPv=1 — **không đụng profile Titan**).

### Giai đoạn C — Ghép cặp có AI fallback
- `create_online_match` v2: giữ nguyên toàn bộ đường human-first (vẫn yêu cầu 2 hàng chờ), chỉ khi không có human **và** đã chờ đủ `ranked_ai_fallback_delay_ms` **và** flag bật **và** user nằm trong rollout percent (hash userId) thì mới đặt chỗ AI atomically (advisory lock theo `profile_id`, đếm ván active theo index) và tạo ván với 1 hàng chờ.
- `declineMatch`: đối thủ AI thì abort ván, không requeue, không notification.
- Notification trigger: bỏ qua recipient `is_ai`. Fair Play: bỏ qua subject AI. Leaderboard/analytics: lọc `is_ai=false`.

### Giai đoạn D — AI turn pipeline (P0)
- `src/lib/rankedAi/turn.server.ts`: snapshot ván → xác minh đến lượt AI → gọi Cloud Engine với ngân sách đồng hồ thật (`wtime/btime/winc/binc`, hard cap) → decode (dùng lại codec Chess960 sẵn có) → validate bằng `applyIntent` → commit qua RPC server-only theo `expectedVersion` (exactly-once, worker thua race nhận `STALE_VERSION`).
- Human-like delay xác định theo seed `gameId+ply+aiKey`, bị chặn trên theo thời gian còn lại.
- Enqueue job ngay khi human đi xong + kick processor tức thì; recovery qua scheduler `/api/public/rankedai/tick` và qua snapshot request của client.
- Lỗi hạ tầng (timeout/pool busy/illegal lặp lại): retry có giới hạn, sau đó abort ván với `end_reason = ai_engine_unavailable`, `rated=false`, **không đổi rating**.

### Giai đoạn E — UI, Admin, test
- Badge `AI` ở `MatchFoundDialog`, `PlayerCard`, lịch sử ván, `ResultModal` (tooltip “Đối thủ do Nine64 vận hành”). Browser chỉ biết `isAi=true`, không thấy engine level.
- `/admin/ai-players`: dashboard + bảng 100 AI + bật/tắt, đổi base target/personality/max concurrent (validate server-side, ghi audit log), nút “Đồng bộ 100 người chơi AI” và “Kiểm tra AI Network”.
- Test unit/integration theo các mục 59–65, mock engine cho test đồng thời 100 human, E2E `online-ai-fallback.spec.ts`.

## 3. Ràng buộc giữ nguyên
- Không sửa/bypass logic publish & qualification của Titan.
- Human-vs-human không được chậm đi hay đổi hành vi khi `ranked_ai_enabled=false`.
- Không lộ service role key, PLAY_ENGINE_*, mật khẩu AI ra client. Seed chạy server-only.
- Migration chỉ additive; không đổi rating hay ván lịch sử.

## 4. Câu hỏi trước khi bắt đầu
Tôi sẽ bắt đầu ở **Giai đoạn A** ngay khi bạn duyệt. Nếu bạn muốn thứ tự khác (ví dụ làm A+B+C trước rồi mới D, hoặc gộp) hãy nói trong phần phản hồi.
