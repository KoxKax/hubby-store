import { useEffect, useState } from "react";
import { Form, Link, useSearchParams } from "react-router";
import { brandImage } from "../content/visual-assets";
import { customerCopy } from "../content/experience";
import { filterProducts } from "../domain/catalog";
import { useContent } from "./content-context";
import { Icon } from "./icons";

export function ProductSearch() {
  const content = useContent();
  const [params] = useSearchParams();
  const query = params.get("q") ?? "";
  const [value, setValue] = useState(query);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);
  useEffect(() => {
    setValue(query);
    setOpen(false);
  }, [query]);
  const results = filterProducts(content.products, {
    q: value,
    category: "",
    available: false,
    sort: "featured",
  });
  return (
    <search
      className="search-shell"
      aria-label="Tìm sản phẩm"
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <Form
        action="/#san-pham"
        method="get"
        className="header-search main-search"
        onSubmit={() => setOpen(false)}
      >
        <Icon name="search" />
        <input
          name="q"
          aria-label="Tìm sản phẩm"
          placeholder={customerCopy(content.shop.searchPlaceholder)}
          value={value}
          maxLength={120}
          autoComplete="off"
          onChange={(event) => {
            setValue(event.target.value);
            setOpen(true);
          }}
        />
        {value && (
          <button
            type="button"
            aria-label="Xóa từ khóa tìm kiếm"
            onClick={() => setValue("")}
          >
            <Icon name="close" />
          </button>
        )}
        <button type="submit" aria-label="Tìm kiếm">
          <Icon name="arrow" />
        </button>
      </Form>
      {open && value.trim() && (
        <section className="search-panel" aria-label="Sản phẩm phù hợp">
          <p className="search-panel-heading">
            {results.length
              ? `${results.length} sản phẩm phù hợp`
              : "Chưa tìm thấy sản phẩm"}
          </p>
          <ul>
            {results.slice(0, 5).map((product) => (
              <li key={product.id}>
                <Link
                  to={`/san-pham/${product.slug}`}
                  onClick={() => setOpen(false)}
                >
                  {(product.media?.src || brandImage(product)) && (
                    <img
                      src={product.media?.src ?? brandImage(product)}
                      alt=""
                      width="40"
                      height="40"
                    />
                  )}
                  <span>
                    <strong>{product.name}</strong>
                    <small>{customerCopy(product.tagline)}</small>
                  </span>
                  <Icon name="arrow" />
                </Link>
              </li>
            ))}
          </ul>
          <Link
            className="search-all"
            to={
              results.length
                ? `/?q=${encodeURIComponent(value)}#san-pham`
                : "/#san-pham"
            }
            onClick={() => setOpen(false)}
          >
            {results.length ? "Xem kết quả tìm kiếm" : "Xem tất cả sản phẩm"}
            <Icon name="arrow" />
          </Link>
        </section>
      )}
    </search>
  );
}
