begin;
-- Existing descriptions are Owner-editable. Fill only missing rows.
insert into private.bite_catalog_copy(external_id,description_vi,review_status)
values (
  '851',
  'Mã kích hoạt NordVPN 3 tháng qua liên kết từ nhà cung cấp. Người nhận mở liên kết, nhập email, xác nhận OTP và thiết lập mật khẩu để kích hoạt. Theo hướng dẫn nguồn, có thể bỏ qua bước thêm thẻ thanh toán. Nhà cung cấp ghi bảo hành liên kết 3 ngày; cần kiểm tra điều kiện tài khoản và thời hạn trước khi bán.',
  'verify'
)
on conflict (external_id) do nothing;
commit;
