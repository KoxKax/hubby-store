import { useEffect, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData, useNavigate } from "react-router";
import { AccountFavorite } from "../components/account-favorite";
import { useContent } from "../components/content-context";
import { Icon } from "../components/icons";
import { ProductDescription } from "../components/product-description";
import { useStore } from "../components/store-context";
import { ProductArt, ProductCard } from "../components/storefront";
import { customerCopy, customerProductDescription } from "../content/experience";
import { formatVnd } from "../domain/money";
import { publishedContent } from "../server/content-repository.server";

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const product = (await publishedContent(request, context)).products.find(
    (item) => item.slug === params.slug,
  );
  if (!product) throw new Response("Not found", { status: 404 });
  return { product };
}
export const meta: MetaFunction<typeof loader> = ({ loaderData: data }) => [
  {
    title: data
      ? `${data.product.name} — Hubby`
      : "Không tìm thấy sản phẩm — Hubby",
  },
  { name: "description", content: data?.product.tagline ?? "" },
];

export default function Product() {
  const data = useLoaderData<typeof loader>();
  const product =
    useContent().products.find((item) => item.id === data.product.id) ??
    data.product;
  return <ProductDetail key={product.id} product={product} />;
}

function ProductDetail({ product }: Awaited<ReturnType<typeof loader>>) {
  const content = useContent();
  const [selected, setSelected] = useState(product.variants[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const navigate = useNavigate();
  const store = useStore();
  useEffect(() => {
    if (store.ready) store.markViewed(product.id);
  }, [store.ready, store.markViewed, product.id]);
  const variant = product.variants.find((item) => item.id === selected);
  const priced = Boolean(variant && variant.priceConfigured !== false);
  const available = Boolean(variant && variant.stock > 0 && priced);
  const category = content.categories.find(
    (item) => item.id === product.category,
  );
  const description = customerProductDescription(product.description).trim();
  const tagline = customerCopy(product.tagline).trim();
  const normalize = (text: string) => text.toLocaleLowerCase("vi-VN").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const descriptionText = normalize(description);
  const hasBenefitSection = /(?:^|\n)\s*(?:tính năng(?: nổi bật)?|điểm nổi bật|lợi ích(?: nổi bật)?|quyền lợi(?: của gói)?|bạn nhận được(?: những)? (?:lợi ích|quyền lợi)|sản phẩm giúp bạn làm được gì\??)/imu.test(description);
  const features = hasBenefitSection
    ? []
    : [...new Set(product.features.map(customerCopy))].filter(
        (feature) => feature.trim() && !descriptionText.includes(normalize(feature)),
      );
  const receipt = product.terms?.receipt?.trim() ?? "";
  const activationNote = product.terms?.activationNote?.trim() ?? "";
  const warranty = product.terms?.warranty?.trim().replace(/[.!?]+$/, "") ?? "";
  const hasReceivingInstructions = /(?:^|\n)\s*(?:cách nhận(?: và (?:kích hoạt|đăng nhập))?|cách bắt đầu|hướng dẫn (?:nhận hàng|kích hoạt|đăng nhập)|chi tiết gói,? cách nhận và điều kiện sử dụng)/imu.test(description);
  const showReceipt = receipt && !hasReceivingInstructions && !descriptionText.includes(normalize(receipt));
  const showActivation =
    activationNote &&
    !hasReceivingInstructions &&
    activationNote !== receipt &&
    !descriptionText.includes(normalize(activationNote));
  const knownWarranty =
    warranty && !/^(?:liên hệ|cần xác nhận|đang cập nhật|chưa rõ)/i.test(warranty);
  const showWarranty =
    knownWarranty &&
    !/(?:^|\n)\s*(?:[•*\-]\s*)?(?:chính sách )?bảo hành\s*[:：]/imu.test(description) &&
    !descriptionText.includes(normalize(`Bảo hành: ${warranty}`)) &&
    !descriptionText.includes(normalize(`Bảo hành ${warranty}`));
  return (
    <main className="container detail-page" id="main" tabIndex={-1}>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/#san-pham">Sản phẩm</Link>
        <Icon name="chevron" />
        <Link to={`/?category=${product.category}#san-pham`}>
          {category?.name}
        </Link>
        <Icon name="chevron" />
        <span>{product.name}</span>
      </nav>
      <div className="product-detail-grid">
        <div>
          <ProductArt large product={product} />
        </div>
        <div className="detail-copy">
          <h1>{product.name}</h1>
          {tagline && !descriptionText.startsWith(normalize(tagline)) && (
            <p className="detail-tagline">{tagline}</p>
          )}
          <fieldset className="variant-fieldset">
            <legend>Chọn gói sản phẩm</legend>
            <div className="variant-options">
              {product.variants.map((item) => (
                <label
                  className={`variant-choice ${selected === item.id ? "selected" : ""}`}
                  key={item.id}
                >
                  <input
                    type="radio"
                    name="variant"
                    value={item.id}
                    checked={selected === item.id}
                    onChange={() => {
                      setSelected(item.id);
                      setQuantity(1);
                      setAdded(false);
                    }}
                  />
                  <span>{customerCopy(item.label)}</span>
                  {item.stock === 0 && item.priceConfigured !== false && (
                    <small>Hết hàng</small>
                  )}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="detail-price" aria-live="polite">
            {priced ? formatVnd(variant?.priceVnd ?? 0) : "Chưa có giá bán"}
          </div>
          <div className="detail-availability">
            <span className={`stock-dot ${available ? "" : "unavailable"}`} />
            {!priced
              ? "Gói này chưa có giá bán"
              : available
                ? "Còn hàng"
                : "Gói này hiện hết hàng"}
            <span>·</span>
            <Icon name="clock" />
            {customerCopy(product.deliveryLabel)}
          </div>
          {available && (
            <div className="detail-quantity">
              <label htmlFor="product-quantity">Số lượng</label>
              <div className="quantity-control">
                <button
                  type="button"
                  aria-label="Giảm số lượng"
                  disabled={!available || quantity <= 1}
                  onClick={() => setQuantity(quantity - 1)}
                >
                  <Icon name="minus" />
                </button>
                <input
                  id="product-quantity"
                  type="number"
                  min="1"
                  max={Math.max(1, Math.min(9, variant?.stock ?? 1))}
                  disabled={!available}
                  value={quantity}
                  onChange={(event) =>
                    setQuantity(
                      Math.max(
                        1,
                        Math.min(
                          9,
                          variant?.stock ?? 1,
                          Math.floor(Number(event.target.value) || 1),
                        ),
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  aria-label="Tăng số lượng"
                  disabled={
                    !available || quantity >= Math.min(9, variant?.stock ?? 1)
                  }
                  onClick={() => setQuantity(quantity + 1)}
                >
                  <Icon name="plus" />
                </button>
              </div>
            </div>
          )}
          {available ? (
            <div className="detail-ctas">
              <button
                className="button primary"
                type="button"
                disabled={!available || !store.ready}
                onClick={() =>
                  navigate(
                    `/thanh-toan?variant=${selected}&quantity=${quantity}`,
                  )
                }
              >
                Mua ngay
                <Icon name="arrow" />
              </button>
              <button
                className="button secondary"
                type="button"
                disabled={!available || !store.ready}
                onClick={() => {
                  setAdded(store.add(selected, quantity));
                }}
              >
                <Icon name={added ? "check" : "bag"} />
                {added ? "Đã thêm vào giỏ" : "Thêm vào giỏ"}
              </button>
            </div>
          ) : (
            <div className="unavailable-purchase" role="status">
              <p>
                {priced
                  ? "Gói này đang hết hàng. Bạn có thể xem các gói khác hoặc hỏi Hubby về sản phẩm."
                  : "Hubby sẽ cập nhật giá tại đây. Bạn có thể xem thông tin gói hoặc hỏi thêm trước khi chọn."}
              </p>
              <Link className="button secondary" to="/#ho-tro">
                Hỏi về gói này <Icon name="headset" />
              </Link>
            </div>
          )}
          <AccountFavorite productId={product.id} />
        </div>
      </div>
      <div className="detail-content-layout">
        <section className="detail-description" aria-labelledby="product-description-heading">
          <h2 id="product-description-heading">Thông tin sản phẩm</h2>
          {description && <ProductDescription text={description} productName={product.name} />}
          {features.length > 0 && (
            <div className="detail-benefits">
              <h3>Quyền lợi của gói</h3>
              <ul className="feature-list">
                {features.map((feature) => (
                  <li key={feature}><Icon name="check" />{feature}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      <aside className="detail-information" aria-label="Nhận hàng và hỗ trợ">
        {(showReceipt || showActivation) && (
          <article>
            <h2>Cách nhận sản phẩm</h2>
            {showReceipt && <p>{customerCopy(receipt)}</p>}
            {showActivation && <p>{customerCopy(activationNote)}</p>}
          </article>
        )}
        <article>
          <h2>Hỗ trợ đơn hàng</h2>
          {showWarranty && <p>Bảo hành: {warranty}.</p>}
          <p>
            Nếu gặp sự cố khi nhận hoặc sử dụng sản phẩm, bạn có thể tra đơn
            hàng và gửi yêu cầu để Hubby hỗ trợ.
          </p>
          <Link className="text-link" to="/tra-don-hang">
            Tra cứu đơn hàng
            <Icon name="arrow" />
          </Link>
        </article>
      </aside>
      </div>
      <section className="section related-section">
        <div className="section-heading">
          <div>
            <h2>Sản phẩm khác</h2>
          </div>
        </div>
        <div className="product-grid">
          {content.products
            .filter((item) => item.id !== product.id)
            .slice(0, 4)
            .map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
        </div>
      </section>
    </main>
  );
}
