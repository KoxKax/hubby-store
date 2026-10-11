import type { StorefrontContent } from "./types";

export type Experience = NonNullable<StorefrontContent["experience"]>;
export const defaultExperience: Experience = {
  intro: {
    eyebrow: "TÀI KHOẢN & DỊCH VỤ SỐ",
    title: "Tài khoản &",
    accent: "dịch vụ số.",
    description:
      "Tụi mình cung cấp tài khoản và gói dịch vụ số, với thông tin thời hạn, cách nhận và bảo hành rõ ràng. Cần tư vấn hay gặp vấn đề khi sử dụng? Cứ hỏi Hubby nhé.",
  },
  notices: [
    {
      id: "notice-explore",
      text: "Tìm gói phù hợp cho sáng tạo, làm việc và giải trí.",
      href: "/#san-pham",
    },
    {
      id: "notice-support",
      text: "Cần chọn gói? Hỏi Hubby trước khi đặt hàng.",
      href: "/#ho-tro",
    },
    {
      id: "notice-privacy",
      text: "Không chia sẻ mật khẩu cá nhân trong tin nhắn hỗ trợ.",
      href: "/#faq",
    },
  ],
  slides: [
    {
      id: "slide-create",
      title: "Biến ý tưởng thành điều bạn thích.",
      description: "Khám phá Canva & CapCut",
      theme: "mint",
      href: "/?category=ai#san-pham",
    },
    {
      id: "slide-relax",
      title: "Một khoảng nghỉ, theo cách của bạn.",
      description: "Khám phá những lựa chọn giải trí",
      theme: "peach",
      href: "/?category=entertainment#san-pham",
    },
    {
      id: "slide-work",
      title: "Làm việc gọn hơn. Sống nhẹ hơn.",
      description: "Công cụ cho mỗi ngày",
      theme: "lavender",
      href: "/?category=work#san-pham",
    },
  ],
  reviews: [],
  illustrativePurchases: false,
  activityNotifications: true,
  telegramUrl: null,
};
export function experienceOf(content: StorefrontContent): Experience {
  if (content.experience)
    return {
      ...content.experience,
      illustrativePurchases: false,
      activityNotifications: content.experience.activityNotifications ?? true,
      intro: Object.fromEntries(
        Object.entries(content.experience.intro).map(([key, value]) => [
          key,
          customerCopy(value),
        ]),
      ) as Experience["intro"],
    };
  return {
    ...defaultExperience,
    notices:
      content.announcement.text === "Thiết kế. Dựng video. Làm việc. Giải trí."
        ? defaultExperience.notices
        : [
            {
              id: "notice-existing",
              text: content.announcement.text,
              href: content.announcement.href,
            },
            ...defaultExperience.notices.slice(1),
          ],
    intro: {
      ...defaultExperience.intro,
      description:
        content.shop.description ===
        "Canva, CapCut, Google, Netflix — chọn theo nhu cầu của bạn."
          ? defaultExperience.intro.description
          : content.shop.description,
      title:
        content.shop.title === "Tài khoản bạn cần."
          ? defaultExperience.intro.title
          : content.shop.title,
      accent:
        content.shop.accent === "Ngay tại đây."
          ? defaultExperience.intro.accent
          : content.shop.accent,
    },
  };
}

