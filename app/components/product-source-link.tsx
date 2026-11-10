import { useState } from "react";
import { useFetcher } from "react-router";

export type PublishedSourceVariant = { id: string; variant_key: string };
export type ProductSourceBinding = {
  variantId: string;
  externalId: string;
  enabled: boolean;
  maxPending: number;
};
type SourceOffer = {
  id: string;
  name: string;
  price: string;
  currency: string | null;
  stock: number | null;
  delivery: string;
  eligible: boolean;
};
type SourceSearch = { ready: boolean; items: SourceOffer[]; total: number; page: number };
type SaveResult = {
  saved: boolean;
  message: string;
  binding?: ProductSourceBinding;
};

function sourcePrice(value: string, currency: string | null) {
  if (!/^\d+(\.\d+)?$/.test(value)) return "Chưa có giá";
  const [integer = "0", fraction = ""] = value.split(".");
  const decimals = fraction.replace(/0+$/, "");
  return `${BigInt(integer).toLocaleString("vi-VN")}${decimals ? `,${decimals}` : ""} ${currency ?? ""}`;
}

export function ProductSourceLink({
  variantKey,
  published,
  initialBinding,
  csrf,
  available,
  cmsChanged,
}: {
  variantKey: string;
  published?: PublishedSourceVariant;
  initialBinding?: ProductSourceBinding;
  csrf: string;
  available: boolean;
  cmsChanged: boolean;
}) {
  const searchFetcher = useFetcher();
  const saveFetcher = useFetcher();
  const saved = saveFetcher.data as SaveResult | undefined;
  const binding = saved?.saved && saved.binding?.variantId === published?.id
    ? saved.binding : initialBinding;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState(initialBinding?.externalId ?? "");
  const [enabled, setEnabled] = useState(initialBinding?.enabled ?? false);
  const [maxPending, setMaxPending] = useState(initialBinding?.maxPending ?? 20);
  const [confirmed, setConfirmed] = useState(false);
  const search = searchFetcher.data as SourceSearch | undefined;
  const totalPages = Math.max(1, Math.ceil((search?.total ?? 0) / 30));
  const selectedOffer = search?.items.find((item) => item.id === chosen);
  const busy = saveFetcher.state !== "idle";

  const fetchSources = (page: number, q = query) => {
    searchFetcher.load(`/admin/san-pham/nguon?q=${encodeURIComponent(q.trim())}&page=${page}`);
  };
  const showPicker = () => {
    if (!open) fetchSources(1);
    setOpen(!open);
  };

  return (
    <section className="product-source-link" aria-label="Nguồn cấp hàng cho gói">
      <div className="product-source-heading">
        <div>
          <strong>Nguồn cấp hàng</strong>
          <p className="product-source-state">
            {!published ? "Gói chưa xuất bản" : !available ? "Chưa kết nối nguồn hàng" :
              binding ? `Đã liên kết mã #${binding.externalId} · ${binding.enabled ? "Đã bật tự đặt hàng" : "Chưa bật tự đặt hàng"}` : "Chưa liên kết"}
          </p>
        </div>
        {published && available && (
          <button className="button secondary" type="button" aria-expanded={open} onClick={showPicker}>
            {open ? "Thu gọn" : binding ? "Đổi nguồn / cài đặt" : "Chọn sản phẩm nguồn"}
          </button>
        )}
      </div>
      {!published && <p>Lưu và xuất bản gói mới trước khi chọn nguồn hàng. Mỗi gói có một liên kết riêng.</p>}
      {published && !available && <p>Không tải được cấu hình nguồn hàng. Thử mở lại mục Sản phẩm khi kết nối sẵn sàng.</p>}
      {open && published && available && (
        <div className="product-source-picker">
          {cmsChanged && <p className="source-link-note">Có thay đổi sản phẩm chưa lưu. Liên kết nguồn được lưu riêng và có hiệu lực ngay với gói đang bán; tên và giá mới chỉ áp dụng sau khi xuất bản.</p>}
          <div className="product-source-search">
            <label>
              Tìm sản phẩm nguồn
              <input type="search" value={query} maxLength={100} placeholder="Nhập tên hoặc mã sản phẩm…"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); fetchSources(1); } }} />
            </label>
            <button className="button secondary" type="button" onClick={() => fetchSources(1)} disabled={searchFetcher.state !== "idle"}>Tìm</button>
          </div>
          {searchFetcher.state !== "idle" && <p role="status">Đang tìm sản phẩm…</p>}
          {search?.ready === false && <p>Danh sách nguồn hàng chưa sẵn sàng.</p>}
          {search?.ready && <>
            <div className="product-source-results" role="group" aria-label="Chọn một sản phẩm nguồn">
              {search.items.map((offer) => (
                <button type="button" key={offer.id}
                  className={`product-source-offer${chosen === offer.id ? " is-selected" : ""}`}
                  aria-pressed={chosen === offer.id}
                  onClick={() => { setChosen(offer.id); setEnabled(offer.id === binding?.externalId && !!binding.enabled); setConfirmed(false); }}>
                  <span className="product-source-offer-copy">
                    <strong>{offer.name}</strong>
                    <small>#{offer.id} · {sourcePrice(offer.price, offer.currency)} · {offer.stock === null ? "Tồn kho chưa rõ" : `Còn ${offer.stock}`}</small>
                    <small>{offer.eligible ? (offer.delivery === "manual" ? "Có thể tự đặt · Nguồn xử lý thủ công" : "Có thể bật tự đặt hàng") : "Chưa đủ điều kiện tự đặt hàng"}</small>
                  </span>
                  <span className="product-source-choice">{chosen === offer.id ? "✓ Đã chọn" : "Chọn"}</span>
                </button>
              ))}
              {!search.items.length && <p>Không tìm thấy sản phẩm. Hãy thử từ khóa khác.</p>}
            </div>
            {totalPages > 1 && <div className="product-source-pages">
              <button type="button" className="button secondary" disabled={search.page <= 1 || searchFetcher.state !== "idle"} onClick={() => fetchSources(search.page - 1)}>← Trước</button>
              <span>Trang {search.page}/{totalPages} · {search.total.toLocaleString("vi-VN")} sản phẩm</span>
              <button type="button" className="button secondary" disabled={search.page >= totalPages || searchFetcher.state !== "idle"} onClick={() => fetchSources(search.page + 1)}>Sau →</button>
            </div>}
          </>}
          {chosen && <div className="product-source-settings">
            <p><strong>Mã nguồn đã chọn:</strong> #{chosen} {selectedOffer ? `· ${selectedOffer.name}` : ""}</p>
            <label>
              Giới hạn đơn đang chờ xử lý
              <input type="number" min={1} max={100} step={1} value={maxPending} onChange={(e) => setMaxPending(Number(e.target.value))} />
            </label>
            <small>Số đơn tối đa được chờ nguồn cấp xử lý cùng lúc; không phải số lượng tồn kho.</small>
            <label className="source-check-row">
              <input type="checkbox" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); setConfirmed(false); }} />
              Tự mua từ nguồn sau khi khách thanh toán thành công
            </label>
            {enabled && selectedOffer?.delivery === "manual" && selectedOffer.eligible && <p className="source-link-note">Bite tiếp nhận đơn và xử lý sau. Hubby sẽ theo dõi tiến độ, chỉ giao khi nhận được kết quả hợp lệ. Nếu gói cần email hoặc thông tin riêng của khách, hãy đối chiếu cách nhận trước khi bật.</p>}
            {enabled && selectedOffer && !selectedOffer.eligible && <p className="source-link-note">Nguồn chưa đủ điều kiện tự đặt hàng (giá, tồn kho, hình thức giao hoặc dữ liệu đồng bộ). Bạn vẫn có thể lưu liên kết ở trạng thái tắt.</p>}
            <label className="source-check-row">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              Tôi đã đối chiếu đúng gói, thời hạn, cách nhận và giá nhập.
            </label>
            <button className="button primary" type="button" disabled={busy || !confirmed || maxPending < 1 || maxPending > 100 || (enabled && !!selectedOffer && !selectedOffer.eligible)}
              onClick={() => {
                saveFetcher.submit({ csrf, variantId: published.id, variantKey, externalId: chosen, maxPending: String(maxPending), enabled: enabled ? "yes" : "no", confirmed: confirmed ? "yes" : "no" }, { method: "post", action: "/admin/san-pham/nguon" });
                setConfirmed(false);
              }}>
              {busy ? "Đang lưu…" : "Lưu liên kết nguồn"}
            </button>
            {saved?.message && <p role="status" className={saved.saved ? "source-link-success" : "source-link-note"}>{saved.message}</p>}
          </div>}
        </div>
      )}
    </section>
  );
}
