export interface DemoVariant {
  id: string;
  label: string;
  priceVnd: number;
  stock: number;
  priceConfigured?: boolean;
}

export interface DemoProduct {
  id: string;
  slug: string;
  name: string;
  category: string;
  tagline: string;
  description: string;
  monogram: string;
  art: "canva" | "capcut" | "google" | "netflix";
  badge?: string;
  features: string[];
  variants: DemoVariant[];
  deliveryLabel: string;
  activationRequired: boolean;
  terms?: { warranty: string; receipt: string; activationNote: string };
  media?: { src: string; alt: string };
}

export interface CmsSection {
  id: string;
  kind: "featured" | "categories" | "how_it_works" | "support";
  title: string;
  subtitle: string;
  enabled: boolean;
  sortOrder: number;
  productIds?: string[];
}

export interface StorefrontContent {
  schemaVersion: 2;
  revision: string;
  brand: { name: string; tagline: string; footer: string };
  announcement: {
    text: string;
    cta: string;
    href: string;
    media?: { src: string; alt: string };
  };
  shop: {
    eyebrow: string;
    title: string;
    accent: string;
    description: string;
    searchPlaceholder: string;
    allLabel: string;
    resultsLabel: string;
  };
  categories: { id: string; name: string; description: string; icon: string }[];
  products: DemoProduct[];
  sections: CmsSection[];
  steps: { title: string; description: string }[];
  support: { title: string; description: string; fanpageUrl: string | null };
  faqs: { question: string; answer: string }[];
  coupon: { code: string; percent: number; maxDiscountVnd: number };
  policies: { slug: string; title: string; body: string }[];
  experience?: {
    intro: {
      eyebrow: string;
      title: string;
      accent: string;
      description: string;
    };
    notices: { id: string; text: string; href: string }[];
    slides: {
      id: string;
      title: string;
      description: string;
      theme: "mint" | "peach" | "lavender";
      href: string;
      media?: { src: string; alt: string };
    }[];
    reviews: { id: string; name: string; text: string; product: string }[];
    illustrativePurchases: boolean;
    activityNotifications?: boolean;
    telegramUrl: string | null;
  };
}

export interface StorefrontProvider {
  getPublishedContent(): StorefrontContent;
}
