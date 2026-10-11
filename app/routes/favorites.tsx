import { useContent } from "../components/content-context";
import { useStore } from "../components/store-context";
import { EmptyState, PageIntro, ProductCard } from "../components/storefront";
export function meta() {
  return [{ title: "Những lựa chọn yêu thích — Hubby" }];
}
export default function Favorites() {
  const store = useStore();
  const products = useContent().products.filter((product) =>
    store.favorites.includes(product.id),
  );
  return (
    <main className="container favorites-page" id="main" tabIndex={-1}>
      <PageIntro
        eyebrow="SAVED FOR LATER"
        title="Những điều bạn thích."
        description="Lưu lại chút cảm hứng cho lần ghé thăm tiếp theo."
      />
      {!store.ready ? (
        <p role="status">Đang tải lựa chọn mẫu…</p>
      ) : products.length ? (
        <div className="product-grid">
          {products.map((product) => (
            <ProductCard product={product} key={product.id} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="Chưa có sản phẩm yêu thích."
          description="Chạm biểu tượng trái tim trên một sản phẩm để lưu lại trên trình duyệt này."
        />
      )}
    </main>
  );
}
