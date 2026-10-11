import { useEffect, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData, useNavigate } from "react-router";
import { useContent } from "../components/content-context";
import { Icon } from "../components/icons";
import { useStore } from "../components/store-context";
import { ProductArt, ProductCard } from "../components/storefront";
import { customerCopy } from "../content/experience";
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
  const priced = variant?.priceConfigured !== false;
  const available = Boolean(variant && variant.stock > 0 && priced);
  const category = content.categories.find(
    (item) => item.id === product.category,
  );
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
          <p className="eyebrow">{category?.name}</p>
          <h1>{product.name}</h1>
          <p className="detail-tagline">{product.tagline}</p>
          <div className="detail-price">
            {priced ? formatVnd(variant?.priceVnd ?? 0) : "Chưa niêm yết giá"}
            <span>/ {variant?.label}</span>
          </div>
          <p>{customerCopy(product.description)}</p>
          <fieldset className="variant-fieldset">
            <legend>Chọn thời hạn</legend>
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
                  <span>{item.label}</span>
                  {item.stock === 0 && item.priceConfigured !== false && (
                    <small>Hết hàng</small>
                  )}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="detail-availability">
            <span className={`stock-dot ${available ? "" : "unavailable"}`} />
            {!priced
              ? "Liên hệ Hubby để biết giá"
              : available
                ? "Còn hàng"
                : "Gói này hiện hết hàng"}
            <span>·</span>
            <Icon name="clock" />
            {customerCopy(product.deliveryLabel)}
          </div>
          <div className="detail-quantity">
            <label htmlFor="product-quantity">Số lượng</label>
            <div className="quantity-control">
              <button
                type="button"
                aria-label="Giảm số lượng"
                disabled={quantity <= 1}
                onClick={() => setQuantity(quantity - 1)}
              >
                <Icon name="minus" />
              </button>
              <input
                id="product-quantity"
                type="number"
                min="1"
                max={Math.min(9, variant?.stock ?? 1)}
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
          <div className="detail-ctas">
            <button
              className="button primary"
              type="button"
              disabled={!available || !store.ready}
              onClick={() =>
                navigate(`/thanh-toan?variant=${selected}&quantity=${quantity}`)
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
                store.add(selected, quantity);
                setAdded(true);
              }}
            >
              <Icon name={added ? "check" : "bag"} />
              {added ? "Đã thêm vào giỏ" : "Thêm vào giỏ"}
            </button>
          </div>
          {!priced && (
            <Link className="text-link" to="/#ho-tro">
              Hỏi về gói này <Icon name="arrow" />
            </Link>
          )}
          <ul className="feature-list">
            {product.features.map((feature) => (
              <li key={feature}>
                <Icon name="check" />
                {customerCopy(feature)}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="detail-information">
        <article>
          <h2>Cách nhận sản phẩm</h2>
          <p>
            {product.terms?.receipt ??
              (product.activationRequired
                ? "Đọc thông tin kích hoạt theo từng gói. Không cung cấp mật khẩu cá nhân hoặc mã xác thực cho người hỗ trợ."
                : "Giữ mã đơn để theo dõi thông tin nhận hàng và hướng dẫn sử dụng.")}
          </p>
          {product.terms && <p>{product.terms.activationNote}</p>}
        </article>
        <article>
          <h2>Bảo hành & lưu ý</h2>
          <p>
            {product.terms
              ? `Bảo hành: ${product.terms.warranty}.`
              : "Xem điều kiện bảo hành của gói trước khi mua."}
          </p>
          <Link className="text-link" to="/#faq">
            Xem câu hỏi thường gặp
            <Icon name="arrow" />
          </Link>
        </article>
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
