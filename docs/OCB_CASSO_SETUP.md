# OCB cá nhân / VA + Casso Flow — 22/10/2026

## Trạng thái thật

Owner yêu cầu triển khai OCB/Casso và xác nhận chưa có hai tài khoản. Đây là phần chuẩn bị tích hợp, KHÔNG phải thông báo đã hoàn tất thanh toán. Web vẫn đóng checkout. Không tài khoản ngân hàng, đồng ý liên kết, OTP, API key, secret hoặc giao dịch thật nào được tạo/đọc/gửi. TPBank/SePay cũ không bị sửa hay ngắt kết nối.

Đã có mã xác minh Casso Webhook V2 và đối chiếu đơn, cùng hợp đồng repository nguyên tử. Chưa có implementation repository thanh toán bền vững; không dùng mock hoặc interface làm chứng cứ đã quyết toán. URL dự kiến `https://hubby.dpdns.org/webhooks/casso` chỉ là endpoint đóng: GET405, POST503/success=false. **Chưa đăng ký URL này trong Casso**, chưa bấm Gọi thử/Lưu tích hợp và không chuyển tiền thử.

## Giá và nguồn kiểm chứng

- [Bảng giá Flow](https://casso.vn/flow/bang-gia/) dẫn tới [bảng giá nhúng chính thức](https://api.flow.casso.vn/new-pricing-table). Bản trả về22/10 ghi Sponsor OCB miễn phí/được nhận nhiều lần,1 tài khoản NH & VA,2 tích hợp ứng dụng; chưa trích xuất được quota giao dịch/thời hạn của lựa chọn tương ứng. Không suy ra không giới hạn, miễn phí vĩnh viễn hoặc ngân hàng không thu phí.
- Trang Flow chung ghi dùng thử14 ngày/100 giao dịch; đây không phải quota Sponsor OCB đã xác minh trong tài khoản Owner. Không mua Pioneer/Standard theo mặc định.
- [OCB VA cá nhân](https://docs.casso.vn/huong-dan/huong-dan-ket-noi-dich-vu-stk-ao-virtual-account-cua-ocb-ca-nhan) hướng dẫn tạo VA tiền tố CASS và Owner xác thực ngân hàng/OTP. Cần xác minh actual VA và tài khoản chính sau liên kết, không dùng số tự nghĩ hoặc tài khoản TPBank thay thế.
- [OCB API qua Casso](https://casso.vn/api-ocb/) xác định OCB BIN970448 và phân biệt VietQR tạo thông tin chuyển khoản với Casso nhận sao kê. Không cần xin API chuyển tiền trực tiếp từ OCB để nhận webhook; không xây rút tiền/chi hộ.
- [Webhook V2](https://developer.casso.vn/webhook/thiet-lap-webhook-thu-cong) và [mã ký chính thức](https://github.com/CassoHQ/casso-webhook-v2-verify-signature/blob/main/javascript.js): JSON envelope error/data, header X-Casso-Signature, t millisecond + v1 hex HMAC-SHA512 trên JSON sắp key đệ quy. Không dùng HMAC SePay hoặc secure-token V1 như thể là V2.

## Luồng mục tiêu và ranh giới đã làm

1. Server tạo đơn từ giá/điều kiện đã xuất bản, khóa/giữ kho bằng một transaction; tạo mã HB +16 ký tự hex, hạn15 phút và payment intent bound OCB/account/VA/VND/environment. Khách nhập email kích hoạt không cần đưa mật khẩu cá nhân.
2. Trang thanh toán hiển thị đúng VA OCB, chủ tài khoản đã xác minh, số tiền/nội dung và QR theo intent của server. Không sinh QR thật khi chưa có account/VA Owner và quy trình mở bán; QR không phải bằng chứng đã trả. Chưa triển khai UI/QR thật ở batch này.
3. Webhook V2 xác minh chữ ký toàn envelope, giới hạn body16KiB, id dương/số tiền nguyên/calendar hợp lệ, OCB/account/VA chính xác. Loại dữ liệu counter-account và số dư khỏi normalized receipt. Currency/environment do endpoint cấu hình tin cậy sau kiểm tài khoản, payload không chứng minh test/live hoặc VND.
4. Trong **một DB transaction**: unique(provider,environment,transaction id), so fingerprint nếu replay; unique bank reference/account theo contract thực tế; khóa đơn/reservation; đúng reference/amount/state/time mới ghi settlement; insert đúng một outbox job chỉ chứa order ID. Bất kỳ lỗi nào rollback cả receipt/settlement/job. Đây còn là việc Codex phải làm, KHÔNG được thay bằng chuỗi REST độc lập.
5. Sai/thiếu/thừa tiền, thiếu/nhập hai mã đơn, thanh toán trễ, sai môi trường, hết reservation phải đối soát; không tự cộng dồn hay giao hàng. Tiền ra/0 không trả đơn. Đúng giao dịch cũ trả trạng thái đã lưu, không tăng paid hoặc giao lại.
6. Chỉ200/success=true sau commit receipt/decision bền vững. Mã service kiểm điều kiện này, nhưng endpoint hiện tại không gọi service/store và luôn503. Không ACK cho dễ lưu tích hợp. Mẫu Gọi thử/id0 không được giả làm tiền thật.
7. Worker xử lý outbox idempotent; giao lại dùng delivery cũ, thay thế có lineage. Canva mời email cần adapter/quy trình được Owner xác nhận; không tự sinh link mời. Đơn đã paid không tự động có nghĩa delivered. Không mua supplier lại khi kết quả chưa chắc chắn.

## Retry và kiểm thử

Casso công bố timeout5s, retry tối đa17 lần/24h và trạng thái PAUSED/HOLDING/DISABLE cần theo dõi. Verifier hiện chấp nhận signature tối đa25h, tương lai≤5 phút; id giao dịch vẫn phải dedupe lâu dài. Replay thủ công muộn hơn cần chữ ký mới/provider reconciliation được xác minh, không tắt kiểm thời gian. Chưa đo hosted CPU/5s SLA và chưa chứng minh DB concurrency/outbox/recovery.

Các test không gọi provider kiểm HMAC độc lập với node:crypto, tampering cả fields không lưu, V1/batch từ chối, sai key/tài khoản/VA/ngân hàng, timestamp/retry, body cap, invalid amount/date/id0, mã mơ hồ, thiếu/thừa tiền/test-live/expiry/reservation, không gọi repository trước xác minh và không ACK khi commit lỗi/non-durable. Mock commit test không phải chứng cứ persistence hoặc chống replay thật.

## Owner làm riêng

1. Tự mở OCB cá nhân chính chủ trên kênh chính thức, đọc biểu phí/điều kiện và tự hoàn tất KYC/OTP. Không gửi thông tin định danh, mật khẩu, OTP hay số tài khoản qua chat.
2. Tự đăng ký [Casso Flow](https://flow.casso.vn/login), xem đúng Sponsor OCB. Kiểm tra quota, thời hạn/điều kiện gia hạn và quyền custom Webhook V2; nếu yêu cầu trả phí thì dừng, không nâng gói.
3. Tự liên kết OCB VA theo tài liệu Casso, đọc và chấp nhận đúng quyền ngân hàng. Chỉ báo “đã liên kết OCB với Casso”; các giá trị cấu hình sẽ nhập riêng vào secret store khi receiver thật sẵn sàng.
4. Sau Codex hoàn tất DB/checkout/fulfillment và staging UAT: chọn chính xác một tài khoản/VA, Webhook V2, Strict mode, retry. Nhập secret trực tiếp, không gửi chat. Kết nối live và giao dịch thử thật là bước xác nhận riêng; Owner tự chuyển tiền nếu đồng ý.

## Codex làm riêng còn lại

- DB migration được review, kiểm local RLS/ACL/concurrency/idempotency/rollback/crash recovery; remote apply chỉ sau phê duyệt phạm vi rõ ràng, không ghi unreviewed schema/data.
- Checkout server-authoritative, payment intent/QR/trang theo dõi, guest order-proof và nguồn giao hàng thật. Không đổi giá chưa có, không bật coupon HUBBYxHUBER khi điều kiện chưa chốt.
- Bound secret/account/VA/server environment, không service-role ở browser, không log raw webhook/token/số dư và không chuyển giao dịch ra webhook.site/debug bên thứ ba.
- Store implementation + endpoint wiring, provider probe tách biệt tiền thật, staging replay/DB failure tests; phương án rotation key cũ/mới, webhook reconciliation, recovery/rollback trước bật tiền thật.
- Không cần API key Casso chỉ để xác minh push V2; nếu cần REST reconciliation sau này mới xin Owner tạo khóa quyền tối thiểu/nhập riêng.
