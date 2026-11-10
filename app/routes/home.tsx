import { useEffect, useState } from "react";
import type { MetaFunction } from "react-router";
import { Link, useSearchParams } from "react-router";
import { useContent } from "../components/content-context";
import { FeedbackButton } from "../components/engagement";
import { Icon } from "../components/icons";
import { EmptyState, ProductCard } from "../components/storefront";
import {
  customerCopy,
  customerFacingFaqs,
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
  const sort = params.get("sort") ?? "featured";
  const [slideIndex, setSlideIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
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
    sort,
  });
  const faq = customerFacingFaqs(content);
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
                srcSet={
                  slide.media.src.startsWith("/visuals/")
                    ? `${slide.media.src.replace("1200", "768")} 768w, ${slide.media.src} 1200w`
                    : undefined
                }
                sizes="(max-width: 600px) calc(100vw - 32px), (max-width: 1100px) 48vw, 600px"
                alt={slide.media.alt}
                className="slide-image"
                decoding="async"
                width="1200"
                height="800"
                fetchPriority={activeSlide === 0 ? "high" : "auto"}
              />
            </Link>
            <nav className="slide-indicators" aria-label="Chọn banner">
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
            </nav>
            {slides.length > 1 && (
              <button
                type="button"
                className="slide-motion-control"
                aria-label={paused ? "Chạy banner" : "Dừng banner"}
                onClick={() => setPaused(!paused)}
              >
                {paused ? "Chạy banner" : "Dừng banner"}
              </button>
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
      <div className="section-divider" aria-hidden="true" />
      <section
        className="container browse-section"
        id="san-pham"
        aria-labelledby="browse-title"
      >
        <h2 id="browse-title" className="sr-only">
          Sản phẩm
        </h2>
        <span className="sr-only" role="status">
          {products.length} sản phẩm{query ? ` · “${query}”` : ""}
        </span>
        <div className="browse-layout">
          <aside
            className="catalog-filter-sidebar"
            aria-label="Bộ lọc sản phẩm"
          >
            <button
              type="button"
              className="catalog-filter-toggle"
              aria-expanded={filtersOpen}
              aria-controls="catalog-filter-controls"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <Icon name="grid" />
              <span>
                {category
                  ? (content.categories.find((item) => item.id === category)
                      ?.name ?? "Lọc và sắp xếp")
                  : "Lọc và sắp xếp"}
              </span>
              <Icon name="chevron" />
            </button>
            <div
              id="catalog-filter-controls"
              className={`catalog-filter-controls${filtersOpen ? " is-open" : ""}`}
            >
              <div className="catalog-tools">
                <label>
                  Sắp xếp
                  <select
                    value={sort}
                    onChange={(event) => {
                      const next = new URLSearchParams(params);
                      next.set("sort", event.target.value);
                      setParams(next, { preventScrollReset: true });
                    }}
                  >
                    <option value="featured">Mặc định</option>
                    <option value="price-asc">Giá thấp đến cao</option>
                    <option value="price-desc">Giá cao đến thấp</option>
                    <option value="name">Tên A–Z</option>
                  </select>
                </label>
                {(query || category || sort !== "featured") && (
                  <Link className="text-link" to="/#san-pham">
                    Xóa bộ lọc
                  </Link>
                )}
              </div>
              <fieldset
                className="category-panel"
                aria-label="Danh mục sản phẩm"
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
                      {
                        content.products.filter((p) => p.category === c.id)
                          .length
                      }
                    </small>
                  </button>
                ))}
              </fieldset>
            </div>
          </aside>
          {products.length ? (
            <div className="compact-collections">
              <div
                className="product-grid"
                key={`${category}:${query}:${sort}`}
              >
                {products.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              title="Không tìm thấy sản phẩm phù hợp"
              description="Bạn có thể đổi từ khóa, chọn danh mục khác hoặc xóa bộ lọc để xem toàn bộ sản phẩm."
              href="/#san-pham"
              cta="Xóa bộ lọc"
            />
          )}
        </div>
      </section>
      <div className="section-divider" aria-hidden="true" />
      <section className="container how-section" id="cach-mua">
        <div className="section-heading">
          <h2>Cách mua hàng</h2>
          <Link className="text-link" to="/#faq">
            Xem giải đáp <Icon name="arrow" />
          </Link>
        </div>
        <div className="how-grid">
          {content.steps.map((step, index) => (
            <article key={step.title}>
              <span className="step-number">0{index + 1}</span>
              <div>
                <h3>{customerCopy(step.title)}</h3>
                <p>{customerCopy(step.description)}</p>
              </div>
            </article>
          ))}
        </div>
        <p className="how-note">
          <Icon name="shield" /> Kiểm tra điều kiện gói trước khi đặt hàng.
          Không chia sẻ mật khẩu cá nhân.
        </p>
      </section>
      <div className="section-divider" aria-hidden="true" />
      <section className="container faq-section" id="faq">
        <div>
          <p className="eyebrow">GIẢI ĐÁP</p>
          <h2>
            Câu hỏi <span>thường gặp.</span>
          </h2>
        </div>
        <div className="faq-list">
          {faq.map((f) => (
            <details key={f.question}>
              <summary>
                {customerCopy(f.question)}
                <Icon name="plus" />
              </summary>
              <p>{customerCopy(f.answer)}</p>
            </details>
          ))}
        </div>
      </section>
      <div className="section-divider" aria-hidden="true" />
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
          <Link to="/tra-don-hang" className="button primary">
            Hỗ trợ đơn hàng <Icon name="headset" />
          </Link>
          <Link to="/ho-tro" className="text-link">
            Câu hỏi thường gặp <Icon name="arrow" />
          </Link>
          <FeedbackButton className="text-link" />
        </div>
      </section>
    </Root>
  );
}
