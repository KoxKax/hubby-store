import type { DemoProduct, StorefrontContent } from "./types";

// Deployment-owned artwork is a render fallback, never a CMS reseed.
// Uploaded Owner media always wins. No prices or stock are changed here.
export const shopBanners = [
  {
    id: "hubby-welcome",
    title: "Hubby — Tài khoản & dịch vụ số",
    description: "Khám phá Hubby",
    theme: "peach" as const,
    href: "/#san-pham",
    media: {
      src: "/visuals/gpt-image-20261106/banner-1-1200.webp",
      alt: "Hubby — Tài khoản và dịch vụ số cho học tập, làm việc và giải trí.",
    },
  },
  {
    id: "hubby-canva-education",
    title: "Canva Education 3 năm",
    description: "49.000đ · Bảo hành 1 năm",
    theme: "lavender" as const,
    href: "/san-pham/canva",
    media: {
      src: "/visuals/gpt-image-20261106/banner-2-1200.webp",
      alt: "Canva Education 3 năm, giá 49.000đ, bảo hành 1 năm. Xem gói Canva.",
    },
  },
  {
    id: "hubby-order-support",
    title: "Cần hỗ trợ? Liên hệ Hubby",
    description: "Tra đơn và gửi yêu cầu hỗ trợ",
    theme: "mint" as const,
    href: "/tra-don-hang",
    media: {
      src: "/visuals/gpt-image-20261106/banner-3-1200.webp",
      alt: "Cần hỗ trợ? Liên hệ Hubby. Tra đơn và gửi yêu cầu hỗ trợ.",
    },
  },
];

const brandImages: Record<string, { name: string; src: string }> = {
  canva: { name: "Canva Edu", src: "/visuals/products/canva-320.webp" },
  office: {
    name: "Microsoft Office 365",
    src: "/visuals/products/office-320.webp",
  },
  capcut: { name: "CapCut Pro", src: "/visuals/products/capcut-320.webp" },
  netflix: { name: "Netflix", src: "/visuals/products/netflix-320.webp" },
  duolingo: { name: "Duolingo", src: "/visuals/products/duolingo-320.webp" },
  google: { name: "Google AI Pro", src: "/visuals/products/google-320.webp" },
};
export function brandImage(product: DemoProduct) {
  const image = brandImages[product.id];
  return image?.name === product.name ? image.src : undefined;
}

export function fallbackBanners(content: StorefrontContent) {
  // Do not show stock-specific campaigns or tie generic banners to fixtures.
  if (!content.products.length || content.experience?.slides.length === 0)
    return [];
  return shopBanners;
}
