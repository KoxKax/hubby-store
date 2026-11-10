begin;
-- Repair only the exact unmodified editorial rows after comparing source details.
-- Never change prices, availability, Owner revisions or publish status.
with replacements(external_id, expected_copy, revised_copy) as (
 values
  ('286', 'Gói iLovePDF Premium thời hạn 1 năm, phục vụ chuyển đổi, chỉnh sửa và xử lý tài liệu PDF. Kiểm tra loại tài khoản và cách kích hoạt trước khi giao.', 'Tài khoản iLovePDF Premium thời hạn 1 năm, sử dụng các công cụ chỉnh sửa, chuyển đổi PDF và chữ ký điện tử. Bite giao email và mật khẩu của tài khoản đã tạo; người nhận đăng nhập rồi đổi mật khẩu theo hướng dẫn. Nguồn ghi kèm 2.000 tín dụng AI; cần kiểm tra quyền truy cập và thời hạn thực tế trước khi bán.'),
  ('631', 'Mã kích hoạt NordVPN Basic trong 3 tháng, nguồn ghi dùng tối đa 10 thiết bị và có thể cộng dồn mã. Cần kiểm tra quốc gia đủ điều kiện.', 'Mã kích hoạt NordVPN Basic 3 tháng, nguồn ghi dùng tối đa 10 thiết bị và có thể cộng dồn mã. Phải đổi mã trong 72 giờ từ lúc mua; Bite ghi bảo hành kích hoạt 72 giờ và bảo hành 1 tháng sau khi kích hoạt. Kiểm tra tài khoản và khu vực áp dụng trước khi bán.'),
  ('650', 'Mã kích hoạt gói Framer Basic trong 1 năm để xây dựng và xuất bản website. Kiểm tra tài khoản đủ điều kiện đổi mã.', 'Mã nâng cấp Framer Basic theo chu kỳ thanh toán năm, áp dụng cho dự án đang ở gói Free. Vào Settings → Plans → Subscribe Basic (Yearly), nhập mã ở mục Add Promotion Code theo hướng dẫn của nguồn. Kiểm tra mã, điều kiện tài khoản và thời hạn 1 năm trước khi giao.'),
  ('715', 'Tài khoản CapCut Pro Team 3 tháng, nguồn giới thiệu tối đa 2.000 tín dụng AI. Có giới hạn thiết bị đăng nhập và phương thức cấp tài khoản.', 'Tài khoản CapCut Pro Team thời hạn nguồn ghi 90 ngày, giao email và mật khẩu. Bite giới thiệu tối đa 2.000 tín dụng AI, khuyến nghị dùng 1–2 thiết bị và ghi bảo hành 90 ngày nhưng loại trừ lỗi do đăng nhập quá nhiều. Mô tả nguồn về tự gia hạn hàng tháng chưa rõ ràng; cần xác minh trước khi đăng bán.'),
  ('724', 'Gói iLovePDF Premium trong 1 năm, hỗ trợ xử lý PDF trên web, máy tính và điện thoại. Nguồn chỉ ghi bảo hành 24 giờ.', 'Tài khoản iLovePDF Premium 1 năm, hỗ trợ chỉnh sửa PDF trên web, máy tính, điện thoại và có 2.000 tín dụng AI theo Bite. Nguồn giao email, mật khẩu của tài khoản đã tạo và hướng dẫn đổi mật khẩu sau khi đăng nhập. Tên sản phẩm ghi bảo hành 24 giờ; cần xác nhận điều kiện bảo hành trước khi bán.'),
  ('763', 'Tài khoản CapCut Pro cá nhân 30 ngày, nguồn ghi tối đa 2.000 tín dụng AI và bảo hành trọn thời gian. Giao email và mật khẩu.', 'Tài khoản CapCut Pro cá nhân thời hạn 30 ngày; nguồn ghi tối đa 2.000 tín dụng AI, giao email và mật khẩu. Khuyến nghị đăng nhập trên 1–2 thiết bị, hạn chế đăng xuất/đăng nhập liên tục. Bite ghi bảo hành 30 ngày và giới hạn xử lý lỗi đăng nhập do dùng quá nhiều thiết bị; cần xác nhận điều kiện cụ thể.'),
  ('781', 'Tài khoản CapCut Pro cá nhân 1 tháng, khoảng 650 tín dụng, giới hạn 2 thiết bị. Nhà cung cấp giao email và mật khẩu.', 'Tài khoản CapCut Pro cá nhân dùng khoảng 29–30 ngày, kèm 650 tín dụng theo Bite. Giao thông tin đăng nhập tài khoản và email; giới hạn đăng nhập 2 thiết bị. Nguồn loại trừ bảo hành đối với lỗi giới hạn thiết bị hoặc cảnh báo bảo mật, cần nói rõ điều kiện này trước khi bán.'),
  ('829', 'Tài khoản HeyGen Creator 1 tháng, công cụ tạo video bằng AI và xuất Full HD 1080p. Nguồn công bố bảo hành 3 ngày.', 'Tài khoản HeyGen Creator thời hạn 1 tháng, dùng tạo video AI và xuất Full HD 1080p. Bite giao email và mật khẩu; không bảo hành vi phạm chính sách sử dụng. Thời hạn bảo hành chưa thống nhất: tên sản phẩm ghi 3 ngày, mô tả ghi 1 ngày. Cần hỏi lại Bite trước khi bán.')
)
update private.bite_catalog_copy c
set description_vi = r.revised_copy, updated_at = now()
from replacements r
where c.external_id = r.external_id
  and c.description_vi = r.expected_copy
  and c.updated_by is null
  and c.review_status = 'needs_review';
commit;
