import { customerCopy, customerFaqs, customerPolicyCopy } from "./experience";
import { getStorefrontContent } from "./fixtures";
import type { StorefrontContent } from "./types";

// Suggestions are applied to an editable Owner draft only. Match exact known
// legacy text (including actual CMS revision 4), never broad keywords.
export function refreshLegacyCmsCopy(source: StorefrontContent): {
  content: StorefrontContent;
  count: number;
} {
  const content = structuredClone(source);
  const old = getStorefrontContent();
  let count = 0;
  const suggest = (current: string, known: string, replacement: string) => {
    if (current !== known || current === replacement) return current;
    count++;
    return replacement;
  };
  const suggestKnown = (
    current: string,
    known: readonly string[],
    replacement: string,
  ) => {
    if (!known.includes(current) || current === replacement) return current;
    count++;
    return replacement;
  };
  const mapped = (current: string, optional = false) => {
    const next = customerCopy(current);
    if (next === "" && !optional) return current;
    if (next !== current) count++;
    return next;
  };

  content.brand.name = suggest(content.brand.name, old.brand.name, "Hubby");
  content.brand.tagline = suggest(
    content.brand.tagline,
    old.brand.tagline,
    "Dịch vụ số cho học tập, làm việc và giải trí.",
  );
  content.brand.footer = suggest(
    content.brand.footer,
    old.brand.footer,
    "Chọn gói phù hợp, xem rõ điều kiện và theo dõi đơn hàng tại Hubby.",
  );
  content.shop.eyebrow = suggest(
    content.shop.eyebrow,
    old.shop.eyebrow,
    "DỊCH VỤ SỐ TẠI HUBBY",
  );
  content.shop.title = suggest(
    content.shop.title,
    old.shop.title,
    "Tìm gói phù hợp.",
  );
  content.shop.accent = suggest(
    content.shop.accent,
    old.shop.accent,
    "Chọn theo nhu cầu.",
  );
  content.shop.description = suggestKnown(
    content.shop.description,
    [
      old.shop.description,
      "Canva, CapCut, Google, Netflix — chọn theo nhu cầu của bạn.",
    ],
    "Tài khoản và gói dịch vụ cho học tập, sáng tạo, làm việc và giải trí. Xem thời hạn, cách nhận và bảo hành riêng của từng gói.",
  );
  content.shop.resultsLabel = suggest(
    content.shop.resultsLabel,
    old.shop.resultsLabel,
    "sản phẩm",
  );
  content.announcement.text = suggest(
    content.announcement.text,
    old.announcement.text,
    "Khám phá các gói cho học tập, công việc và giải trí.",
  );

  const sectionCopy: Record<string, [string, string]> = {
    featured: [
      "Khám phá sản phẩm",
      "So sánh thời hạn, quyền lợi và cách nhận trước khi đặt hàng.",
    ],
    steps: [
      "Mua hàng tại Hubby",
      "Từ lúc chọn sản phẩm đến khi nhận hàng, bạn có thể theo dõi từng bước.",
    ],
    support: [
      "Cần Hubby hỗ trợ?",
      "Xem giải đáp, tra đơn hoặc gửi yêu cầu để tụi mình kiểm tra.",
    ],
  };
  for (const section of content.sections) {
    const previous = old.sections.find((item) => item.id === section.id);
    const replacement = sectionCopy[section.id];
    if (!previous || !replacement) continue;
    section.title = suggest(section.title, previous.title, replacement[0]);
    section.subtitle = suggest(
      section.subtitle,
      previous.subtitle,
      replacement[1],
    );
  }
  const stepCopy: [string, string][] = [
    ["Chọn sản phẩm", "Xem quyền lợi, thời hạn và điều kiện của từng gói."],
    [
      "Kiểm tra đơn hàng",
      "Xác nhận sản phẩm, số lượng và tổng tiền trước khi thanh toán.",
    ],
    [
      "Thanh toán và theo dõi",
      "Làm theo hướng dẫn thanh toán và xem trạng thái đơn hàng sau khi đặt.",
    ],
  ];
  for (let index = 0; index < content.steps.length; index++) {
    const step = content.steps[index];
    const previous = old.steps[index];
    const replacement = stepCopy[index];
    if (!step || !previous || !replacement) continue;
    step.title = suggest(step.title, previous.title, replacement[0]);
    step.description = suggest(
      step.description,
      previous.description,
      replacement[1],
    );
  }
  content.support.title = suggest(
    content.support.title,
    old.support.title,
    "Cần Hubby hỗ trợ?",
  );
  content.support.description = suggest(
    content.support.description,
    old.support.description,
    "Có câu hỏi trước khi mua hoặc cần hỗ trợ đơn hàng? Xem giải đáp và gửi yêu cầu cho Hubby.",
  );

  for (const faq of content.faqs) {
    const index = old.faqs.findIndex(
      (previous) =>
        previous.question === faq.question && previous.answer === faq.answer,
    );
    if (index < 0) continue;
    const previous = old.faqs[index];
    if (!previous) continue;
    const replacement = customerFaqs[index];
    if (!replacement) continue;
    faq.question = suggest(
      faq.question,
      previous.question,
      replacement.question,
    );
    faq.answer = suggest(faq.answer, previous.answer, replacement.answer);
  }

  const policyCopy: Record<string, string> = customerPolicyCopy;
  for (const policy of content.policies) {
    const previous = old.policies.find((item) => item.slug === policy.slug);
    const replacement = policyCopy[policy.slug];
    if (!previous || !replacement) continue;
    policy.body = suggest(policy.body, previous.body, replacement);
  }

  if (content.experience) {
    for (const key of ["eyebrow", "title", "accent", "description"] as const) {
      const before = content.experience.intro[key];
      content.experience.intro[key] = mapped(before);
    }
  }
  for (const product of content.products) {
    product.description = mapped(product.description);
    product.deliveryLabel = mapped(product.deliveryLabel);
    product.tagline = mapped(product.tagline);
    if (product.badge) product.badge = mapped(product.badge, true) || undefined;
    product.features = product.features.map((feature) => mapped(feature));
  }
  return { content, count };
}
