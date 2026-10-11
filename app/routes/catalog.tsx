import type { MetaFunction } from "react-router";
import { Form, Link, useSearchParams } from "react-router";
import { useContent } from "../components/content-context";
import { Icon } from "../components/icons";
import { EmptyState, PageIntro, ProductCard } from "../components/storefront";
import { filterProducts } from "../domain/catalog";

export const meta: MetaFunction = () => [
  { title: "Danh mục tài khoản — Hubby" },
];

export default function Catalog({ fixedCategory }: { fixedCategory?: string }) {
  const content = useContent();
  const [params, setParams] = useSearchParams();
  const category = fixedCategory ?? params.get("category") ?? "";
  const q = params.get("q") ?? "";
  const available = params.get("available") === "1";
  const sort = params.get("sort") ?? "featured";
  const selectedCategory = content.categories.find(
    (item) => item.id === category,
  );
  const products = filterProducts(content.products, {
    q,
    category,
    available,
    sort,
  });
  const preview = params.get("preview");
  function update(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { preventScrollReset: true });
  }
  return (
    <main className="container catalog-page" id="main" tabIndex={-1}>
      <PageIntro
        eyebrow="TÀI KHOẢN & SUBSCRIPTION"
        title={selectedCategory?.name ?? "Chọn tài khoản của bạn."}
        description={selectedCategory?.description ?? content.shop.description}
      />
      <div className="catalog-toolbar">
        <Form className="catalog-search" method="get" role="search">
          <Icon name="search" />
          <input
            key={q}
            name="q"
            aria-label="Tìm trong bộ sưu tập"
            placeholder="Bạn đang tìm điều gì?"
            defaultValue={q}
          />
          {category && <input type="hidden" name="category" value={category} />}
          <button className="button secondary" type="submit">
            Tìm kiếm
          </button>
        </Form>
        <label className="sort-field">
          Sắp xếp
          <select
            aria-label="Sắp xếp sản phẩm"
            value={sort}
            onChange={(event) => update("sort", event.target.value)}
          >
            <option value="featured">Bộ sưu tập</option>
            <option value="price-asc">Giá tăng dần</option>
            <option value="price-desc">Giá giảm dần</option>
            <option value="name">Tên A–Z</option>
          </select>
        </label>
      </div>
      <div className="catalog-body">
        <aside className="catalog-sidebar">
          <h2>Danh mục</h2>
          <Link className={!category ? "selected" : ""} to="/san-pham">
            Tất cả sản phẩm <span>{content.products.length}</span>
          </Link>
          {content.categories.map((item) => (
            <Link
              className={category === item.id ? "selected" : ""}
              key={item.id}
              to={`/san-pham?category=${item.id}`}
            >
              <Icon name={item.icon} />
              {item.name}
              <span>
                {
                  content.products.filter(
                    (product) => product.category === item.id,
                  ).length
                }
              </span>
            </Link>
          ))}
          <div className="availability-filter">
            <label>
              <input
                type="checkbox"
                checked={available}
                onChange={(event) =>
                  update("available", event.target.checked ? "1" : "")
                }
              />
              Chỉ hiện gói còn hàng mẫu
            </label>
          </div>
          <div className="sidebar-note">
            <Icon name="sparkles" />
            <h3>Một chút cảm hứng?</h3>
            <p>Khám phá thứ phù hợp với phiên bản mới của bạn.</p>
            <Link to="/ho-tro">
              Cần Hubby giúp?
              <Icon name="arrow" />
            </Link>
          </div>
        </aside>
        <div className="catalog-results">
          <div className="results-caption">
            <span>
              {products.length} sản phẩm{q && <> cho “{q}”</>}
            </span>
            <span>Dữ liệu mẫu</span>
          </div>
          {preview === "error" ? (
            <EmptyState
              title="Chưa thể tải bộ sưu tập"
              description="Trạng thái lỗi mô phỏng. Thử tải lại để xem các sản phẩm mẫu."
              href="/san-pham"
              cta="Thử lại"
            />
          ) : preview === "loading" ? (
            <div
              className="product-grid"
              role="status"
              aria-label="Đang tải sản phẩm"
            >
              {[1, 2, 3, 4, 5, 6].map((id) => (
                <div className="product-skeleton" key={id}>
                  <div />
                  <span />
                  <span />
                </div>
              ))}
            </div>
          ) : products.length ? (
            <div className="product-grid">
              {products.map((product) => (
                <ProductCard product={product} key={product.id} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Chưa tìm thấy điều bạn cần."
              description="Thử một từ khóa khác hoặc khám phá lại toàn bộ bộ sưu tập."
              cta="Xóa bộ lọc"
            />
          )}
        </div>
      </div>
    </main>
  );
}
