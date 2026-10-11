import { useEffect, useState } from "react";
import {
  Form,
  Link,
  Outlet,
  useNavigation,
  useSearchParams,
} from "react-router";
import { customerCopy, experienceOf } from "../content/experience";
import type { DemoProduct } from "../content/types";
import { formatVnd } from "../domain/money";
import { useContent } from "./content-context";
import {
  ActivityNotifications,
  FeedbackButton,
  ThemeToggle,
} from "./engagement";
import { Icon } from "./icons";
import { AccountAccess, SupportDock } from "./shop-extras";
import { useStore } from "./store-context";

export function ProductArt({
  product,
  large = false,
}: {
  product: DemoProduct;
  large?: boolean;
}) {
  if (product.media)
    return (
      <div className={`product-art media-art ${large ? "art-large" : ""}`}>
        <img
          src={product.media.src}
          alt={product.media.alt}
          loading={large ? "eager" : "lazy"}
          decoding="async"
        />
      </div>
    );
  return (
    <div
      className={`product-art art-${product.art} product-${product.id} ${large ? "art-large" : ""}`}
      role="img"
      aria-label={product.name}
    >
      <span className="art-orbit" />
      <span className="art-orbit orbit-two" />
      <span className="art-word">
        {product.art === "google" ? (
          <>
            <span>G</span>
            <span>o</span>
            <span>o</span>
            <span>g</span>
            <span>l</span>
            <span>e</span>
          </>
        ) : (
          product.monogram
        )}
      </span>
      <span className="art-label">{product.name.toUpperCase()}</span>
      <span className="art-edition">HUBBY</span>
    </div>
  );
}

export function ProductCard({ product }: { product: DemoProduct }) {
  const content = useContent();
  const store = useStore();
  const available = product.variants.some((variant) => variant.stock > 0);
  const priced = product.variants.filter((v) => v.priceConfigured !== false);
  const minimum = Math.min(...priced.map((variant) => variant.priceVnd));
  return (
    <article className={`product-card brand-${product.art}`}>
      <div className="product-visual">
        <Link to={`/san-pham/${product.slug}`} tabIndex={-1} aria-hidden="true">
          <ProductArt product={product} />
        </Link>
        <button
          type="button"
          className={`favorite-button icon-button ${store.favorites.includes(product.id) ? "is-favorite" : ""}`}
          aria-label={`${store.favorites.includes(product.id) ? "Bỏ yêu thích" : "Yêu thích"} ${product.name}`}
          aria-pressed={store.favorites.includes(product.id)}
          onClick={() => store.toggleFavorite(product.id)}
        >
          <Icon name="heart" />
        </button>
        {(customerCopy(product.badge ?? "") ||
          (!available && priced.length > 0)) && (
          <span className="art-badge">
            {available ? customerCopy(product.badge ?? "") : "Hết hàng"}
          </span>
        )}
      </div>
      <div className="product-info">
        <p className="product-category">
          {
            content.categories.find(
              (category) => category.id === product.category,
            )?.name
          }
        </p>
        <h3>
          <Link to={`/san-pham/${product.slug}`}>
            {product.name}
            <Icon name="arrow" />
          </Link>
        </h3>
        <p className="product-tagline">{product.tagline}</p>
        {!product.tagline.includes(product.deliveryLabel) && (
          <p className="product-plan-count">{product.deliveryLabel}</p>
        )}
        <div className="product-bottom">
          <span>
            {priced.length ? (
              <>
                <small>Từ</small> {formatVnd(minimum)}
              </>
            ) : (
              "Chưa niêm yết giá"
            )}
          </span>
          {priced.length > 0 && (
            <span
              role="img"
              className={`stock-dot ${available ? "" : "unavailable"}`}
              aria-label={available ? "Còn hàng" : "Hết hàng"}
            />
          )}
        </div>
      </div>
    </article>
  );
}

