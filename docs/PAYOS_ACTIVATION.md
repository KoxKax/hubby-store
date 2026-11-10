# Bật payOS thật — 01/11/2026

**Cập nhật 02/11:** Owner yêu cầu bật bản chính thức để tự kiểm tra. Worker đã deploy và bật payOS/Bite; migration nguồn đã áp. Còn thiếu khóa/mapping Bite và xác nhận webhook. Xem hướng dẫn hiện hành **docs/BITE_PAYOS_LIVE.md**; các câu “chưa bật/chưa deploy/giữ mock” dưới đây đã được thay thế.

Database Hubby đã áp 10 migration payOS/guest/đối soát. Không chạy kiểm thử theo yêu cầu. Chưa bật thu tiền. Giữ APP_ENV=staging và SUPABASE_ENVIRONMENT=staging vì đây là tên môi trường project hiện hữu; PAYMENTS_MODE=payos mới là cờ gọi provider thật.

## Nhập khóa riêng
Cloudflare Dashboard → Workers & Pages → hubby → Settings → Variables and Secrets → Add → Secret. Nhập từng giá trị và lưu; không dán vào chat:
- PAYOS_CLIENT_ID: Client ID của kênh payOS.
- PAYOS_API_KEY: API key mới đã xoay.
- PAYOS_CHECKSUM_KEY: checksum key mới đã xoay.
- SUPABASE_SECRET_KEY: key sb_secret_ của đúng project hubby-staging (toienefhdorkcexyfnst), lấy tại Supabase Dashboard → Settings → API Keys. Không dùng publishable key.
- INVENTORY_ENCRYPTION_KEY_V1: chuỗi ngẫu nhiên 64 ký tự hex (32 byte). Tạo riêng trong trình quản lý mật khẩu hoặc PowerShell: [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant(). Lưu bản phục hồi riêng; không thay khóa sau khi nhập kho nếu chưa có quy trình chuyển mã hóa.

Sau khi lưu secrets, đăng nhập Owner → /admin/kho nhập hàng thật đúng gói. Giá phải đã được lưu/publish trong CMS. Số lượng demo_stock không phải kho bán được.

## Triển khai và kích hoạt
Từ thư mục dự án chạy npm run hosting:build để tạo artifact (build không chạy test), rồi npx wrangler deploy --config .wrangler/hosted-build/server/wrangler.json --keep-vars. Chưa chạy hai lệnh này trong phiên chuẩn bị.

Cron đã được chuẩn bị mỗi 5 phút: tối đa 3 đơn giao lại/lượt, chỉ thu hồi giữ kho chưa từng gọi provider. Cron tự tắt khi PAYMENTS_MODE=mock. Lần deploy artifact mới sẽ cài cron.

Sau khi kho và secrets đầy đủ, đặt hai biến Worker: PAYMENTS_MODE=payos và PAYOS_CHECKOUT_READY=true. Giữ các biến Supabase/domain hiện có. Không cần bật GUEST_CLAIM_READY để nhận hàng với cookie guest gốc.

Đăng ký webhook https://hubby.dpdns.org/webhooks/payos trên payOS. Nếu payOS từ chối xác nhận endpoint, trả PAYMENTS_MODE=mock và xử lý lỗi trước khi nhận đơn; không bỏ kiểm tra chữ ký. Trang trở về không chứng minh đã trả tiền.

Theo dõi /admin/thanh-toan để xử lý tiền đến trễ, link chưa rõ hoặc giao hàng hết lượt. Resolve chỉ đóng hồ sơ đối soát, không tự hoàn tiền hay xác nhận đơn. Hoàn tiền thực hiện tại provider/ngân hàng và đối chiếu thủ công; chưa có API hoàn tiền tự động.

Tắt nhận đơn: PAYMENTS_MODE=mock. Khi đã có đơn trả tiền đang chờ giao, xử lý hết hoặc tạm bật lại có giám sát vì mock cũng dừng scheduler giao hàng. Không xóa kho, receipts hoặc khóa mã hóa.

Chưa xác minh giao dịch provider thật, concurrency, khôi phục backup hoặc chất lượng triển khai trong phiên này. Không coi việc áp schema thành nghiệm thu toàn bộ hệ thống.