// Preserve custom Owner copy. Only exact known legacy fixture strings are adapted;
// persisted CMS revisions are never silently overwritten by a visual update.
const legacy: Record<string, string> = {
  "CANVA · CAPCUT · GOOGLE · NETFLIX": defaultExperience.intro.eyebrow,
  "Gói bạn cần,": defaultExperience.intro.title,
  "chọn tại Hubby.": defaultExperience.intro.accent,
  "Tìm tài khoản và gói dịch vụ cho thiết kế, dựng video, làm việc hay giải trí. Chọn sản phẩm để xem thời hạn và cách sử dụng nhé.":
    defaultExperience.intro.description,
  "Bản demo chỉ lưu mã sản phẩm và số lượng trong giỏ trên trình duyệt. Không nhập thông tin cá nhân thật. Chính sách mở bán cần Owner duyệt.":
    "Giỏ hàng, sản phẩm yêu thích và lịch sử xem được lưu trên trình duyệt của bạn. Góp ý được lưu để Hubby xem và cải thiện dịch vụ, không tự công khai. Không gửi mật khẩu hoặc mã xác thực qua form góp ý. Chính sách cho việc thu thập thông tin khách hàng khi mở bán sẽ được công bố trước khi áp dụng.",
  "Điều kiện đổi trả, bảo hành và quyền sử dụng cần xác minh theo từng sản phẩm trước khi mở bán. Mọi giá và thời hạn hiện tại chỉ là dữ liệu mẫu.":
    "Điều kiện đổi trả và bảo hành chưa được công bố. Bạn hỏi rõ điều kiện của từng gói trước khi đặt hàng nhé; Hubby không áp dụng một thời hạn bảo hành chung cho mọi sản phẩm.",
  "Đây là bản xem trước, không tạo hợp đồng mua hàng, không thu tiền hoặc giao sản phẩm. Tên thương hiệu chỉ xác định nhóm sản phẩm Owner đề cập; không khẳng định Hubby là đối tác hay nhà phân phối chính thức.":
    "Thanh toán đang tạm đóng, chưa nhận tiền hoặc giao sản phẩm thương mại. Tên Canva, CapCut, Google và Netflix giúp bạn nhận biết dịch vụ; không có nghĩa Hubby là đối tác chính thức của các thương hiệu này.",
  "Chưa biết chọn gói nào?": "Bạn cần Hubby giúp gì?",
  "Xem giải đáp và cách mua trước khi chọn tài khoản phù hợp.":
    "Mở đơn hàng để gửi yêu cầu hỗ trợ, hoặc chia sẻ góp ý với tụi mình.",
  "YOUR EVERYDAY, UPGRADED": defaultExperience.intro.eyebrow,
  "Thêm cảm hứng.": defaultExperience.intro.title,
  "Bớt giới hạn.": defaultExperience.intro.accent,
  "Một nơi để tìm gói phù hợp cho những điều bạn thích — sáng tạo, làm việc và tận hưởng mỗi ngày.":
    defaultExperience.intro.description,
  "Gói mẫu": "",
  "tài khoản & gói mẫu": "sản phẩm",
  "Cách kích hoạt chưa chốt": "Xem hướng dẫn theo gói",
  "Loại gói cần xác nhận": "Xem chi tiết gói",
  "Cách nhận chưa chốt": "Xem hướng dẫn nhận sản phẩm",
  "Mẫu danh mục Canva theo định hướng của Owner. Các thời hạn, giá và số lượng chỉ để thử giao diện; chưa xác nhận gói thương mại, quyền phân phối hoặc điều kiện kích hoạt. Hubby chưa mở bán và không đại diện cho Canva.":
    "Khám phá các lựa chọn Canva cho nhu cầu thiết kế. Chọn thời hạn và đọc điều kiện của gói trước khi đặt hàng.",
  "Mẫu danh mục CapCut cho bố cục storefront. Thời hạn, giá và tồn kho là dữ liệu giả lập, không phải báo giá hay mô tả gói chính thức. Quyền phân phối, loại tài khoản và cách kích hoạt cần Owner xác nhận trước khi mở bán.":
    "Các lựa chọn CapCut dành cho nhu cầu dựng video. So sánh thời hạn và kiểm tra cách kích hoạt của từng gói.",
  "Google là nhóm sản phẩm Owner đề cập; chưa chốt Google One, gói AI hay dịch vụ cụ thể. Trang này dùng gói và giá giả lập, không khẳng định quyền lợi, dung lượng, quyền phân phối hoặc phương thức kích hoạt của dịch vụ nào.":
    "Danh mục Google đang được hoàn thiện. Liên hệ Hubby để xác nhận đúng dịch vụ và quyền lợi bạn cần trước khi đặt hàng.",
  "Mẫu danh mục Netflix để thử chọn gói và luồng mua. Giá, thời hạn và tồn kho giả lập; chưa xác nhận loại gói, thiết bị, quyền sử dụng hay quyền phân phối. Không có tài khoản, nội dung hoặc subscription thật được giao trong bản demo.":
    "Chọn lựa chọn Netflix theo thời hạn. Kiểm tra điều kiện thiết bị và cách sử dụng của từng gói trước khi đặt hàng.",
  "Chọn thời hạn mẫu": "Chọn thời hạn phù hợp",
  "Điều kiện gói cần Owner xác nhận": "Đọc điều kiện trước khi đặt hàng",
  "Hai thời hạn để thử lựa chọn": "Lựa chọn theo thời hạn",
  "Chưa có tài khoản thật": "Kiểm tra cách kích hoạt của gói",
  "Thông tin gói chính thức sẽ được duyệt": "Hỏi hỗ trợ nếu cần tư vấn",
  "Loại dịch vụ Google chưa chốt": "Xác nhận dịch vụ trước khi chọn gói",
  "Giá và thời hạn chỉ là mẫu": "Xem giá theo từng thời hạn",
  "Không quảng cáo quyền lợi chưa xác minh": "Xem điều kiện sử dụng của gói",
  "Điều kiện sử dụng cần Owner duyệt": "Liên hệ hỗ trợ khi cần",
  "Tìm thương hiệu bạn cần và xem các thời hạn mẫu.":
    "Chọn sản phẩm, so sánh thời hạn và đọc điều kiện của gói.",
  "Thử luồng mua": "Theo dõi đơn hàng",
  "Bản demo chỉ xem trước, chưa thanh toán hoặc giao tài khoản.":
    "Lưu mã đơn để tra trạng thái và xem hướng dẫn nhận sản phẩm.",
};
export function customerCopy(value: string) {
  return legacy[value] ?? value;
}
export function imageSlides(content: StorefrontContent) {
  const slides = experienceOf(content).slides.filter(
    (
      s,
    ): s is Experience["slides"][number] & {
      media: { src: string; alt: string };
    } => !!s.media,
  );
  if (!slides.length && content.announcement.media)
    return [
      {
        id: "slide-legacy-image",
        title: content.announcement.text,
        description: content.announcement.cta,
        theme: "lavender" as const,
        href: content.announcement.href,
        media: content.announcement.media,
      },
    ];
  return slides;
}

