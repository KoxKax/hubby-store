import { useState } from "react";
import type { MetaFunction } from "react-router";
import { Link } from "react-router";
import { useContent } from "../components/content-context";
import { Icon } from "../components/icons";
import { useStore } from "../components/store-context";
import { EmptyState, PageIntro, ProductArt } from "../components/storefront";
import { findVariant } from "../content/fixtures";
import { cartSubtotal, demoDiscount } from "../domain/demo-cart";
import { calculateLineTotal, formatVnd } from "../domain/money";

export const meta: MetaFunction = () => [{ title: "Giỏ hàng của bạn — Hubby" }];

export default function Cart() {
  const content = useContent();
  const store = useStore();
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState("");
  const [message, setMessage] = useState("");
  const subtotal = cartSubtotal(store.lines, content);
  const discount = demoDiscount(subtotal, applied, content);
  return (
    <main className="container cart-page" id="main" tabIndex={-1}>
      <PageIntro
        eyebrow="YOUR LITTLE UPGRADES"
        title="Lựa chọn của bạn."
        description="Một bước nữa để ngày thường có thêm chút khác biệt."
      />
      {!store.ready ? (
        <div className="empty-state" role="status">
          Đang mở giỏ hàng…
        </div>
      ) : !store.lines.length ? (
        <EmptyState
          title="Giỏ hàng đang chờ một điều mới."
          description="Dạo một vòng bộ sưu tập và chọn trải nghiệm bạn muốn thử."
        />
      ) : (
        <div className="cart-grid">
          <section className="cart-items" aria-label="Sản phẩm trong giỏ">
            <div className="cart-table-caption">
              <span>
                {store.lines.reduce((sum, line) => sum + line.quantity, 0)} lựa
                chọn trong giỏ
              </span>
              <span>Giá VND</span>
            </div>
            {store.lines.map((line) => {
              const found = findVariant(line.variantId, content);
              if (!found) return null;
              const { product, variant } = found;
              return (
                <article className="cart-row" key={variant.id}>
                  <Link
                    className="cart-thumbnail"
                    to={`/san-pham/${product.slug}`}
                    aria-label={`Xem ${product.name}`}
                  >
                    <ProductArt product={product} />
                  </Link>
                  <div className="cart-item-copy">
                    <Link to={`/san-pham/${product.slug}`}>{product.name}</Link>
                    <p>
                      {variant.label} · {product.deliveryLabel}
                    </p>
                    <span>{formatVnd(variant.priceVnd)} / gói</span>
                    <button
                      type="button"
                      className="remove-link"
                      onClick={() => store.setQuantity(variant.id, 0)}
                    >
                      Xóa {product.name}
                    </button>
                  </div>
                  <div className="cart-row-controls">
                    <div className="quantity-control">
                      <button
                        type="button"
                        aria-label={`Giảm ${product.name}`}
                        disabled={line.quantity <= 1}
                        onClick={() =>
                          store.setQuantity(variant.id, line.quantity - 1)
                        }
                      >
                        <Icon name="minus" />
                      </button>
                      <span
                        role="status"
                        aria-label={`Số lượng ${product.name}`}
                      >
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label={`Tăng ${product.name}`}
                        disabled={line.quantity >= Math.min(9, variant.stock)}
                        onClick={() =>
                          store.setQuantity(variant.id, line.quantity + 1)
                        }
                      >
                        <Icon name="plus" />
                      </button>
                    </div>
                    <strong>
                      {formatVnd(
                        calculateLineTotal(variant.priceVnd, line.quantity),
                      )}
                    </strong>
                  </div>
                </article>
              );
            })}
            <Link className="text-link continue-shopping" to="/#san-pham">
              <Icon name="arrow" style={{ transform: "rotate(180deg)" }} />
              Tiếp tục khám phá
            </Link>
          </section>
          <aside className="order-summary">
            <p className="eyebrow">YOUR SELECTION</p>
            <h2>Tóm tắt lựa chọn</h2>
            <div className="summary-line">
              <span>Tạm tính</span>
              <span>{formatVnd(subtotal)}</span>
            </div>
            <form
              className="coupon-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (code.trim().toUpperCase() === content.coupon.code) {
                  setApplied(code);
                  setMessage("Đã áp dụng ưu đãi.");
                } else {
                  setApplied("");
                  setMessage("Mã ưu đãi chưa hợp lệ.");
                }
              }}
            >
              <label htmlFor="coupon">Mã ưu đãi</label>
              <div>
                <input
                  id="coupon"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder={content.coupon.code}
                />
                <button type="submit" className="button secondary">
                  Áp dụng
                </button>
              </div>
              <p className="coupon-hint">
                {content.coupon.code}: giảm {content.coupon.percent}%, tối đa{" "}
                {formatVnd(content.coupon.maxDiscountVnd)}.
              </p>
              <p role="status" className="form-message">
                {message}
              </p>
            </form>
            {discount > 0 && (
              <div className="summary-line discount-line">
                <span>Ưu đãi</span>
                <span>−{formatVnd(discount)}</span>
              </div>
            )}
            <div className="summary-total">
              <span>Tổng cộng</span>
              <strong>{formatVnd(subtotal - discount)}</strong>
            </div>
            <Link
              className="button primary full-width"
              to={`/thanh-toan${applied ? `?coupon=${encodeURIComponent(applied)}` : ""}`}
            >
              Tiếp tục
              <Icon name="arrow" />
            </Link>
            <p className="demo-inline">
              <Icon name="shield" />
              Giá và tình trạng gói được kiểm tra lại khi đặt đơn.
            </p>
          </aside>
        </div>
      )}
    </main>
  );
}
