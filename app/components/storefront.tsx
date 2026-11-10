import { useEffect, useState } from "react";
import { Link, Outlet, useNavigation, useLocation, useRevalidator } from "react-router";
import { customerCopy, experienceOf } from "../content/experience";
import type { DemoProduct } from "../content/types";
import { brandImage } from "../content/visual-assets";
import { formatVnd } from "../domain/money";
import { useContent } from "./content-context";
import {
  ActivityNotifications,
  FeedbackButton,
  ThemeToggle,
} from "./engagement";
import { Icon } from "./icons";
import { ProductSearch } from "./product-search";
import { AccountAccess, SupportDock } from "./shop-extras";
import { useStore } from "./store-context";

export function ProductArt({
  product,
  large = false,
}: {
  product: DemoProduct;
  large?: boolean;
}) {
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const media = product.media;
  function imageFailed(src: string) {
    setFailedImages((current) =>
      current.includes(src) ? current : [...current, src].slice(-8),
    );
  }
  const officialImage = brandImage(product);
  if (media && !failedImages.includes(media.src))
    return (
      <div className={`product-art media-art ${large ? "art-large" : ""}`}>
        <img
          src={media.src}
          alt={media.alt}
          loading={large ? "eager" : "lazy"}
          decoding="async"
          onError={() => imageFailed(media.src)}
        />
      </div>
    );
  if (officialImage && !failedImages.includes(officialImage))
    return (
      <div
        className={`product-art brand-art brand-art-${product.id} ${large ? "art-large" : ""}`}
      >
        <span className="brand-art-shape" aria-hidden="true" />
        <img
          src={officialImage}
          srcSet={`${officialImage.replace("320", "160")} 160w, ${officialImage} 320w`}
          sizes={large ? "160px" : product.id === "office" ? "180px" : "72px"}
          alt=""
          width="72"
          height="72"
          loading={large ? "eager" : "lazy"}
          decoding="async"
          onError={() => imageFailed(officialImage)}
        />
        <strong>{product.name}</strong>
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
  const priced = product.variants.filter((v) => v.priceConfigured !== false);
  const available = priced.some((variant) => variant.stock > 0);
  const minimum = Math.min(...priced.map((variant) => variant.priceVnd));
  const tagline = customerCopy(product.tagline).trim();
  const deliveryLabel = customerCopy(product.deliveryLabel).trim();
  // The card is a short product overview; the detail page explains delivery.
  // Fall back to the delivery label only when no product summary was provided.
  const cardSummary = tagline || deliveryLabel;
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
            {!available && priced.length > 0
              ? "Hết hàng"
              : customerCopy(product.badge ?? "")}
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
        {cardSummary && <p className="product-tagline">{cardSummary}</p>}
        <div className="product-bottom">
          <span>
            {priced.length ? (
              <>
                {priced.length > 1 && <small>Từ</small>} {formatVnd(minimum)}
              </>
            ) : (
              <span className="price-pending">Chưa có giá bán</span>
            )}
          </span>
          <Link
            className="product-open"
            to={`/san-pham/${product.slug}`}
            aria-label={`Xem chi tiết ${product.name}`}
          >
            <Icon name="arrow" />
          </Link>
        </div>
      </div>
    </article>
  );
}

export function StorefrontLayout() {
  const location = useLocation();
  const revalidator = useRevalidator();
  useEffect(() => {
    if (location.pathname !== "/" && !location.pathname.startsWith("/san-pham/")) return;
    const refresh = () => {
      if (document.visibilityState === "visible" && revalidator.state === "idle") void revalidator.revalidate();
    };
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [location.pathname, revalidator]);
  const content = useContent();
  const store = useStore();
  const navigation = useNavigation();
  const settings = experienceOf(content);
  const [noticeIndex, setNoticeIndex] = useState(0);
  useEffect(() => {
    if (
      settings.notices.length < 2 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const timer = setInterval(
      () => setNoticeIndex((n) => (n + 1) % settings.notices.length),
      6500,
    );
    return () => clearInterval(timer);
  }, [settings.notices.length]);
  const notice = settings.notices[noticeIndex % settings.notices.length];
  const count = store.lines.reduce((sum, line) => sum + line.quantity, 0);
  return (
    <>
      <div className="star-field" aria-hidden="true">
        {Array.from({ length: 38 }, (_, n) => {
          const colors = [
            "p-violet",
            "p-cyan",
            "p-rose",
            "p-amber",
            "p-emerald",
            "p-blue",
          ];
          const motions = ["m-float", "m-sway", "m-pulse", "m-drift"];
          const sizes = [
            "s-sm",
            "s-md",
            "s-sm",
            "s-lg",
            "s-sm",
            "s-orb",
            "s-md",
          ];
          const colorClass = colors[n % colors.length] ?? "p-violet";
          const motionClass = motions[n % motions.length] ?? "m-float";
          const sizeClass = sizes[n % sizes.length] ?? "s-sm";
          return (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative particles never reordered.
              key={`star-${n}`}
              className={`particle ${colorClass} ${motionClass} ${sizeClass}`}
              style={{
                left: `${(n * 31 + 4) % 97}%`,
                top: `${(n * 23 + 6) % 96}%`,
                animationDelay: `${-((n * 0.9) % 12)}s`,
                animationDuration: `${12 + (n % 8) * 2}s`,
              }}
            />
          );
        })}
      </div>
      <a className="skip-link" href="#main">
        Đi đến nội dung
      </a>
      <div className="announcement">
        <Link to={notice?.href ?? "/#san-pham"} key={noticeIndex}>
          {customerCopy(notice?.text ?? content.announcement.text)}
          <Icon name="arrow" />
        </Link>
      </div>
      <header className="header">
        <div className="container header-inner">
          <Link to="/" className="wordmark" aria-label="Hubby — Trang chủ">
            {content.brand.name}
            <span>✳</span>
          </Link>
          <ProductSearch />
          <div className="header-actions">
            <details className="language-picker">
              <summary aria-label="Ngôn ngữ">
                VN <Icon name="chevron" />
              </summary>
              <div>
                <strong>Tiếng Việt · VND</strong>
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
            <p>{customerCopy(content.brand.footer)}</p>
          </div>
          <div>
            <h3>Khám phá</h3>
            <Link to="/#san-pham">Tất cả sản phẩm</Link>
            {content.categories.map((category) => (
              <Link key={category.id} to={`/?category=${category.id}#san-pham`}>
                {category.name}
              </Link>
            ))}
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