export const customerFaqs = [
  {
    question: "Tôi nên chọn gói nào?",
    answer:
      "Chọn theo dịch vụ và thời hạn bạn cần. Đọc chi tiết gói; nếu chưa rõ loại tài khoản, thiết bị hoặc cách kích hoạt, hãy hỏi Hubby trước khi đặt hàng.",
  },
  {
    question: "Tôi tìm lại đơn hàng ở đâu?",
    answer:
      "Chọn Tra đơn hàng ở đầu trang, rồi nhập mã đơn và email. Bạn giữ lại mã đơn để tiện tra cứu nhé.",
  },
  {
    question: "Cần chuẩn bị gì khi nhận sản phẩm?",
    answer:
      "Làm theo hướng dẫn của từng gói. Không gửi mật khẩu cá nhân hoặc mã xác thực trong tin nhắn; chỉ cung cấp thông tin kích hoạt khi được yêu cầu qua luồng an toàn.",
  },
  {
    question: "Nếu sản phẩm gặp vấn đề thì sao?",
    answer:
      "Gửi yêu cầu hỗ trợ từ đơn hàng để giữ đúng thông tin giao dịch. Điều kiện đổi trả và bảo hành áp dụng theo từng gói; xem chính sách trước khi đặt hàng.",
  },
];