export function StorefrontLayout() {
  const content = useContent();
  const store = useStore();
  const navigation = useNavigation();
  const settings = experienceOf(content);
  const [params] = useSearchParams();
  const [noticeIndex, setNoticeIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (
      paused ||
      settings.notices.length < 2 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const timer = setInterval(
      () => setNoticeIndex((n) => (n + 1) % settings.notices.length),
      6500,
    );
    return () => clearInterval(timer);
  }, [paused, settings.notices.length]);
  const notice = settings.notices[noticeIndex % settings.notices.length];
  const count = store.lines.reduce((sum, line) => sum + line.quantity, 0);
  return (
    <>
      <div className="star-field" aria-hidden="true">
        {Array.from({ length: 26 }, (_, n) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative particles never reordered.
            key={`star-${n}`}
            style={{
              left: `${(n * 37 + 7) % 100}%`,
              top: `${(n * 23 + 11) % 100}%`,
              animationDelay: `${-n * 0.8}s`,
              animationDuration: `${10 + (n % 7)}s`,
            }}
          />
        ))}
      </div>
      <a className="skip-link" href="#main">
        Đi đến nội dung
      </a>
      <div className="announcement">
        <Link to={notice?.href ?? "/#san-pham"} key={noticeIndex}>
          {notice?.text ?? content.announcement.text}
          <Icon name="arrow" />
        </Link>
        {settings.notices.length > 1 && (
          <button
            type="button"
            className="notice-pause"
            aria-label={paused ? "Tiếp tục thông báo" : "Tạm dừng thông báo"}
            onClick={() => setPaused(!paused)}
          >
            {paused ? "▷" : "Ⅱ"}
          </button>
        )}
      </div>
      <header className="header">
        <div className="container header-inner">
          <Link to="/" className="wordmark" aria-label="Hubby — Trang chủ">
            {content.brand.name}
            <span>✳</span>
          </Link>
          <Form
            action="/"
            method="get"
            className="header-search main-search"
            role="search"
          >
            <Icon name="search" />
            <input
              key={params.get("q")}
              name="q"
              aria-label="Tìm sản phẩm"
              placeholder={content.shop.searchPlaceholder}
              defaultValue={params.get("q") ?? ""}
            />
            <button type="submit" aria-label="Tìm kiếm">
              <Icon name="arrow" />
            </button>
          </Form>
          <div className="header-actions">
            <details className="language-picker">
              <summary aria-label="Ngôn ngữ">
                VN <Icon name="chevron" />
              </summary>
              <div>
                <strong>Tiếng Việt · VND</strong>
                <span>English đang được chuẩn bị</span>
              </div>
            </details>
            <Link
              to="/tra-don-hang"
              className="header-lookup"
              aria-label="Tra đơn hàng"
            >
              <Icon name="layers" />
              <span>Tra đơn hàng</span>
            </Link>
            <AccountAccess />
            <ThemeToggle />
            <Link
              to="/gio-hang"
              className="cart-link icon-button"
              aria-label={`Giỏ hàng, ${count} sản phẩm`}
            >
              <Icon name="bag" />
              <span className="cart-count">{count}</span>
            </Link>
          </div>
        </div>
      </header>
      {navigation.state !== "idle" && (
        <div className="navigation-progress" role="status">
          Đang tải trang…
        </div>
      )}
      <Outlet />
      <footer className="footer">
        <div className="container footer-main">
          <div className="footer-brand">
            <Link className="wordmark" to="/">
              {content.brand.name}
              <span>✳</span>
            </Link>
            <p>{content.brand.footer}</p>
          </div>
          <div>
            <h3>Khám phá</h3>
            <Link to="/#san-pham">Tất cả sản phẩm</Link>
            <Link to="/?category=ai#san-pham">Sáng tạo</Link>
            <Link to="/?category=entertainment#san-pham">Giải trí</Link>
          </div>
          <div>
            <h3>Hỗ trợ & chính sách</h3>
            <Link to="/#ho-tro">Liên hệ hỗ trợ</Link>
            <Link to="/tra-don-hang">Tra đơn hàng</Link>
            <FeedbackButton />
            {content.policies.map((policy) => (
              <Link key={policy.slug} to={`/chinh-sach/${policy.slug}`}>
                {policy.title}
              </Link>
            ))}
          </div>
        </div>
        <div className="container footer-bottom">
          <span>© 2026 Hubby</span>
          <span>
            Sáng tạo · Làm việc · Giải trí{" "}
            <span className="tiny-spark"> ✳</span>
          </span>
        </div>
      </footer>
      <SupportDock />
      <ActivityNotifications />
      <div
        className={`toast ${store.notice ? "is-visible" : ""}`}
        role="status"
        aria-live="polite"
      >
        {store.notice && (
          <>
            <Icon name="check" />
            {store.notice}
            <Link to="/gio-hang">Xem giỏ</Link>
          </>
        )}
      </div>
    </>
  );
}

export function PageIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-intro">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  href = "/#san-pham",
  cta = "Khám phá sản phẩm",
}: {
  title: string;
  description: string;
  href?: string;
  cta?: string;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon name="bag" />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      <Link className="button primary" to={href}>
        {cta}
        <Icon name="arrow" />
      </Link>
    </div>
  );
}
