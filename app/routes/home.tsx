import { useEffect, useState } from "react";
import type { MetaFunction } from "react-router";
import { Link, useSearchParams } from "react-router";
import { useContent } from "../components/content-context";
import { FeedbackButton, ReviewButton } from "../components/engagement";
import { Icon } from "../components/icons";
import { EmptyState, ProductCard } from "../components/storefront";
import {
  customerCopy,
  customerFaqs,
  experienceOf,
  imageSlides,
} from "../content/experience";
import { getStorefrontContent } from "../content/fixtures";
import type { StorefrontContent } from "../content/types";
import { filterProducts } from "../domain/catalog";

export const meta: MetaFunction = ({ matches }) => {
  const content =
    (
      matches.find((m) => m.id === "root")?.loaderData as
        | { content?: StorefrontContent }
        | undefined
    )?.content ?? getStorefrontContent();
  return [
    { title: "Hubby — Tài khoản & dịch vụ số" },
    { name: "description", content: experienceOf(content).intro.description },
  ];
};

export default function Home({ preview = false }: { preview?: boolean } = {}) {
  const Root = preview ? "section" : "main";
  const content = useContent();
  const settings = experienceOf(content);
  const slides = imageSlides(content);
  const [params, setParams] = useSearchParams();
  const category = params.get("category") ?? "";
  const query = params.get("q") ?? "";
  const [slideIndex, setSlideIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (
      paused ||
      hovered ||
      focused ||
      preview ||
      slides.length < 2 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const timer = setInterval(() => {
      if (!document.hidden) setSlideIndex((n) => (n + 1) % slides.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [paused, hovered, focused, preview, slides.length]);
  const activeSlide = slides.length ? slideIndex % slides.length : 0;
  const slide = slides[activeSlide];
  const products = filterProducts(content.products, {
    q: query,
    category,
    available: false,
    sort: "featured",
  });
  const legacyFaqs = getStorefrontContent().faqs;
  const faq =
    content.faqs.length === legacyFaqs.length &&
    content.faqs.every(
      (item, n) =>
        item.question === legacyFaqs[n]?.question &&
        item.answer === legacyFaqs[n]?.answer,
    )
      ? customerFaqs
      : content.faqs;
  function chooseCategory(value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set("category", value);
    else next.delete("category");
    setParams(next, { preventScrollReset: true });
  }
  return (
    <Root
      id={preview ? undefined : "main"}
      tabIndex={-1}
      className="refresh-home"
    >
      <section
        className="container welcome-grid"
        aria-labelledby="welcome-title"
      >
        <div className="welcome-copy">
          <p className="eyebrow">
            <span className="tiny-spark">✳</span> {settings.intro.eyebrow}
          </p>
          <h1 id="welcome-title">
            {settings.intro.title}
            <br />
            <span>{settings.intro.accent}</span>
          </h1>
          <p>{settings.intro.description}</p>
          <div className="welcome-actions">
            <Link className="button primary" to="/#san-pham">
              Khám phá sản phẩm <Icon name="arrow" />
            </Link>
            <Link className="button secondary" to="/#ho-tro">
              Hỏi Hubby <Icon name="headset" />
            </Link>
          </div>
        </div>
        {slide ? (
          <section
            className={`welcome-slide image-carousel slide-${slide.theme}`}
            aria-label="Banner nổi bật"
            aria-roledescription="trình chiếu"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onFocus={(event) => {
              if (event.target.matches(":focus-visible")) setFocused(true);
            }}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget))
                setFocused(false);
            }}
          >
            <Link
              to={slide.href}
              className="slide-link"
              key={slide.id}
              aria-label={slide.media.alt}
            >
              <img
                src={slide.media.src}
                alt={slide.media.alt}
                className="slide-image"
                decoding="async"
              />
            </Link>
            {slides.length > 1 && (
              <div className="slide-controls">
                <div>
                  {slides.map((s, n) => (
                    <button
                      type="button"
                      key={s.id}
                      aria-label={`Banner ${n + 1}`}
                      aria-pressed={n === activeSlide}
                      onClick={() => {
                        setSlideIndex(n);
                      }}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className="slide-pause"
                  aria-label={paused ? "Chạy banner" : "Dừng banner"}
                  onClick={() => setPaused(!paused)}
                >
                  {paused ? "▷" : "Ⅱ"}
                </button>
              </div>
            )}
          </section>
        ) : (
          <div className="welcome-slide banner-idle" aria-hidden="true">
            <span className="banner-orbit" />
            <span className="banner-orbit orbit-inner" />
            <span className="banner-brand">
              {content.brand.name}
              <span>✳</span>
            </span>
          </div>
        )}
      </section>
      <section className="container how-section" id="cach-mua">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CÁCH MUA HÀNG</p>
            <h2>Cách đặt hàng</h2>
          </div>
          <Link className="text-link" to="/#faq">
            Những điều cần biết <Icon name="arrow" />
          </Link>
        </div>
        <div className="how-grid">
          {content.steps.map((s, n) => (
            <article key={s.title}>
              <span className="step-number">0{n + 1}</span>
              <div>
                <h3>{customerCopy(s.title)}</h3>
                <p>{customerCopy(s.description)}</p>
              </div>
            </article>
          ))}
        </div>
        <p className="how-note">
          <Icon name="shield" /> Kiểm tra điều kiện gói trước khi đặt hàng.
          Không chia sẻ mật khẩu cá nhân.
        </p>
      </section>
      <section
        className="container browse-section"
        id="san-pham"
        aria-labelledby="browse-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">SẢN PHẨM</p>
            <h2 id="browse-title">Danh mục sản phẩm</h2>
          </div>
          <span className="results-count" role="status">
            {products.length} sản phẩm{query ? ` · “${query}”` : ""}
          </span>
        </div>
        <div className="browse-layout">
          <fieldset
            className="category-panel"
            aria-label="Lọc sản phẩm theo danh mục"
          >
            <legend>Danh mục</legend>
            <button
              type="button"
              aria-pressed={!category}
              onClick={() => chooseCategory("")}
            >
              <Icon name="grid" /> Tất cả{" "}
              <small>{content.products.length}</small>
            </button>
            {content.categories.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={category === c.id}
                onClick={() => chooseCategory(c.id)}
              >
                <Icon name={c.icon} />
                {c.name}
                <small>
                  {content.products.filter((p) => p.category === c.id).length}
                </small>
              </button>
            ))}
          </fieldset>
          {products.length ? (
            <div className="compact-collections">
              {category && (
                <div className="category-group-heading">
                  <h3>
                    {content.categories.find((c) => c.id === category)?.name}
                  </h3>
                </div>
              )}
              <div className="product-grid">
                {products.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              title="Chưa tìm thấy sản phẩm."
              description="Thử từ khóa khác hoặc xem tất cả danh mục."
              href="/#san-pham"
              cta="Xóa bộ lọc"
            />
          )}
        </div>
      </section>
      <section className="container reviews-section" id="reviews">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ĐÁNH GIÁ</p>
            <h2>Trải nghiệm khách hàng</h2>
          </div>
          <ReviewButton className="text-link" />
        </div>
        {settings.reviews.length ? (
          <div className="review-grid">
            {settings.reviews.map((r) => (
              <article key={r.id}>
                <span className="review-quote">“</span>
                <p>{r.text}</p>
                <strong>{r.name}</strong>
                <small>{r.product}</small>
              </article>
            ))}
          </div>
        ) : (
          <div className="review-empty">
            <span className="review-quote">“</span>
            <div>
              <h3>Chia sẻ trải nghiệm của bạn</h3>
              <p>
                Đánh giá được gửi riêng cho Hubby, không tự hiển thị trên trang.
              </p>
            </div>
          </div>
        )}
      </section>
      <section className="container faq-section" id="faq">
        <div>
          <p className="eyebrow">FAQ</p>
          <h2>
            Câu hỏi <span>thường gặp.</span>
          </h2>
        </div>
        <div className="faq-list">
          {faq.map((f) => (
            <details key={f.question}>
              <summary>
                {f.question}
                <Icon name="plus" />
              </summary>
              <p>{f.answer}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="container home-support" id="ho-tro">
        <div className="support-spark" aria-hidden="true">
          ✳
        </div>
        <div>
          <p className="eyebrow">HỖ TRỢ</p>
          <h2>{customerCopy(content.support.title)}</h2>
          <p>{customerCopy(content.support.description)}</p>
        </div>
        <div className="support-actions">
          <Link to="/tai-khoan/tickets" className="button primary">
            Hỗ trợ đơn hàng <Icon name="headset" />
          </Link>
          <Link to="/tra-don-hang" className="text-link">
            Tra đơn hàng <Icon name="arrow" />
          </Link>
          <FeedbackButton className="text-link" />
        </div>
      </section>
    </Root>
  );
}
