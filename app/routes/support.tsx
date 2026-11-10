import { Link } from "react-router";
import { useContent } from "../components/content-context";
import { Icon } from "../components/icons";
import { PageIntro } from "../components/storefront";
import { customerCopy, customerFacingFaqs } from "../content/experience";
export function meta() {
  return [{ title: "Hỗ trợ khách hàng — Hubby" }];
}
export default function Support() {
  const content = useContent();
  return (
    <main className="container support-page" id="main" tabIndex={-1}>
      <PageIntro
        eyebrow="HỖ TRỢ KHÁCH HÀNG"
        title="Hubby có thể giúp gì cho bạn?"
        description={customerCopy(content.support.description)}
      />
      <div className="support-page-grid">
        <section className="faq-list">
          <h2>Câu hỏi thường gặp</h2>
          {customerFacingFaqs(content).map((faq) => (
            <details key={faq.question}>
              <summary>
                {customerCopy(faq.question)}
                <Icon name="plus" />
              </summary>
              <p>{customerCopy(faq.answer)}</p>
            </details>
          ))}
        </section>
        <aside className="support-contact">
          <span className="category-icon">
            <Icon name="headset" />
          </span>
          <h2>Liên hệ Hubby</h2>
          <p>
            Khi cần hỗ trợ sản phẩm đã mua, hãy mở đơn hàng và gửi yêu cầu
            kèm mô tả vấn đề bạn gặp. Hubby sẽ dựa trên thông tin đơn để
            kiểm tra và phản hồi.
          </p>
          <Link className="text-link" to="/tra-don-hang">
            Tra đơn và yêu cầu hỗ trợ
            <Icon name="arrow" />
          </Link>
          {content.support.fanpageUrl ? (
            <a
              className="button primary"
              href={content.support.fanpageUrl}
              target="_blank"
              rel="noreferrer"
            >
              Nhắn tin qua Facebook
              <Icon name="arrow" />
            </a>
          ) : null}
          <Link className="text-link" to="/san-pham">
            Xem các sản phẩm
            <Icon name="arrow" />
          </Link>
        </aside>
      </div>
    </main>
  );
}
