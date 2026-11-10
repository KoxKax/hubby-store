import { useState } from "react";
import { Form, Link } from "react-router";

type Product = {
  externalId: string;
  name: string;
  description: string;
  editorialDescription: string | null;
  editorialStatus: "ready" | "verify" | "needs_review" | null;
  category: string;
  price: string;
  previousPrice: string | null;
  normalPrice: string | null;
  currency: string | null;
  stock: number | null;
  inStock: boolean;
  active: boolean;
  delivery: string;
  promotion: string;
  syncedAt: string;
};
type Binding = { externalId: string; variantId: string; enabled: boolean; maxPending: number };
type Variant = { id: string; variant_key: string; label: string };

const sizes = [10, 20, 30, 50];
const browseUrl = (search: string, size: number, page: number) =>
  `?view=products&q=${encodeURIComponent(search)}&pageSize=${size}&page=${page}`;

function price(value: string | null, currency: string | null) {
  if (!value || !/^\d+(\.\d+)?$/.test(value)) return "Chưa có giá";
  const [integer = "0", fraction = ""] = value.split(".");
  const decimals = fraction.replace(/0+$/, "");
  return `${BigInt(integer).toLocaleString("vi-VN")}${decimals ? `,${decimals}` : ""} ${currency ?? "(chưa rõ đơn vị)"}`;
}

function Pagination({ search, size, page, total }: { search: string; size: number; page: number; total: number }) {
  const lastPage = Math.max(1, Math.ceil(total / size));
  const pages = [...new Set([1, lastPage, page - 2, page - 1, page, page + 1, page + 2])]
    .filter((n) => n >= 1 && n <= lastPage)
    .sort((a, b) => a - b);
  return (
    <nav className="source-pagination" aria-label="Phân trang sản phẩm nguồn">
      {page > 1 ? <Link to={browseUrl(search, size, page - 1)}>← Trước</Link> : <span className="source-page-disabled">← Trước</span>}
      {pages.map((value, index) => (
        <span key={value} className="source-page-slot">
          {index > 0 && value - (pages[index - 1] ?? 0) > 1 && <span className="source-page-ellipsis" aria-hidden="true">…</span>}
          <Link to={browseUrl(search, size, value)} aria-current={page === value ? "page" : undefined}>{value}</Link>
        </span>
      ))}
      {page < lastPage ? <Link to={browseUrl(search, size, page + 1)}>Sau →</Link> : <span className="source-page-disabled">Sau →</span>}
      <span className="source-page-total">Trang {page}/{lastPage}</span>
    </nav>
  );
}

const deliveryNames: Record<string, string> = {
  automatic: "Giao tự động",
  text: "Giao nội dung",
  manual: "Xử lý thủ công",
  file: "Giao qua tệp",
};

