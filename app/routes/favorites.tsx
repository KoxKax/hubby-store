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
        eyebrow="YÊU THÍCH"
        title="Sản phẩm bạn đã lưu"
        description="Các gói bạn muốn xem lại. Danh sách được lưu trên trình duyệt này."
      />
      {!store.ready ? (
        <p role="status">Đang mở danh sách yêu thích…</p>
      ) : products.length ? (
        <div className="product-grid">
          {products.map((product) => (
            <ProductCard product={product} key={product.id} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="Chưa có sản phẩm yêu thích"
          description="Nhấn biểu tượng trái tim trên sản phẩm bạn quan tâm để lưu lại và xem sau trên trình duyệt này."
        />
      )}
    </main>
  );
}
