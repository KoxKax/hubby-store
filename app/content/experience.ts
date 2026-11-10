import type { StorefrontContent } from "./types";
import { refineCustomerCopy } from "./copy-refinements";
import { productEditorialCopy } from "./product-editorial-copy";
import { fallbackBanners } from "./visual-assets";
import { getStorefrontContent } from "./fixtures";

export type Experience = NonNullable<StorefrontContent["experience"]>;
export const defaultExperience: Experience = {
  intro: {
    eyebrow: "HUBBY · DỊCH VỤ SỐ",
    title: "Chọn gói phù hợp.",
    accent: "Có Hubby hỗ trợ.",
    description:
      "Khám phá những công cụ giúp việc học, sáng tạo, công việc và giải trí thuận tiện hơn mỗi ngày. Chọn sản phẩm, so sánh thời hạn, xem hướng dẫn nhận hàng và quyền lợi của từng gói trước khi đặt mua.",
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

export const customerPolicyCopy: Record<
  "bao-mat" | "doi-tra" | "dieu-khoan",
  string
> = {
  "bao-mat":
    "Khi bạn tạo tài khoản, đặt hàng hoặc gửi yêu cầu hỗ trợ, Hubby xử lý thông tin bạn cung cấp (như email, dữ liệu đơn hàng và nội dung hỗ trợ) để vận hành dịch vụ, xác nhận thanh toán và giải quyết yêu cầu. Một số bước thanh toán hoặc cấp hàng có thể do đơn vị cung cấp dịch vụ liên quan xử lý. Không gửi mật khẩu cá nhân, mã OTP hoặc thông tin nhạy cảm qua biểu mẫu góp ý. Nếu cần hỏi về dữ liệu của mình, hãy liên hệ qua kênh hỗ trợ trên website.",
  "doi-tra":
    "Điều kiện bảo hành, đổi sản phẩm hoặc hoàn tiền phụ thuộc vào từng gói và tình trạng đơn hàng. Bạn cần đọc thời hạn, cách nhận và điều kiện áp dụng trên trang sản phẩm trước khi thanh toán. Nếu nhận sai sản phẩm, gặp lỗi kích hoạt hoặc lỗi sử dụng, hãy gửi yêu cầu từ đơn hàng kèm mô tả sự cố để Hubby kiểm tra và xử lý theo điều kiện của gói đã công bố.",
  "dieu-khoan":
    "Trước khi đặt hàng, vui lòng kiểm tra sản phẩm, thời hạn, quyền lợi, cách nhận và điều kiện bảo hành được hiển thị cho gói đã chọn. Đơn hàng chỉ được xác nhận thanh toán khi hệ thống ghi nhận giao dịch hợp lệ; trạng thái đang chờ không có nghĩa là đã thanh toán hay giao thành công. Các tên và biểu trưng thương hiệu dùng để nhận biết dịch vụ, không mặc nhiên thể hiện Hubby là đại lý chính thức của những thương hiệu đó.",
};

// Preserve custom Owner copy. Only exact known legacy fixture strings are adapted;
// persisted CMS revisions are never silently overwritten by a visual update.
const legacy: Record<string, string> = {
  "TÀI KHOẢN & DỊCH VỤ SỐ": defaultExperience.intro.eyebrow,
  "Tài khoản &": defaultExperience.intro.title,
  "dịch vụ số.": defaultExperience.intro.accent,
  "Tài khoản và gói dịch vụ số cho học tập, làm việc và giải trí. Chưa biết chọn gói nào, hay cần giúp khi sử dụng? Cứ hỏi Hubby nhé.":
    defaultExperience.intro.description,
  "Hubby cung cấp tài khoản và gói dịch vụ số. Mỗi gói đều có thông tin thời hạn, cách nhận và bảo hành để bạn dễ chọn. Chưa rõ gói nào phù hợp? Tụi mình sẵn sàng tư vấn.":
    defaultExperience.intro.description,
  "Tụi mình cung cấp tài khoản và gói dịch vụ số, với thông tin thời hạn, cách nhận và bảo hành rõ ràng. Cần tư vấn hay gặp vấn đề khi sử dụng? Cứ hỏi Hubby nhé.":
    defaultExperience.intro.description,
  "Gửi yêu cầu từ đơn hàng để Hubby kiểm tra và hỗ trợ đúng gói của bạn.":
    "Cần giúp với đơn hàng? Gửi yêu cầu để tụi mình kiểm tra. Nếu bạn chưa mua, xem câu hỏi thường gặp hoặc gửi góp ý nhé.",
  "CANVA · CAPCUT · GOOGLE · NETFLIX": defaultExperience.intro.eyebrow,
  "Gói bạn cần,": defaultExperience.intro.title,
  "chọn tại Hubby.": defaultExperience.intro.accent,
  "Tìm tài khoản và gói dịch vụ cho thiết kế, dựng video, làm việc hay giải trí. Chọn sản phẩm để xem thời hạn và cách sử dụng nhé.":
    defaultExperience.intro.description,
  "Bản demo chỉ lưu mã sản phẩm và số lượng trong giỏ trên trình duyệt. Không nhập thông tin cá nhân thật. Chính sách mở bán cần Owner duyệt.":
    customerPolicyCopy["bao-mat"],
  "Điều kiện đổi trả, bảo hành và quyền sử dụng cần xác minh theo từng sản phẩm trước khi mở bán. Mọi giá và thời hạn hiện tại chỉ là dữ liệu mẫu.":
    customerPolicyCopy["doi-tra"],
  "Đây là bản xem trước, không tạo hợp đồng mua hàng, không thu tiền hoặc giao sản phẩm. Tên thương hiệu chỉ xác định nhóm sản phẩm Owner đề cập; không khẳng định Hubby là đối tác hay nhà phân phối chính thức.":
    customerPolicyCopy["dieu-khoan"],
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
    "Khám phá những công cụ AI của Google để tìm ý tưởng, chuẩn bị nội dung và sắp xếp công việc. Xem thông tin gói Google AI Pro, thời hạn sử dụng và cách kích hoạt ngay trên trang sản phẩm.",
  "Mẫu danh mục Netflix để thử chọn gói và luồng mua. Giá, thời hạn và tồn kho giả lập; chưa xác nhận loại gói, thiết bị, quyền sử dụng hay quyền phân phối. Không có tài khoản, nội dung hoặc subscription thật được giao trong bản demo.":
    "Chọn lựa chọn Netflix theo thời hạn. Kiểm tra điều kiện thiết bị và cách sử dụng của từng gói trước khi đặt hàng.",
  "Chọn thời hạn mẫu": "Chọn thời hạn phù hợp",
  "Điều kiện gói cần Owner xác nhận": "Đọc điều kiện trước khi đặt hàng",
  "Hai thời hạn để thử lựa chọn": "Lựa chọn theo thời hạn",
  "Chưa có tài khoản thật": "Kiểm tra cách kích hoạt của gói",
  "Thông tin gói chính thức sẽ được duyệt":
    "Xem thông tin chi tiết trước khi mua",
  "Loại dịch vụ Google chưa chốt": "Xem thông tin gói và cách kích hoạt",
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

// An older published Canva instruction merged its heading and first sentence.
// Improve that exact customer-facing wording without changing Owner CMS data.
export function customerProductDescription(value: string) {
  const expanded: Record<string, string> = {
    "Gói Microsoft Office 365 thời hạn 1 năm, nâng trên tài khoản của bạn. Bảo hành trong toàn bộ thời hạn gói. Hubby hướng dẫn các bước nâng cấp theo đơn hàng.":
      productEditorialCopy.office,
    "CapCut Pro với hai lựa chọn 1 tháng và 6 tháng. Hubby cấp tài khoản để bạn sử dụng; không nâng trên tài khoản cá nhân của bạn. Chọn thời hạn phù hợp và xem hướng dẫn đăng nhập khi nhận hàng.":
      productEditorialCopy.capcut,
    "Gói Netflix thời hạn 1 tháng, được cấp tài khoản để sử dụng. Xem điều kiện thiết bị và hướng dẫn đăng nhập của gói trước khi đặt hàng.":
      productEditorialCopy.netflix,
    "Gói Duolingo 1 năm, nâng trên tài khoản của bạn bằng link kích hoạt. Nhận link và thực hiện các bước theo hướng dẫn trong đơn hàng.":
      productEditorialCopy.duolingo,
    "Gói Google AI Pro 18 tháng, nâng trên tài khoản của bạn qua link kích hoạt. Gói không có bảo hành; hãy đọc kỹ điều kiện kích hoạt và sử dụng trước khi đặt hàng.":
      productEditorialCopy.google,
  };
  return refineCustomerCopy(expanded[value] ?? customerCopy(value)).replace(
    "Cung cấp đúng email Canva muốn tham gia, mở lời mời nhận được rồi làm theo hướng dẫn trong đơn hàng. Không cần gửi mật khẩu hoặc mã xác thực. Gói thuộc chương trình giáo dục và áp dụng điều kiện tham gia của Canva Education.",
    "Khi đặt hàng, hãy cung cấp chính xác email của tài khoản Canva bạn muốn sử dụng. Sau khi nhận được lời mời, hãy mở email và làm theo hướng dẫn trong đơn hàng để tham gia. Bạn không cần gửi mật khẩu hoặc mã xác thực cá nhân cho Hubby. Gói thuộc chương trình Canva Education và áp dụng điều kiện tham gia của chương trình.",
  );
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
  return slides.length ? slides : fallbackBanners(content);
}

export const customerFaqs = [
  {
    question: "Chưa biết chọn gói nào?",
    answer:
      "Bạn xem thời hạn, cách nhận và bảo hành trên trang sản phẩm nhé. Nếu còn phân vân về loại tài khoản hoặc thiết bị sử dụng, hỏi Hubby trước khi mua để chọn đúng gói.",
  },
  {
    question: "Xem lại đơn hàng ở đâu?",
    answer:
      "Nếu đã đăng nhập, vào Tài khoản → Đơn hàng. Với đơn đặt không đăng nhập, mở mục Tra đơn hàng và làm theo hướng dẫn xác minh. Hãy giữ mã đơn để tiện theo dõi và nhờ hỗ trợ.",
  },
  {
    question: "Hubby có cần mật khẩu của tôi không?",
    answer:
      "Không chia sẻ mật khẩu cá nhân hoặc mã OTP qua tin nhắn hỗ trợ. Mỗi sản phẩm có cách nhận và kích hoạt riêng; với gói nhận lời mời, bạn chỉ cần cung cấp đúng email theo hướng dẫn trong đơn hàng.",
  },
  {
    question: "Gói gặp lỗi thì liên hệ thế nào?",
    answer:
      "Mở đơn hàng và gửi yêu cầu hỗ trợ, mô tả lỗi bạn gặp để tụi mình kiểm tra. Thời hạn và điều kiện bảo hành được ghi riêng ở từng gói, không áp dụng chung cho mọi sản phẩm.",
  },
];

/** Keep Owner-authored FAQ edits; replace only the untouched historical fixtures. */
export function customerFacingFaqs(content: StorefrontContent) {
  const original = getStorefrontContent().faqs;
  const untouched =
    content.faqs.length === original.length &&
    content.faqs.every(
      (faq, index) =>
        faq.question === original[index]?.question &&
        faq.answer === original[index]?.answer,
    );
  return untouched ? customerFaqs : content.faqs;
}