export function BiteProductBrowser({
  items, total, search, page, pageSize, csrf, busy, eligibleIds, bindings, variants,
}: {
  items: Product[];
  total: number;
  search: string;
  page: number;
  pageSize: number;
  csrf: string;
  busy: boolean;
  eligibleIds: string[];
  bindings: Binding[];
  variants: Variant[];
}) {
  const [editing, setEditing] = useState<{ id: string; kind: "copy" | "binding" } | null>(null);
  const switchEditor = (id: string, kind: "copy" | "binding") =>
    setEditing((old) => old?.id === id && old.kind === kind ? null : { id, kind });
  const from = total ? Math.min((page - 1) * pageSize + 1, total) : 0;
  const to = Math.min(page * pageSize, total);

  return (
    <>
      <Form method="get" className="source-browser-toolbar">
        <input type="hidden" name="view" value="products" />
        <label className="source-search-field">
          Tìm sản phẩm
          <input name="q" type="search" defaultValue={search} maxLength={100} placeholder="Tên, mã sản phẩm, danh mục…" />
        </label>
        <label className="source-page-size-field">
          Hiển thị mỗi trang
          <select name="pageSize" defaultValue={pageSize}>
            {sizes.map((size) => <option key={size} value={size}>{size} sản phẩm</option>)}
          </select>
        </label>
        <button type="submit" className="button secondary">Áp dụng</button>
        {search && <Link to={browseUrl("", pageSize, 1)} className="source-clear-search">Xóa tìm kiếm</Link>}
      </Form>
      <div className="source-list-heading">
        <p role="status"><strong>{total.toLocaleString("vi-VN")}</strong> sản phẩm · Hiển thị {from}–{to}</p>
        <Pagination search={search} size={pageSize} page={page} total={total} />
      </div>
      {items.length ? (
        <div className="table-scroll source-table-scroll">
          <table className="source-table">
            <thead><tr>
              <th scope="col">Sản phẩm</th>
              <th scope="col">Giá nhập</th>
              <th scope="col">Tồn kho</th>
              <th scope="col">Gói Hubby</th>
              <th scope="col">Quản lý</th>
            </tr></thead>
            <tbody>
              {items.flatMap((item) => {
                const current = editing?.id === item.externalId ? editing.kind : null;
                const existing = bindings.filter((binding) => binding.externalId === item.externalId);
                const copyStatus = item.editorialDescription
                  ? item.editorialStatus === "ready" ? "Đã duyệt" : item.editorialStatus === "verify" ? "Cần xác minh" : "Cần rà soát"
                  : "Chưa có bản tiếng Việt";
                const row = (
                  <tr key={item.externalId} className={current ? "source-row-open" : undefined}>
                    <td className="source-product-cell">
                      <div className="source-product-identity">
                        <div className="source-product-main">
                          <strong>{item.name}</strong>
                          <span className="source-product-sub">#{item.externalId} · {item.category || "Chưa phân loại"}</span>
                          <p className="source-product-description">{item.editorialDescription || item.description || "Chưa có mô tả"}</p>
                          <span className="source-product-sub">{copyStatus} · {deliveryNames[item.delivery] ?? (item.delivery || "Chưa rõ cách giao")}</span>
                        </div>
                      </div>
                    </td>
                    <td className="source-price-cell">
                      <strong>{price(item.price, item.currency)}</strong>
                      {item.normalPrice && item.normalPrice !== item.price && <small>Giá thường: {price(item.normalPrice, item.currency)}</small>}
                      {item.previousPrice && item.previousPrice !== item.price && <small>Giá lần trước: {price(item.previousPrice, item.currency)}</small>}
                    </td>
                    <td>
                      <span className={`source-status ${!item.active || !item.inStock || item.stock === 0 ? "source-status-off" : "source-status-on"}`}>
                        {!item.active ? "Ngừng bán" : !item.inStock || item.stock === 0 ? "Hết hàng" : item.stock == null ? "Còn hàng" : `Còn ${item.stock.toLocaleString("vi-VN")}`}
                      </span>
                      <small className="source-updated">Cập nhật {new Date(item.syncedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</small>
                    </td>
                    <td className="source-link-cell">
                      {existing.length ? existing.map((binding) => {
                        const variant = variants.find((v) => v.id === binding.variantId);
                        return <span key={binding.variantId} className="source-linked-item">
                          <strong>{variant?.label ?? variant?.variant_key ?? "Gói đã liên kết"}</strong>
                          <small>{binding.enabled ? "Tự đặt hàng đang bật" : "Chưa bật tự đặt hàng"}</small>
                        </span>;
                      }) : <span className="source-product-sub">Chưa liên kết</span>}
                    </td>
                    <td className="source-actions-cell">
                      <button type="button" className="source-action-link" aria-expanded={current === "copy"} onClick={() => switchEditor(item.externalId, "copy")}>Xem / sửa mô tả</button>
                      <button type="button" className="source-action-link" aria-expanded={current === "binding"} onClick={() => switchEditor(item.externalId, "binding")}>Liên kết gói</button>
                    </td>
                  </tr>
                );
                if (editing?.id !== item.externalId) return [row];
                const eligible = eligibleIds.includes(item.externalId);
                const single = existing.length === 1 ? existing[0] : undefined;
                return [row, (
                  <tr key={`${item.externalId}:editor`} className="source-editor-row">
                    <td colSpan={5}>
                      <div className="source-editor-heading">
                        <h3>{editing.kind === "copy" ? "Nội dung sản phẩm" : "Thiết lập liên kết"} · {item.name}</h3>
                        <button type="button" className="source-action-link" onClick={() => setEditing(null)}>Đóng ✕</button>
                      </div>
                      {editing.kind === "copy" ? (
                        <div className="source-editor-grid">
                          <Form method="post" className="form-stack">
                            <input type="hidden" name="csrf" value={csrf} />
                            <input type="hidden" name="intent" value="save_copy" />
                            <input type="hidden" name="externalId" value={item.externalId} />
                            <input type="hidden" name="q" value={search} />
                            <input type="hidden" name="page" value={page} />
                            <input type="hidden" name="pageSize" value={pageSize} />
                            <label>Mô tả tiếng Việt dành cho khách
                              <textarea name="description" rows={12} minLength={12} maxLength={3000} required defaultValue={item.editorialDescription ?? ""} />
                            </label>
                            <label>Trạng thái kiểm duyệt
                              <select name="status" defaultValue={item.editorialStatus ?? "needs_review"}>
                                <option value="needs_review">Cần rà soát</option>
                                <option value="verify">Cần xác minh quyền lợi</option>
                                <option value="ready">Đã kiểm tra nội dung và quyền lợi</option>
                              </select>
                            </label>
                            <button type="submit" className="button secondary" disabled={busy}>Lưu mô tả</button>
                          </Form>
                          <aside className="source-reference">
                            <h4>Mô tả gốc để đối chiếu</h4>
                            <p>{item.description || "Nguồn chưa cung cấp mô tả."}</p>
                            <p><strong>Cách giao:</strong> {deliveryNames[item.delivery] ?? (item.delivery || "Chưa có")}</p>
                            {item.promotion && <p><strong>Ưu đãi nguồn:</strong> {item.promotion}</p>}
                            <p><strong>Đồng bộ:</strong> {new Date(item.syncedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</p>
                          </aside>
                        </div>
                      ) : (
                        <Form method="post" className="source-binding-form form-stack">
                          <input type="hidden" name="csrf" value={csrf} />
                          <input type="hidden" name="intent" value="binding" />
                          <input type="hidden" name="externalId" value={item.externalId} />
                          <input type="hidden" name="returnView" value="products" />
                          <input type="hidden" name="q" value={search} />
                          <input type="hidden" name="page" value={page} />
                          <input type="hidden" name="pageSize" value={pageSize} />
                          {!eligible && <p role="status">Chưa đủ điều kiện bật tự đặt hàng: kiểm tra giá, tồn kho, cách giao và lần đồng bộ gần nhất. Vẫn có thể lưu liên kết để chuẩn bị.</p>}
                          <label>Gói đang bán trên Hubby
                            <select required name="variantId" defaultValue={single?.variantId ?? ""}>
                              <option value="" disabled>Chọn đúng gói và thời hạn</option>
                              {variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.variant_key} · {variant.label}</option>)}
                            </select>
                          </label>
                          <label>Giới hạn đơn đang chờ xử lý
                            <input required type="number" name="maxPending" min={1} max={100} defaultValue={single?.maxPending ?? 20} />
                          </label>
                          <small>Đây là số đơn được chờ xử lý cùng lúc, không phải số lượng tồn kho.</small>
                          <label className="source-check-row"><input type="checkbox" name="enabled" value="yes" disabled={!eligible} defaultChecked={eligible && !!single?.enabled} /> Tự đặt hàng sau khi Hubby xác nhận khách đã thanh toán</label>
                          <label className="source-check-row"><input required type="checkbox" name="confirmed" value="yes" /> Tôi đã kiểm tra đúng sản phẩm, thời hạn, cách nhận và giá nhập</label>
                          <button type="submit" className="button secondary" disabled={busy}>Lưu liên kết</button>
                        </Form>
                      )}
                    </td>
                  </tr>
                )];
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="source-empty">Không tìm thấy sản phẩm. Thử tên khác hoặc bỏ bộ lọc tìm kiếm.</p>}
      <div className="source-list-footer">
        <span>Hiển thị {from}–{to} / {total.toLocaleString("vi-VN")} sản phẩm</span>
        <Pagination search={search} size={pageSize} page={page} total={total} />
      </div>
    </>
  );
}
