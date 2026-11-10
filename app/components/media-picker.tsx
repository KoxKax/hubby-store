import { useId, useState } from "react";
import { Link } from "react-router";
import { normalizeSearch } from "../domain/catalog";

export interface MediaRecord {
  id: string;
  alt: string;
  status: string;
  source_license: string;
}

export function MediaPicker({
  records = [],
  value,
  onPick,
  emptyText,
}: {
  records?: MediaRecord[];
  value?: string;
  onPick: (media: { src: string; alt: string }) => void;
  emptyText?: string;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const filtered = records.filter((m) =>
    normalizeSearch(m.alt).includes(normalizeSearch(query)),
  );
  return (
    <details className="admin-details media-picker">
      <summary>Chọn ảnh từ thư viện ({records.length})</summary>
      {records.length ? (
        <>
          <label htmlFor={id}>Tìm ảnh</label>
          <input
            id={id}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nhập mô tả ảnh"
          />
          <div className="admin-media-grid">
            {filtered.map((m) => (
              <button
                key={m.id}
                type="button"
                className="media-option"
                aria-pressed={value === `/media/${m.id}`}
                onClick={() => onPick({ src: `/media/${m.id}`, alt: m.alt })}
              >
                <img
                  src={`/media/${m.id}`}
                  alt=""
                  loading="lazy"
                  width="160"
                  height="100"
                />
                <span>{m.alt}</span>
                <small>
                  {m.status === "published" ? "Đã xuất bản" : "Ảnh nháp"}
                </small>
              </button>
            ))}
          </div>
          {!filtered.length && <p role="status">Không tìm thấy ảnh phù hợp.</p>}
        </>
      ) : emptyText ? (
        <p>{emptyText}</p>
      ) : (
        <p>
          Chưa có ảnh trong thư viện. <Link to="?tab=media">Tải ảnh lên</Link>,
          sau đó quay lại chọn ảnh cho nội dung.
        </p>
      )}
    </details>
  );
}
