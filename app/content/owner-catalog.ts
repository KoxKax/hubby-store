import type { DemoProduct, StorefrontContent } from "./types";

// Owner-supplied terms, not independently verified manufacturer entitlements.
// Missing prices stay unset; old orders and inventory IDs are never rewritten.
const plan = (id: string, label: string) => ({
  id,
  label,
  priceVnd: 0,
  stock: 0,
  priceConfigured: false,
});
export const ownerProducts: DemoProduct[] = [
  {
    id: "canva",
    slug: "canva",
    name: "Canva Edu",
    category: "ai",
    monogram: "Canva",
    art: "canva",
    tagline: "3 năm · Bảo hành 1 năm",
    description:
      "Gói Canva Edu 3 năm, nâng trên tài khoản của bạn. Cung cấp email muốn tham gia; link mời sẽ được gửi đến email đó. Gói có bảo hành trong 1 năm.",
    features: [
      "Sử dụng tài khoản của bạn",
      "Nhận lời mời qua email",
      "Thời hạn 3 năm, bảo hành 1 năm",
    ],
    variants: [plan("canva-36", "3 năm")],
    deliveryLabel: "Link mời qua email",
    activationRequired: true,
    terms: {
      warranty: "1 năm",
      receipt: "Link mời tham gia được gửi đến email bạn cung cấp.",
      activationNote:
        "Gói thuộc chương trình Canva Education và áp dụng điều kiện tham gia của chương trình. Bạn chỉ cần cung cấp email nhận lời mời, không cần gửi mật khẩu hoặc mã xác thực.",
    },
  },
  {
    id: "office",
    slug: "microsoft-office-365",
    name: "Microsoft Office 365",
    category: "work",
    monogram: "Office",
    art: "capcut",
    tagline: "1 năm · Bảo hành trọn thời hạn",
    description:
      "Gói Microsoft Office 365 thời hạn 1 năm, nâng trên tài khoản của bạn. Bảo hành trong toàn bộ thời hạn gói. Hubby hướng dẫn các bước nâng cấp theo đơn hàng.",
    features: [
      "Nâng tài khoản chính chủ",
      "Thời hạn 1 năm",
      "Bảo hành toàn bộ thời hạn gói",
    ],
    variants: [plan("office-12", "1 năm")],
    deliveryLabel: "Nâng tài khoản chính chủ",
    activationRequired: true,
    terms: {
      warranty: "Trọn 1 năm",
      receipt: "Hướng dẫn nâng cấp trên tài khoản của bạn theo đơn hàng.",
      activationNote:
        "Làm theo các bước hướng dẫn trong đơn hàng. Không gửi mật khẩu cá nhân hoặc mã xác thực qua tin nhắn hỗ trợ.",
    },
  },
  {
    id: "capcut",
    slug: "capcut",
    name: "CapCut Pro",
    category: "ai",
    monogram: "CapCut",
    art: "capcut",
    tagline: "1 hoặc 6 tháng · Cấp tài khoản",
    description:
      "CapCut Pro với hai lựa chọn 1 tháng và 6 tháng. Hubby cấp tài khoản để bạn sử dụng; không nâng trên tài khoản cá nhân của bạn. Chọn thời hạn phù hợp và xem hướng dẫn đăng nhập khi nhận hàng.",
    features: [
      "Hai lựa chọn: 1 tháng và 6 tháng",
      "Được cấp tài khoản",
      "Hướng dẫn sử dụng theo đơn",
    ],
    variants: [plan("capcut-1", "1 tháng"), plan("capcut-6", "6 tháng")],
    deliveryLabel: "Cấp tài khoản",
    activationRequired: false,
    terms: {
      warranty: "",
      receipt: "Xem thông tin đăng nhập trong phần nhận sản phẩm của đơn hàng.",
      activationNote:
        "Kiểm tra điều kiện thiết bị, đăng nhập và bảo hành trước khi mua.",
    },
  },
  {
    id: "netflix",
    slug: "netflix",
    name: "Netflix",
    category: "entertainment",
    monogram: "NETFLIX",
    art: "netflix",
    tagline: "1 tháng · Cấp tài khoản",
    description:
      "Gói Netflix thời hạn 1 tháng, được cấp tài khoản để sử dụng. Xem điều kiện thiết bị và hướng dẫn đăng nhập của gói trước khi đặt hàng.",
    features: [
      "Thời hạn 1 tháng",
      "Được cấp tài khoản",
      "Hướng dẫn đăng nhập theo đơn",
    ],
    variants: [plan("netflix-1", "1 tháng")],
    deliveryLabel: "Cấp tài khoản",
    activationRequired: false,
    terms: {
      warranty: "",
      receipt: "Xem thông tin đăng nhập trong phần nhận sản phẩm của đơn hàng.",
      activationNote:
        "Mở đơn hàng để xem hướng dẫn đăng nhập và sử dụng đúng loại tài khoản được giao.",
    },
  },
  {
    id: "duolingo",
    slug: "duolingo",
    name: "Duolingo",
    category: "learning",
    monogram: "Duolingo",
    art: "canva",
    tagline: "1 năm · Link kích hoạt",
    description:
      "Gói Duolingo 1 năm, nâng trên tài khoản của bạn bằng link kích hoạt. Nhận link và thực hiện các bước theo hướng dẫn trong đơn hàng.",
    features: [
      "Thời hạn 1 năm",
      "Dùng tài khoản của bạn",
      "Nhận link kích hoạt",
    ],
    variants: [plan("duolingo-12", "1 năm")],
    deliveryLabel: "Link kích hoạt",
    activationRequired: true,
    terms: {
      warranty: "",
      receipt: "Nhận link kích hoạt và hướng dẫn theo đơn hàng.",
      activationNote:
        "Đăng nhập đúng tài khoản muốn nâng trước khi kích hoạt. Không cần gửi mật khẩu.",
    },
  },
  {
    id: "google",
    slug: "google",
    name: "Google AI Pro",
    category: "work",
    monogram: "Google",
    art: "google",
    tagline: "18 tháng · Không bảo hành",
    description:
      "Gói Google AI Pro 18 tháng, nâng trên tài khoản của bạn qua link kích hoạt. Gói không có bảo hành; hãy đọc kỹ điều kiện kích hoạt và sử dụng trước khi đặt hàng.",
    features: [
      "Thời hạn 18 tháng",
      "Nâng tài khoản chính chủ qua link",
      "Không bảo hành",
    ],
    variants: [plan("google-ai-18", "18 tháng")],
    deliveryLabel: "Link kích hoạt",
    activationRequired: true,
    terms: {
      warranty: "Không bảo hành",
      receipt: "Nhận link kích hoạt và hướng dẫn theo đơn hàng.",
      activationNote:
        "Kiểm tra tài khoản có đủ điều kiện kích hoạt trước khi mua. Gói không có bảo hành.",
    },
  },
];

export function applyOwnerCatalog(
  current: StorefrontContent,
): StorefrontContent {
  const next = structuredClone(current);
  next.products = [
    ...structuredClone(ownerProducts).map((p) => {
      const old = current.products.find((x) => x.id === p.id);
      if (old?.media) p.media = old.media;
      return p;
    }),
    ...next.products.filter((p) => !ownerProducts.some((x) => x.id === p.id)),
  ];
  if (!next.categories.some((c) => c.id === "learning"))
    next.categories.push({
      id: "learning",
      name: "Học tập",
      description: "Công cụ học ngoại ngữ",
      icon: "layers",
    });
  next.sections
    .filter((s) => s.kind === "featured")
    .forEach((s) => {
      s.productIds = next.products.map((p) => p.id);
    });
  return next;
}
