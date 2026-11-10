# Hubby Suppliers 0.2.0 — nguồn API và thanh toán

## Đã có trong mã nguồn, chưa nghiệm thu hosting

- Mỗi đơn vị hàng có một job bền vững với unique(order,item,unit); mapping nguồn/mã hàng được chụp tại checkout. Hàng đợi không chứa credential.
- Sau chữ ký payOS hợp lệ và đối chiếu currency, số tiền, ngân hàng nhận, link, mã đơn, thời điểm, guard lưu một event riêng. Unique reference và unique accepted_order_id ngăn cùng receipt hoặc hai receipt tự được tính thành hai lần cấp cùng đơn. Signed mismatch/late/unknown thành review, không tự paid. Plugin payOS upstream tiếp tục sở hữu transition WooCommerce.
- Chỉ Woo order đã paid, chưa refund và khớp event đã lưu mới có thể enqueue/cấp hàng. Không lấy trạng thái từ redirect, screenshot, order note hoặc meta editable làm chứng cứ.
- Worker lấy một job mỗi pass. CAS queued → submitting được lưu trước POST. Không retry việc mua sau khi đã gửi; crash/timeout chuyển uncertain. Bản recovery chỉ tạo lại job bị thiếu từ receipt đã lưu; không mua lại job đã gửi.
- Response/API delivery mã hóa AES-256-GCM, nonce ngẫu nhiên 96-bit và AAD ràng buộc job + phiên bản. Không chứa plaintext trong email, order notes hoặc log.
- Customer nhận hàng qua POST với nonce, kiểm tra Origin, chủ đơn, payment evidence và toàn bộ delivery. Guest cần order key cùng browser cookie proof băm, hạn server 30 ngày. Hết cookie/đổi thiết bị chưa có khôi phục guest tự động.
- Trang nguồn hàng liệt kê 50 job gần nhất, retry chỉ cho blocked chưa có submitted_at. Uncertain không có nút mua lại. Administrator có thể POST mở phản hồi đã mã hóa trong trang text/plain no-store để đối soát; ghi audit note không chứa payload.

## Điều kiện đang khóa

Registry Bite purchase_ready=false. Local guard ngăn toàn bộ API/checkout/email. Chưa cài upstream payOS vào runtime và chưa cấu hình trên hosting mới. Chưa gửi POST mua Bite hoặc tạo thanh toán thật. Syntax parse không chứng minh transaction, signature interoperability hay idempotency thực tế.

Trang Bite công khai chưa có schema chi tiết success/error, order lookup/idempotency, refund/replacement, rate limits và max-cost/price-lock. Không khẳng định API không có; cần provider xác nhận. Giá vốn và số dư USD/points không được tự đổi sang giá bán VND hoặc tự quyết định mức chi.

## Cấu hình riêng trên hosting tương lai

Không gửi giá trị vào chat hoặc nhập trong sản phẩm/bài viết:

- HUBBY_BITE_API_KEY: khóa API nguồn, chỉ nhập khi adapter được review.
- HUBBY_DELIVERY_KEY_V1: 32 byte ngẫu nhiên dạng 64 hex; lưu bản phục hồi ngoài DB. Đây là khóa của hệ WordPress mới; không tự sao chép/đổi khóa đang dùng bởi Worker cũ.
- HUBBY_SUPPLIER_PURCHASES_ENABLED: mặc định thiếu/khác true thì worker không mua. Chỉ bật sau khi các nguồn/nguồn tiền/điều kiện mua và giao hàng được chốt; cờ này không bỏ qua purchase_ready=false.
- PAYOS_CHECKSUM_KEY: guard ưu tiên cấu hình máy chủ, hoặc đọc cấu hình gateway upstream. Không dùng khóa từng lộ.
- PAYOS_RECEIVING_ACCOUNT: tài khoản nhận đã xác minh; nếu thiếu guard đối chiếu gateway_info.account_number từ plugin upstream.
- HUBBY_PAYOS_ACCEPTANCE_SECONDS: cần chốt thời hạn nhận tiền cụ thể (60..86400 giây); chưa có thì receipt thật phải review, không tự tính đủ điều kiện.

Client ID/API Key payOS cấu hình theo gateway upstream trên đích mới; secret đã nhập ở Worker không tự có trên WordPress. Schema bridge dự kiến v2 gồm hubby_supplier_jobs và hubby_payment_events trong DB WordPress; không thay schema Supabase. Chưa xác nhận schema này trên MySQL/MariaDB production.

## Những phần chưa hoàn tất

Chi phí/hosting chưa được Owner chọn. Chưa có acceptance với payOS/Bite, chưa có cost-cap/price-lock cụ thể của nguồn, chưa có lookup adapter đã xác nhận, chưa có refund/replacement tự động, chưa có restore drill. Đã có hooks classic và Store API/Checkout Blocks để kiểm tra nguồn/số lượng, chụp mapping và gắn cookie guest trước payment; đối chiếu thứ tự hook từ mã WooCommerce 11.2.1 đã cài. Chưa nghiệm thu các luồng này trên runtime/gateway thật. Không bỏ qua các thiếu hụt này bằng cách bật cờ.
- **Cập nhật Owner 01/11/2026:** ngân sách 0đ; lỗi nguồn xử lý thủ công. Plugin 0.3.0/schema source v3 hỗ trợ giao thủ công sau đối soát, lưu quản trị viên/lý do/thời gian và mã hóa hàng. Không mua lại tác vụ có kết quả không rõ. `HUBBY_BITE_ENABLED=true` cùng cờ mua, API key, khóa mã hóa và môi trường ngoài local mới cho phép Bite. Các ghi chú cũ yêu cầu lookup hoặc purchase_ready luôn false không còn áp dụng; chưa kích hoạt trên hosting thật.

