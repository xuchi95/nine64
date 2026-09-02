# Vá deployment contract Nine64 ↔ play-engine

## Kết quả audit hiện tại
- Contract đang fail-closed đúng hướng, nhưng `EngineContract.ok` đang gộp khả năng tương thích deployment với trạng thái sẵn sàng của engine; vì vậy `status=starting` có thể bị Admin hiểu nhầm là image cũ.
- `/health` của source mới đã trả suite/capabilities/build kể cả lúc starting, nhưng backend HTTP client loại toàn bộ payload khi Cloud Run trả 503 nên mất metadata cần để phân biệt warmup với stale deployment.
- Version suite và build fallback còn nằm trong `capabilities.js`; Dockerfile chưa inject build ID. Chưa có Cloud Build, deploy script hoặc verify script chuẩn hóa Artifact Registry.
- Admin tự suy stale từ hai field, hiển thị lệnh `gcr.io` hardcode, và nút kiểm tra kết nối chỉ trả trạng thái health thay vì contract/resource-fit đầy đủ.
- Qualification có preflight uncached và fail-closed; phần này sẽ được giữ nguyên, chỉ yêu cầu cả deployment-compatible và engine-ready.

## Thay đổi sẽ thực hiện

### 1. Canonical version và image identity
- Tạo `services/play-engine/src/version.js` chứa `BENCHMARK_SUITE_VERSION` và `SERVICE_VERSION`; mọi payload service dùng các hằng này.
- Giữ expected suite độc lập ở backend và thêm test repository-sync để phát hiện lệch version trong CI mà không import service code vào browser bundle.
- Dockerfile nhận `ARG SERVICE_BUILD_ID`, validate/sanitize ở runtime theo whitelist hiện tại, và đặt default versioned.

### 2. Health/contract tách deployment và readiness
- Giữ `/health` HTTP 503 khi warmup nhưng luôn trả suite, build ID, capabilities, pool và safe stats.
- Cho backend parse payload JSON an toàn cả với phản hồi 503 `/health`; không áp dụng hành vi này cho endpoint khác.
- Mở rộng `CloudEngineHealth` để giữ trạng thái `starting`, và `EngineContract` với `deploymentCompatible`, `engineReady` cùng mã lỗi chính xác.
- Thứ tự fail-closed: cấu hình/auth → capabilities → suite → build ID → Stockfish 18/resource-fit → readiness/pool. Missing capabilities, suite mismatch và invalid/missing build ID đều chặn qualification.
- Warmup đúng contract: deployment PASS, engine WAIT; không gắn nhãn stale. Qualification vẫn dừng vì `engineReady=false`.

### 3. Admin diagnostics và refresh thật
- `getEngineOverview` dùng cache bình thường; “Làm mới”/“Kiểm tra kết nối” gọi probe uncached rồi cập nhật đầy đủ contract.
- Hiển thị riêng Backend expects, Engine reports, Service build, Capabilities, Deployment, Engine warmup, CPU/RAM/pool, resource fit và qualification allowed.
- Phân biệt `ENGINE_CAPABILITIES_UNAVAILABLE`, `ENGINE_BENCHMARK_SUITE_MISMATCH`, `SERVICE_BUILD_OUTDATED`/build missing và engine warmup trong VI/EN.
- Chỉ stale banner khi `deploymentCompatible=false`; thay command chính bằng `./scripts/deploy-play-engine.sh`, lệnh thủ công đặt trong vùng mở rộng. Không có nút chạy gcloud hay credential phía client.

### 4. Quy trình Artifact Registry chính thức
- Tạo `services/play-engine/cloudbuild.yaml` để build với `SERVICE_BUILD_ID=play-engine-titan-v6.3-<shortsha>` và push image `asia-southeast1-docker.pkg.dev/chess-nine64/nine64/play-engine:titan-v6-3`.
- Tạo `scripts/deploy-play-engine.sh`: kiểm tra công cụ/project/repository, build, deploy private OIDC với 8 CPU/16 GiB/concurrency 1/pool 1, giữ max instances từ cấu hình hiện hữu hoặc biến môi trường bắt buộc/default đã được tài liệu hóa, chờ revision ready rồi verify.
- Tạo `scripts/verify-play-engine.sh`: nhận `PLAY_ENGINE_URL`, lấy identity token theo audience khi cần, parse bằng Node, kiểm tra exact suite/build/Stockfish/pool/capabilities/resource-fit và in `DEPLOYMENT CONTRACT FAILED` khi sai.
- Không bật unauthenticated, không chứa private key; chỉ dùng danh tính gcloud tại máy triển khai.
- Cập nhật README với auth, tạo Artifact Registry, deploy, verify, revision/digest/rollback và Docker smoke test.

### 5. Tests và nghiệm thu repository
- Backend fixtures: old image thiếu metadata, suite v6-2, current image, starting-current image, missing/invalid build, resource mismatch, cache bypass.
- Engine tests: canonical versions, build-ID whitelist, health current/starting luôn đủ contract.
- Thêm script/test Docker smoke có thể chạy khi Docker + AVX2 khả dụng; nếu môi trường hiện tại thiếu Docker thì báo rõ là chưa chạy, không giả pass.
- Chạy engine tests, contract/qualification tests, typecheck, build và lint phạm vi file đã sửa; kiểm tra build log mới nhất.
- Không deploy Cloud Run từ browser/Admin. Nếu sandbox không có quyền/công cụ gcloud, kết luận chỉ là repository patched và cung cấp lệnh copy nguyên; không tuyên bố production đã được sửa.

## Không thay đổi
- Không nới suite/capabilities/resource gate, không sửa benchmark cũ, không fake readiness/build/capabilities.
- Không đổi OIDC/private service model, Titan engine strength, Levels 1–15, rating hay benchmark scoring.
