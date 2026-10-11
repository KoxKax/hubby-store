import { Link } from "react-router";
import { useContent } from "../components/content-context";
import { Icon } from "../components/icons";
import { PageIntro } from "../components/storefront";
export function meta() {
  return [{ title: "Một chút hỗ trợ từ Hubby" }];
}
export default function Support() {
  const content = useContent();
  return (
    <main className="container support-page" id="main" tabIndex={-1}>
      <PageIntro
        eyebrow="WE'RE HERE FOR YOU"
        title="Cùng bạn, từ bước đầu."
        description={content.support.description}
      />
      <div className="support-page-grid">
        <section className="faq-list">
          <h2>Một vài điều bạn muốn biết.</h2>
          {content.faqs.map((faq) => (
            <details key={faq.question}>
              <summary>
                {faq.question}
                <Icon name="plus" />
              </summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </section>
        <aside className="support-contact">
          <span className="category-icon">
            <Icon name="headset" />
          </span>
          <h2>Hubby lắng nghe.</h2>
          <p>
            Ticket hỗ trợ và Fanpage sẽ được bật sau khi Owner cấu hình kênh
            liên hệ chính thức.
          </p>
          {content.support.fanpageUrl ? (
            <a
              className="button primary"
              href={content.support.fanpageUrl}
              target="_blank"
              rel="noreferrer"
            >
              Ghé Facebook Fanpage
              <Icon name="arrow" />
            </a>
          ) : (
            <span className="pill">Kênh liên hệ đang chuẩn bị</span>
          )}
          <Link className="text-link" to="/san-pham">
            Khám phá bộ sưu tập
            <Icon name="arrow" />
          </Link>
        </aside>
      </div>
    </main>
  );
}
