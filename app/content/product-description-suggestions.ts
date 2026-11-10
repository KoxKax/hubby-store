import { productEditorialCopy } from "./product-editorial-copy";

/**
 * Editorial drafts using the Owner's existing offer terms, informed by the
 * differences observed in Bite's source descriptions on 02/11/2026.
 * They are NOT SKU bindings or claims about source eligibility.
 */
export const productDescriptionSuggestions: Record<
  string,
  { description: string; biteReference: string; caution: string }
> = {
  canva: {
    description:
      productEditorialCopy.canva,
    biteReference: "Bite #636 (Edu Method), #550 (Pro 3 Years Invite)",
    caution:
      "Bite #636 là phương thức Edu dạng file; #550 là Canva Pro mời thủ công. Chưa xác nhận SKU nào đúng gói Canva Edu 3 năm của Hubby.",
  },
  office: {
    description:
      productEditorialCopy.office,
    biteReference: "Bite #290 (Office 365 Plus 1 Year)",
    caution:
      "Bite #290 giao tài khoản đăng nhập có sẵn, không phải nâng trên tài khoản cá nhân. Không được suy ra số thiết bị hay quyền lợi từ SKU này.",
  },
  capcut: {
    description:
      productEditorialCopy.capcut,
    biteReference:
      "Bite #521, #781, #763 (CapCut 1 tháng); #715 (Team 3 tháng)",
    caution:
      "Nguồn có nhiều loại CapCut với giới hạn khác nhau; chưa xác minh SKU CapCut 6 tháng hoặc SKU khớp chính xác cả hai gói Hubby.",
  },
  netflix: {
    description:
      productEditorialCopy.netflix,
    biteReference: "Bite #837 (Premium 4K Private Profile 1M)",
    caution:
      "Bite #837 cấp hồ sơ riêng và có điều kiện thiết bị/đăng nhập đặc thù. Chưa chứng minh đó là hình thức giao Netflix hiện tại của Hubby.",
  },
  duolingo: {
    description:
      productEditorialCopy.duolingo,
    biteReference: "Bite #422 (Super Slot 3 Months)",
    caution:
      "Bite #422 là slot 3 tháng với cách kích hoạt khác, có yêu cầu thông tin đăng nhập. Không phù hợp với gói 1 năm nhận link của Hubby.",
  },
  google: {
    description:
      productEditorialCopy.google,
    biteReference:
      "Chưa tìm được SKU Google AI Pro tương ứng trong mẫu Bite đã rà soát",
    caution:
      "Không có dữ liệu nguồn tương ứng để xác nhận quyền lợi, khu vực hoặc điều kiện kích hoạt. Nội dung dựa trên gói Hubby đang công bố.",
  },
};
