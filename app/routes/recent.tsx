import { useContent } from "../components/content-context";
import { useStore } from "../components/store-context";
import { EmptyState, PageIntro, ProductCard } from "../components/storefront";
export function meta() {
  return [{ title: "Sản phẩm vừa xem — Hubby" }];
}
export default function Recent() {
  const content = useContent(),
    store = useStore();
  const products = store.recentlyViewed.flatMap((id) => {
    const p = content.products.find((p) => p.id === id);
    return p ? [p] : [];
  });
  return (
    <main id="main" tabIndex={-1} className="container account-page">
      <PageIntro
        eyebrow="ĐÃ XEM"
        title="Sản phẩm vừa xem"
        description="Quay lại các gói bạn vừa xem trên trình duyệt này."
      />
      {!store.ready ? (
        <p role="status">Đang mở danh sách…</p>
      ) : products.length ? (
        <div className="product-grid">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="Chưa có sản phẩm vừa xem."
          description="Mở một sản phẩm để lưu vào danh sách này."
        />
      )}
    </main>
  );
}
