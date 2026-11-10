# payOS + Bite trên web Hubby cũ — 02/11/2026

**Cập nhật 02/11/2026:** Đã mở tự đặt hàng qua API cho nguồn Bite `manual` và `automatic` bằng migration `bite_manual_order_binding` trên Supabase và Worker `21f15718-f853-4d04-80c5-e595ed145a64`. Nguồn `manual` thường trả đơn đang chờ; hệ thống tiếp tục lấy trạng thái từ Bite và chỉ giao nếu đã nhận được nội dung/tệp phù hợp. Nếu Bite yêu cầu thao tác riêng hoặc không cung cấp dữ liệu giao được qua API, Owner phải xử lý theo tình trạng đơn, không tự đặt lại. Bắt buộc đối chiếu đúng gói/quyền lợi/cách nhận trước khi bật liên kết. Không thực hiện giao dịch thử, kiểm thử hay thay dữ liệu CMS, đơn hàng, tồn kho trong lượt cập nhật này. Những số liệu, điều kiện chỉ nhận `automatic` và version phía dưới là lịch sử trước cập nhật.

Đã triển khai Worker phiên bản `2caa6110-1867-4f34-b5c9-166df982a686` trên cả hai domain ngày 02/11/2026. Các biến triển khai: `APP_ENV=staging`, `PAYMENTS_MODE=payos`, `PAYOS_CHECKOUT_READY=true`, `SUPPLIERS_MODE=bite`, `BITE_SCHEMA_READY=true`, `BITE_READY=true`, `BITE_TRACKING_READY=true`; cron `*/5 * * * *`. Cổng thanh toán thật được bật trên môi trường tên staging; **chưa nghiệm thu giao dịch tiền thật và cấp hàng đầu-cuối**.

## Trạng thái nguồn 02/11/2026

- `BITE_API_KEY` đã được Owner đặt riêng trong Cloudflare. Lần sync được ghi nhận lúc **2026-11-01 19:55:23 UTC**: **164 SKU hoạt động, 126 có hàng, 38 hết hàng**, giá nguồn USD. Đây là snapshot tại thời điểm đồng bộ, không bảo đảm tồn kho hiện tại.
- Lần đọc bảng `private.supplier_bindings`: **0 dòng, 0 liên kết bật**. Không tự đoán gói Hubby tương ứng với SKU Bite dựa trên tên.
- Trang `/admin/nguon-hang` có danh sách nguồn tìm kiếm/phân trang, giá/tồn/điều kiện liên kết, theo dõi tác vụ, đối soát và nút **Xem số dư nguồn** / **Xem tối đa 20 giao dịch gần đây**. Hai nút cuối chỉ đọc và lọc trường nhạy cảm; hình dạng phản hồi tài khoản thật chưa được xác thực bằng xem trực tiếp trên UI.
- Guard database đã áp: mapping bật chỉ nhận nguồn đang bán, còn hàng, giao **automatic**, giá USD hợp lệ, sync thành công trong 15 phút; đặt đơn chụp giá/tồn nguồn và ngăn mua khi nguồn đổi giá/đồng tiền. Nhà cung cấp không cấp price-lock: chưa có cơ chế bảo đảm tỷ giá/lợi nhuận hoặc khống chế giá vốn tại API.
- `npx tsc --noEmit` **exit 0**; `npm run hosting:build` **exit 0** (304 client/357 SSR); `wrangler deploy --keep-vars` **exit 0**, xác nhận hai domain và cron. **Không chạy test suite, HTTP smoke, thanh toán hay đơn mua Bite thật** theo yêu cầu Owner.

## Những việc cần nhập riêng

1. **Đã hoàn tất nhập khóa** `BITE_API_KEY` vào secret của Cloudflare Worker. Chỉ cần thay khi xoay/thu hồi khóa; không gửi khóa vào chat hay nhập vào CMS. Các khóa payOS/Supabase/mã hóa giữ trong secret riêng.
2. Đăng nhập Owner tại https://hubby.dpdns.org/admin. Mở https://hubby.dpdns.org/admin/nguon-hang (hoặc Kho hàng → Quản lý nguồn API). Mở gói muốn bán, nhập **mã sản phẩm Bite** của đúng loại/thời hạn. Đây không phải SKU tự đặt của Hubby. Kiểm tra giá vốn tại nguồn, tick cho phép cấp qua Bite và xác nhận rồi lưu. Mỗi gói lưu riêng. Không tự đồng bộ hay thay giá bán CMS. Gói chưa niêm yết giá vẫn chưa nhận đơn; chỉnh và publish giá bằng CMS hiện có nếu muốn bán.
3. Vào https://hubby.dpdns.org/admin/thanh-toan → **Đăng ký webhook payOS**. Nút dùng khóa riêng của Worker để đăng ký `https://hubby.dpdns.org/webhooks/payos`; không tạo đơn hay trừ tiền. Chỉ coi provider đã xác nhận khi trang báo thành công. Nếu lỗi, kiểm tra đúng kênh/khóa ở payOS; không bỏ kiểm tra chữ ký. Có thể đăng ký URL này trực tiếp trong dashboard payOS.

Hiện đã có khóa Bite và catalog nguồn, nhưng **chưa có mapping bật hoặc kho thật** theo lần đọc gần nhất. Không tự đoán mã nguồn, đặt giá, nạp tiền hay tạo đơn thay Owner. Bật cờ không đồng nghĩa mọi gói đã có thể mua. Checkout kho nội bộ vẫn cần hàng đã nhập; checkout Bite cần mapping đủ điều kiện. Backend từ chối trước khi tạo link thu tiền khi nguồn của gói chưa sẵn sàng.

## Luồng hoạt động

- Backend lấy giá từ CMS đã publish, snapshot mapping Bite vào từng đơn và tạo ý định cấp hàng trong cùng giao dịch Postgres. Ý định nguồn không được giả làm tồn kho thật.
- payOS tạo link; chỉ receipt được xác minh chữ ký, tài khoản, số tiền, mã đơn, link và thời hạn mới đánh dấu đã trả tiền. Return URL không xác nhận tiền.
- Sau webhook hợp lệ, Worker thử cấp một đơn vị qua Bite rồi giao kho sẵn sàng. Cron mỗi 5 phút tiếp tục xử lý hàng đợi và khôi phục giao hàng. Đơn nhiều đơn vị có thể cần nhiều lượt; chưa có cam kết giao tức thì.
- Lưu `submitting` trước POST `/v1/orders` với `{productId,quantity:1}`. Không gửi email/mật khẩu khách tới nguồn. Một tác vụ không bị gọi mua lần hai khi timeout/mất phản hồi/lưu DB thất bại.
- Adapter tự nhận nội dung khi HTTP 200/201 có `deliveredKeys` ở gốc JSON, đúng một chuỗi, tối đa 6000 byte UTF-8. Định dạng khác được giữ để đối soát, không tự suy đoán là đã giao. Chưa gọi API Bite thật để xác nhận hình dạng phản hồi của tài khoản này.
- Hàng nhận được mã hóa AES-GCM bằng khóa kho hiện có, gắn ID hàng/gói/phiên bản khóa, rồi đi qua luồng nhận hàng riêng của khách. Không chèn HTML hoặc đưa mật khẩu vào loader/email/log.

## Khi nguồn gặp lỗi

Trong mục Nguồn API, mở đơn **Cần đối soát**, mở phản hồi riêng (bản xem trước mã hóa có giới hạn), kiểm tra giao dịch với Bite. Sau khi xác nhận hàng chưa giao, nhập nội dung cấp cho khách và lý do. DB kiểm tra lại quyền Owner, receipt, trạng thái đơn và cuộc đua với worker; lưu hàng và người xử lý/lý do/thời gian trong một giao dịch. Không nhập lại tác vụ đã có hàng; không bấm mua lại ở nguồn khi chưa rõ giao dịch trước.

Khách dùng ticket/hỗ trợ hiện có để liên hệ Owner. Hoàn tiền, bảo hành, thay hàng đã giao và nạp ví Bite vẫn do Owner xử lý; chưa có API hoàn/đổi tự động. Chưa tạo giá vốn/price-lock hoặc cam kết tồn từ thông tin không có trong docs.

Tắt nguồn mới: `BITE_READY=false`; tắt gói ở mapping để ngừng đơn mới cho gói đó. Mapping mới không thay nghĩa vụ của đơn đã đặt. `PAYOS_CHECKOUT_READY=false` ngừng checkout và webhook/giao định kỳ theo gate hiện có, nên khi còn tiền đang chuyển/đơn trả tiền chờ giao cần đối soát có giám sát; không xóa ledger, hàng hoặc khóa.

## Bằng chứng và giới hạn

Migration `20261101180959_bite_supplier_fulfillment.sql` đã áp vào project Hubby hiện hữu. Metadata xác nhận ba bảng nguồn RLS, anon không gọi được claim mua, service role có quyền; số orders/payments/stock/bindings/jobs đều 0 tại thời điểm ghi nhận. Không thay CMS/nháp/giá/domain/danh tính. Đã kiểm tra TypeScript và dựng artifact, không chạy test suite/E2E/smoke, không đăng nhập thay Owner, không tạo link/trả tiền/mua hàng để kiểm thử. Chưa đăng ký webhook thành công hoặc kiểm chứng giao dịch thật trong phiên triển khai.
