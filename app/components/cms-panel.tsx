import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link, useBlocker, useSearchParams } from "react-router";
import { refreshLegacyCmsCopy } from "../content/cms-copy-refresh";
import { productDescriptionSuggestions } from "../content/product-description-suggestions";
import { validateContent } from "../content/schema";
import type { DemoProduct, StorefrontContent } from "../content/types";
import type { CmsRevision } from "../domain/cms";
import {
  type ProductPriceFilter,
  workspaceProducts,
} from "../domain/cms-workspace";
import { imageKind } from "../domain/media";
import { formatVnd } from "../domain/money";
import Home from "../routes/home";
import { AdminShell, cmsSections } from "./admin-shell";
import { PreviewContent } from "./content-context";
import { ExperienceEditor } from "./experience-editor";
import { MediaPicker, type MediaRecord } from "./media-picker";
import { ProductDescription } from "./product-description";
import {
  ProductSourceLink,
  type ProductSourceBinding,
  type PublishedSourceVariant,
} from "./product-source-link";
import { ProductArt } from "./storefront";

export type { MediaRecord } from "./media-picker";

interface Props {
  mode: "sandbox" | "staging";
  revision: CmsRevision;
  history: CmsRevision[];
  publishedId: string | null;
  headVersion: number;
  onSave: (content: StorefrontContent) => void;
  onPublish: (id: string) => void;
  onRestore: (id: string) => void;
  feedback?: string;
  busy?: boolean;
  mediaRecords?: MediaRecord[];
  uploadBusy?: boolean;
  uploadFeedback?: string;
  sourceVariants?: PublishedSourceVariant[];
  sourceBindings?: ProductSourceBinding[];
  sourceAvailable?: boolean;
  sourceCsrf?: string;
  uploadedMedia?: {
    id: string;
    src: string;
    alt: string;
    productId: string | null;
  };
  onUpload?: (
    file: File,
    alt: string,
    license: string,
    productId?: string,
  ) => void;
}

function MediaUpload({
  busy = false,
  onUpload,
  productId,
}: {
  busy?: boolean;
  onUpload?: Props["onUpload"];
  productId?: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [license, setLicense] = useState("");
  const [error, setError] = useState("");
  return (
    <div className="admin-media-upload">
      <h3>Tải ảnh mới {productId ? "cho sản phẩm" : "vào thư viện"}</h3>
      <p>PNG, JPEG, WebP hoặc AVIF tối đa 2MB; cần có quyền sử dụng ảnh.</p>
      <label>
        Chọn tệp ảnh
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/avif"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setError("");
          }}
        />
      </label>
      <label>
        Mô tả ảnh
        <input
          value={alt}
          maxLength={160}
          onChange={(event) => setAlt(event.target.value)}
        />
      </label>
      <label>
        Nguồn / quyền sử dụng
        <input
          value={license}
          maxLength={500}
          onChange={(event) => setLicense(event.target.value)}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button
        className="button secondary"
        type="button"
        disabled={busy || !onUpload}
        onClick={() => {
          if (
            !file ||
            file.size < 12 ||
            file.size > 2_097_152 ||
            !["image/png", "image/jpeg", "image/webp", "image/avif"].includes(
              file.type,
            ) ||
            !alt.trim() ||
            !license.trim()
          ) {
            setError(
              "Chọn ảnh hợp lệ tối đa 2MB, nhập mô tả và nguồn/quyền sử dụng.",
            );
            return;
          }
          onUpload?.(file, alt.trim(), license.trim(), productId);
          setError("");
        }}
      >
        {busy
          ? "Đang tải ảnh…"
          : productId
            ? "Tải lên và chọn cho sản phẩm"
            : "Tải vào thư viện"}
      </button>
    </div>
  );
}

function ProductMediaEditor({
  product,
  selected,
  edit,
  mode,
  localImage,
  records,
  onUpload,
  uploadBusy,
}: {
  product: DemoProduct;
  selected: string;
  edit: (change: (content: StorefrontContent) => void) => void;
  mode: Props["mode"];
  localImage: (file: File | undefined) => Promise<void>;
  records?: MediaRecord[];
  onUpload?: Props["onUpload"];
  uploadBusy?: boolean;
}) {
  return (
    <section className="admin-product-media">
      <h3>Ảnh đại diện sản phẩm</h3>
      <p>
        Chọn ảnh có sẵn hoặc tải ảnh mới. Ảnh chỉ xuất hiện trên cửa hàng sau
        khi lưu nháp và xuất bản.
      </p>
      {product.media ? (
        <>
          <img
            className="admin-media-preview"
            src={product.media.src}
            alt={product.media.alt}
          />
          <label>
            Mô tả ảnh đang chọn
            <input
              value={product.media.alt}
              onChange={(event) =>
                edit((content) => {
                  const media = content.products.find(
                    (item) => item.id === selected,
                  )?.media;
                  if (media) media.alt = event.target.value;
                })
              }
              maxLength={160}
            />
          </label>
          <button
            className="text-link"
            type="button"
            onClick={() =>
              edit((content) => {
                const item = content.products.find(
                  (entry) => entry.id === selected,
                );
                if (item) delete item.media;
              })
            }
          >
            Bỏ ảnh khỏi sản phẩm trong bản nháp
          </button>
        </>
      ) : (
        <p>Chưa chọn ảnh riêng; cửa hàng sử dụng ảnh mặc định nếu có.</p>
      )}
      {mode === "sandbox" ? (
        <label>
          Chọn ảnh local (tối đa 250KB)
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/avif"
            onChange={(event) => void localImage(event.target.files?.[0])}
          />
        </label>
      ) : (
        <>
          <MediaPicker
            records={records}
            value={product.media?.src}
            emptyText="Thư viện chưa có ảnh. Bạn có thể tải ảnh ngay bên dưới."
            onPick={(media) =>
              edit((content) => {
                const item = content.products.find(
                  (entry) => entry.id === selected,
                );
                if (item) item.media = media;
              })
            }
          />
          <MediaUpload
            key={selected}
            busy={uploadBusy}
            onUpload={onUpload}
            productId={selected}
          />
        </>
      )}
    </section>
  );
}
export function CmsPanel(props: Props) {
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab") ?? "dashboard";
  const tab = cmsSections.some((s) => s.id === requested)
    ? requested
    : "dashboard";
  const [draft, setDraft] = useState(() =>
    structuredClone(props.revision.snapshot),
  );
  const [selected, setSelected] = useState(draft.products[0]?.id ?? "");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [priceFilter, setPriceFilter] = useState<ProductPriceFilter>("all");
  const [editing, setEditing] = useState(false);
  const legacySuggestions = refreshLegacyCmsCopy(draft).count;
  const editorHeading = useRef<HTMLHeadingElement>(null);
  // A completed upload must not reattach an old image after a CMS save remount.
  const lastUpload = useRef(props.uploadedMedia?.id ?? null);
  useEffect(() => {
    const uploaded = props.uploadedMedia;
    if (!uploaded || lastUpload.current === uploaded.id) return;
    lastUpload.current = uploaded.id;
    if (!uploaded.productId) return;
    setDraft((current) => {
      if (!current.products.some((item) => item.id === uploaded.productId))
        return current;
      const next = structuredClone(current);
      const item = next.products.find(
        (entry) => entry.id === uploaded.productId,
      );
      if (item) item.media = { src: uploaded.src, alt: uploaded.alt };
      return next;
    });
    setNotice("Đã chọn ảnh vừa tải lên. Lưu bản nháp rồi xuất bản để áp dụng.");
  }, [props.uploadedMedia]);
  const visibleProducts = workspaceProducts(
    draft.products,
    productQuery,
    productCategory,
    priceFilter,
  );
  useEffect(() => {
    if (editing && tab === "products" && selected)
      editorHeading.current?.focus();
  }, [editing, selected, tab]);
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(props.revision.snapshot);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const product = draft.products.find((p) => p.id === selected);
  const descriptionSuggestion = product
    ? productDescriptionSuggestions[product.id]
    : undefined;
  function edit(change: (content: StorefrontContent) => void) {
    setDraft((current) => {
      const next = structuredClone(current);
      change(next);
      return next;
    });
    setNotice("");
  }
  function run(work: () => void) {
    try {
      work();
      setNotice("");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Không thể lưu thay đổi.",
      );
    }
  }
  function save(event: FormEvent) {
    event.preventDefault();
    run(() => props.onSave(validateContent(draft, props.mode === "sandbox")));
  }
  async function localImage(file: File | undefined, banner = false) {
    if (!file || (!product && !banner)) return;
    try {
      if (file.size > 250_000)
        throw new Error(
          "Ảnh tải trực tiếp trên bản thử nghiệm không được vượt quá 250 KB.",
        );
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mime = imageKind(bytes);
      if (!mime || mime !== file.type)
        throw new Error(
          "Chỉ nhận PNG, JPEG, WebP hoặc AVIF hợp lệ; không SVG/HTML.",
        );
      const reader = new FileReader();
      reader.onload = () => {
        const src = String(reader.result);
        edit((p) => {
          if (banner) {
            p.announcement.media = { src, alt: "Ảnh banner mẫu Hubby" };
            return;
          }
          const item = p.products.find((x) => x.id === selected);
          if (item) item.media = { src, alt: `Ảnh sản phẩm ${item.name}` };
        });
        setNotice(
          "Ảnh đang ở bản chỉnh sửa. Lưu nháp rồi áp dụng local để xem trên cửa hàng.",
        );
      };
      reader.readAsDataURL(file);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Chưa đọc được ảnh.");
    }
  }
  return (
    <AdminShell
      mode={props.mode}
      section={tab}
      onSection={(id) => {
        const next = new URLSearchParams(params);
        next.set("tab", id);
        setParams(next, { preventScrollReset: true });
      }}
    >
      <div className="admin-page wp-cms">
        <div className="admin-heading">
          <div>
            <p className="wp-breadcrumb">Hubby / Quản trị</p>
            <h1>{cmsSections.find((s) => s.id === tab)?.label}</h1>
            <p>
              {dirty
                ? "Có chỉnh sửa chưa lưu"
                : props.revision.id === props.publishedId
                  ? "Nội dung đang được áp dụng"
                  : "Đang làm việc trên bản nháp"}{" "}
              · Phiên bản {props.headVersion}
            </p>
          </div>
          <div className="admin-actions">
            {tab !== "dashboard" && tab !== "history" && (
              <button
                className="button primary"
                type="submit"
                form="cms-editor-form"
                disabled={props.busy || !dirty}
              >
                {props.busy ? "Đang lưu…" : "Lưu bản nháp"}
              </button>
            )}
            <Link className="button secondary" to="/">
              Xem cửa hàng
            </Link>
          </div>
        </div>
        <div className="admin-notice">
          {props.mode === "sandbox"
            ? "CMS thử nghiệm lưu trên máy chủ local của máy này, không phải đăng nhập Owner, không xuất bản lên Internet. Không nhập kho thật hoặc khóa bí mật. Lịch sử CMS trên trình duyệt cũ vẫn được giữ riêng, không tự ghi đè dữ liệu mới."
            : "Lưu bản nháp trước, sau đó xuất bản để cập nhật cửa hàng. Thanh toán và giao hàng được quản lý riêng trong mục Vận hành."}
        </div>
        {blocker.state === "blocked" && (
          <div className="wp-leave-warning" role="alert">
            <p>
              Bạn có chỉnh sửa chưa lưu. Lưu bản nháp trước khi rời trang để giữ
              thay đổi.
            </p>
            <button
              className="button primary"
              type="button"
              onClick={() => blocker.reset()}
            >
              Ở lại chỉnh sửa
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => blocker.proceed()}
            >
              Rời trang, bỏ chỉnh sửa chưa lưu
            </button>
          </div>
        )}
        {(notice || props.feedback || props.uploadFeedback) && (
          <div className="admin-message" role="status">
            {props.feedback || notice || props.uploadFeedback}
          </div>
        )}
        <div className="admin-editor-grid">
          <form
            id="cms-editor-form"
            onSubmit={save}
            className="admin-form admin-panel"
          >
            {tab === "dashboard" && (
              <>
                <h2>Chào bạn, bắt đầu từ đâu?</h2>
                <div className="wp-dashboard-metrics">
                  {[
                    ["Sản phẩm", draft.products.length],
                    [
                      "Gói dịch vụ",
                      draft.products.flatMap((p) => p.variants).length,
                    ],
                    ["Danh mục", draft.categories.length],
                  ].map(([label, value]) => (
                    <article key={label}>
                      <strong>{value}</strong>
                      <span>{label}</span>
                    </article>
                  ))}
                </div>
                <div className="wp-quick-actions">
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => setParams({ tab: "products" })}
                  >
                    Quản lý sản phẩm
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setParams({ tab: "home" })}
                  >
                    Chỉnh trang chủ
                  </button>
                </div>
                <h3>Trạng thái nội dung</h3>
                <p>
                  {props.revision.id === props.publishedId
                    ? "Bản mới nhất đã được áp dụng trên cửa hàng."
                    : "Có bản nháp đã lưu, chưa áp dụng trên cửa hàng."}
                </p>
                <p>
                  Lưu nháp để giữ chỉnh sửa. Xem trước và xuất bản khi nội dung
                  đã sẵn sàng.
                </p>
                {props.mode === "sandbox" && (
                  <Link
                    to="/admin-demo/operations?tab=overview"
                    className="text-link"
                  >
                    Xem báo cáo và vận hành →
                  </Link>
                )}
              </>
            )}
            {tab === "home" && (
              <ExperienceEditor
                draft={draft}
                edit={edit}
                mode={props.mode}
                mediaRecords={props.mediaRecords}
              />
            )}
            {tab === "content" && (
              <>
                <section className="admin-panel">
                  <h2>Rà soát nội dung cũ</h2>
                  <p>
                    Có {legacySuggestions} chỗ còn dùng câu chữ từ bản dựng ban
                    đầu. Gợi ý chỉ sửa những câu cũ chưa được bạn chỉnh, bao gồm
                    hướng dẫn mua hàng, câu hỏi thường gặp và chính sách. Giá,
                    hình ảnh, sản phẩm và các bản nháp riêng được giữ nguyên.
                  </p>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={legacySuggestions === 0 || props.busy}
                    onClick={() => {
                      const result = refreshLegacyCmsCopy(draft);
                      setDraft(result.content);
                      setNotice(
                        `Đã đưa ${result.count} gợi ý vào bản đang chỉnh sửa. Hãy đọc lại rồi Lưu bản nháp và Xuất bản khi sẵn sàng.`,
                      );
                    }}
                  >
                    Áp dụng gợi ý vào bản đang chỉnh sửa
                  </button>
                </section>
                {props.mode === "sandbox" && (
                  <section>
                    <h2>Ảnh banner dự phòng</h2>
                    <p>
                      Chỉ hiển thị khi tab Trang chủ chưa có ảnh banner. Để thêm
                      nhiều ảnh tự chuyển, dùng tab Trang chủ. Tối đa 250KB.
                    </p>
                    <label>
                      Ảnh banner local
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/avif"
                        onChange={(e) =>
                          void localImage(e.target.files?.[0], true)
                        }
                      />
                    </label>
                    {draft.announcement.media && (
                      <>
                        <img
                          src={draft.announcement.media.src}
                          alt={draft.announcement.media.alt}
                          style={{
                            width: "100%",
                            maxHeight: 180,
                            objectFit: "cover",
                          }}
                        />
                        <label>
                          Alt banner
                          <input
                            value={draft.announcement.media.alt}
                            maxLength={160}
                            onChange={(e) =>
                              edit((p) => {
                                if (p.announcement.media)
                                  p.announcement.media.alt = e.target.value;
                              })
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() =>
                            edit((p) => {
                              delete p.announcement.media;
                            })
                          }
                        >
                          Bỏ ảnh banner trong nháp
                        </button>
                      </>
                    )}
                  </section>
                )}
                <h2>Trang chủ & banner</h2>
                <label>
                  Tiêu đề cửa hàng
                  <input
                    value={draft.shop.title}
                    onChange={(e) =>
                      edit((p) => {
                        p.shop.title = e.target.value;
                      })
                    }
                    maxLength={120}
                    required
                  />
                </label>
                <label>
                  Dòng nhấn
                  <input
                    value={draft.shop.accent}
                    onChange={(e) =>
                      edit((p) => {
                        p.shop.accent = e.target.value;
                      })
                    }
                    maxLength={120}
                    required
                  />
                </label>
                <label>
                  Mô tả SEO
                  <textarea
                    value={draft.shop.description}
                    onChange={(e) =>
                      edit((p) => {
                        p.shop.description = e.target.value;
                      })
                    }
                    maxLength={320}
                    required
                  />
                </label>
                <label>
                  Banner thông báo
                  <input
                    value={draft.announcement.text}
                    onChange={(e) =>
                      edit((p) => {
                        p.announcement.text = e.target.value;
                      })
                    }
                    maxLength={180}
                    required
                  />
                </label>
                <div className="admin-field-row">
                  <label>
                    Chữ nút banner
                    <input
                      value={draft.announcement.cta}
                      onChange={(e) =>
                        edit((p) => {
                          p.announcement.cta = e.target.value;
                        })
                      }
                      maxLength={80}
                      required
                    />
                  </label>
                  <label>
                    Đường dẫn nội bộ
                    <input
                      value={draft.announcement.href}
                      onChange={(e) =>
                        edit((p) => {
                          p.announcement.href = e.target.value;
                        })
                      }
                      required
                    />
                  </label>
                </div>
                <label>
                  Mô tả footer
                  <textarea
                    value={draft.brand.footer}
                    onChange={(e) =>
                      edit((p) => {
                        p.brand.footer = e.target.value;
                      })
                    }
                    maxLength={240}
                    required
                  />
                </label>
                <label>
                  Fanpage HTTPS (để trống nếu chưa có)
                  <input
                    type="url"
                    value={draft.support.fanpageUrl ?? ""}
                    onChange={(e) =>
                      edit((p) => {
                        p.support.fanpageUrl = e.target.value || null;
                      })
                    }
                  />
                </label>
                <h2>Các khối nội dung</h2>
                {draft.sections.map((section) => (
                  <div
                    className="admin-section-row admin-content-section-row"
                    key={section.id}
                  >
                    <label>
                      Tiêu đề khối
                      <input
                        value={section.title}
                        maxLength={160}
                        required
                        onChange={(e) =>
                          edit((p) => {
                            const item = p.sections.find(
                              (s) => s.id === section.id,
                            );
                            if (item) item.title = e.target.value;
                          })
                        }
                      />
                    </label>
                    <label>
                      Dòng mô tả
                      <textarea
                        value={section.subtitle}
                        maxLength={320}
                        required
                        onChange={(e) =>
                          edit((p) => {
                            const item = p.sections.find(
                              (s) => s.id === section.id,
                            );
                            if (item) item.subtitle = e.target.value;
                          })
                        }
                      />
                    </label>
                    <label className="admin-checkbox">
                      <input
                        type="checkbox"
                        checked={section.enabled}
                        onChange={(e) =>
                          edit((p) => {
                            const item = p.sections.find(
                              (s) => s.id === section.id,
                            );
                            if (item) item.enabled = e.target.checked;
                          })
                        }
                      />
                      {section.title}
                    </label>
                    <label>
                      Thứ tự
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={section.sortOrder}
                        onChange={(e) =>
                          edit((p) => {
                            const item = p.sections.find(
                              (s) => s.id === section.id,
                            );
                            if (item) item.sortOrder = Number(e.target.value);
                          })
                        }
                      />
                    </label>
                  </div>
                ))}
                <h2>Các bước mua hàng</h2>
                {draft.steps.map((step, index) => (
                  <div
                    key={index}
                    className="admin-section-row admin-copy-step-row"
                  >
                    <label>
                      Bước {index + 1}
                      <input
                        value={step.title}
                        required
                        maxLength={120}
                        onChange={(e) =>
                          edit((p) => {
                            const item = p.steps[index];
                            if (item) item.title = e.target.value;
                          })
                        }
                      />
                    </label>
                    <label>
                      Hướng dẫn
                      <textarea
                        value={step.description}
                        required
                        maxLength={320}
                        onChange={(e) =>
                          edit((p) => {
                            const item = p.steps[index];
                            if (item) item.description = e.target.value;
                          })
                        }
                      />
                    </label>
                  </div>
                ))}
                <h2>Liên hệ và hỗ trợ</h2>
                <label>
                  Tiêu đề hỗ trợ
                  <input
                    value={draft.support.title}
                    maxLength={160}
                    required
                    onChange={(e) =>
                      edit((p) => {
                        p.support.title = e.target.value;
                      })
                    }
                  />
                </label>
                <label>
                  Hướng dẫn liên hệ
                  <textarea
                    value={draft.support.description}
                    maxLength={320}
                    required
                    onChange={(e) =>
                      edit((p) => {
                        p.support.description = e.target.value;
                      })
                    }
                  />
                </label>
                <h2>Mã ưu đãi (chưa dùng cho thanh toán thật)</h2>
                <p className="field-hint">
                  Các thông số này hiện chỉ dùng khi chạy cửa hàng mô phỏng trên
                  máy. Thanh toán payOS chưa hỗ trợ mã giảm giá nên khách mua
                  hàng thật sẽ không thấy ô nhập mã. Đừng công bố mã cho khách
                  đến khi hệ thống tính và xác nhận ưu đãi ở máy chủ.
                </p>
                <div className="admin-field-row">
                  <label>
                    Mã
                    <input
                      value={draft.coupon.code}
                      onChange={(e) =>
                        edit((p) => {
                          p.coupon.code = e.target.value.toUpperCase();
                        })
                      }
                      maxLength={30}
                    />
                  </label>
                  <label>
                    Phần trăm
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={draft.coupon.percent}
                      onChange={(e) =>
                        edit((p) => {
                          p.coupon.percent = Number(e.target.value);
                        })
                      }
                    />
                  </label>
                  <label>
                    Giảm tối đa (VND)
                    <input
                      type="number"
                      min={0}
                      max={1_000_000_000}
                      value={draft.coupon.maxDiscountVnd}
                      onChange={(e) =>
                        edit((p) => {
                          p.coupon.maxDiscountVnd = Number(e.target.value);
                        })
                      }
                    />
                  </label>
                </div>
                <details className="admin-details">
                  <summary>FAQ & chính sách</summary>
                  {draft.faqs.map((faq, index) => (
                    <div key={index}>
                      <label>
                        Câu hỏi {index + 1}
                        <input
                          value={faq.question}
                          maxLength={320}
                          required
                          onChange={(e) =>
                            edit((p) => {
                              const item = p.faqs[index];
                              if (item) item.question = e.target.value;
                            })
                          }
                        />
                      </label>
                      <label>
                        Trả lời
                        <textarea
                          value={faq.answer}
                          onChange={(e) =>
                            edit((p) => {
                              const item = p.faqs[index];
                              if (item) item.answer = e.target.value;
                            })
                          }
                          maxLength={2000}
                          required
                        />
                      </label>
                    </div>
                  ))}
                  {draft.policies.map((policy) => (
                    <label key={policy.slug}>
                      {policy.title}
                      <textarea
                        value={policy.body}
                        onChange={(e) =>
                          edit((p) => {
                            const item = p.policies.find(
                              (x) => x.slug === policy.slug,
                            );
                            if (item) item.body = e.target.value;
                          })
                        }
                        maxLength={10000}
                      />
                    </label>
                  ))}
                </details>
              </>
            )}
            {tab === "products" && (
              <>
                {tab === "products" && (
                  <div className="admin-actions">
                    <button
                      type="button"
                      className="button secondary"
                      disabled={draft.products.length >= 19}
                      onClick={() => {
                        const id = `product-${crypto.randomUUID().slice(0, 8)}`;
                        edit((p) => {
                          const template = p.products[0];
                          if (!template) return;
                          p.products.push({
                            ...structuredClone(template),
                            id,
                            slug: id,
                            name: "Sản phẩm mới",
                            monogram: "Hubby",
                            badge: undefined,
                            terms: undefined,
                            features: ["Điền thông tin sản phẩm"],
                            tagline: "Điền mô tả ngắn của sản phẩm.",
                            description:
                              "Điền mô tả, cách nhận và điều kiện sử dụng của sản phẩm trước khi xuất bản.",
                            media: undefined,
                            variants: [
                              {
                                id: `${id}-1`,
                                label: "Gói mới",
                                priceVnd: 0,
                                priceConfigured: false,
                                stock: 0,
                              },
                            ],
                          });
                          const featured = p.sections.find(
                            (s) => s.kind === "featured",
                          );
                          featured?.productIds?.push(id);
                        });
                        setSelected(id);
                        setEditing(true);
                      }}
                    >
                      Thêm sản phẩm
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={draft.products.length <= 1 || !editing}
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Ẩn ${product?.name ?? "sản phẩm"} khỏi bản nháp? Cửa hàng chỉ thay đổi sau khi xuất bản. Lịch sử phiên bản vẫn được giữ.`,
                          )
                        )
                          return;
                        const next =
                          draft.products.find((p) => p.id !== selected)?.id ??
                          "";
                        edit((p) => {
                          p.products = p.products.filter(
                            (x) => x.id !== selected,
                          );
                          for (const section of p.sections)
                            if (section.productIds)
                              section.productIds = section.productIds.filter(
                                (id) => id !== selected,
                              );
                        });
                        setSelected(next);
                        setEditing(false);
                      }}
                    >
                      Ẩn sản phẩm khỏi bản nháp
                    </button>
                  </div>
                )}
                {tab === "products" && (
                  <section className="wp-product-list">
                    <div className="wp-list-toolbar">
                      <h2>Tất cả sản phẩm ({draft.products.length})</h2>
                      <label>
                        Tìm sản phẩm trong CMS
                        <input
                          type="search"
                          value={productQuery}
                          onChange={(e) => setProductQuery(e.target.value)}
                          placeholder="Tên hoặc mã sản phẩm"
                        />
                      </label>
                    </div>
                    <div className="wp-product-filters">
                      <label>
                        Danh mục
                        <select
                          value={productCategory}
                          onChange={(event) =>
                            setProductCategory(event.target.value)
                          }
                        >
                          <option value="">Tất cả danh mục</option>
                          {draft.categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Giá bán
                        <select
                          value={priceFilter}
                          onChange={(event) =>
                            setPriceFilter(
                              event.target.value as ProductPriceFilter,
                            )
                          }
                        >
                          <option value="all">Tất cả sản phẩm</option>
                          <option value="priced">Đã có giá</option>
                          <option value="unpriced">Chưa có giá</option>
                        </select>
                      </label>
                      <span role="status">
                        {visibleProducts.length} / {draft.products.length} sản
                        phẩm
                      </span>
                    </div>
                    <div className="wp-table-scroll">
                      <table className="wp-table">
                        <caption>
                          Danh sách sản phẩm trong bản chỉnh sửa
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col">Sản phẩm</th>
                            <th scope="col">Danh mục</th>
                            <th scope="col">Gói</th>
                            <th scope="col">Giá từ</th>
                            <th scope="col">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleProducts.map((p) => {
                            const priced = p.variants.filter(
                              (v) => v.priceConfigured !== false,
                            );
                            return (
                              <tr
                                key={p.id}
                                className={
                                  selected === p.id ? "is-selected" : ""
                                }
                              >
                                <th scope="row">
                                  <div className="wp-product-cell">
                                    <span className="wp-product-thumb">
                                      <ProductArt product={p} />
                                    </span>
                                    <span>
                                      {p.name}
                                      <small>{p.id}</small>
                                    </span>
                                  </div>
                                </th>
                                <td>
                                  {
                                    draft.categories.find(
                                      (c) => c.id === p.category,
                                    )?.name
                                  }
                                </td>
                                <td>{p.variants.length}</td>
                                <td>
                                  {priced.length
                                    ? formatVnd(
                                        Math.min(
                                          ...priced.map((v) => v.priceVnd),
                                        ),
                                      )
                                    : "Chưa niêm yết"}
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    className="wp-row-action"
                                    aria-label={`Sửa ${p.name}`}
                                    onClick={() => {
                                      setSelected(p.id);
                                      setEditing(true);
                                    }}
                                  >
                                    Sửa
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {!visibleProducts.length && (
                      <div className="wp-empty-state" role="status">
                        <h3>Không tìm thấy sản phẩm</h3>
                        <p>Thử tên khác hoặc bỏ bớt bộ lọc.</p>
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() => {
                            setProductQuery("");
                            setProductCategory("");
                            setPriceFilter("all");
                          }}
                        >
                          Xóa bộ lọc
                        </button>
                      </div>
                    )}
                  </section>
                )}
                {editing && (
                  <label>
                    Sản phẩm
                    <select
                      value={selected}
                      onChange={(e) => setSelected(e.target.value)}
                    >
                      {draft.products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {product && editing && (
                  <>
                    <div className="wp-editor-heading">
                      <h2 ref={editorHeading} tabIndex={-1}>
                        Chỉnh sửa: {product.name}
                      </h2>
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => setEditing(false)}
                      >
                        Đóng chỉnh sửa
                      </button>
                    </div>
                    <ProductMediaEditor
                      product={product}
                      selected={selected}
                      edit={edit}
                      mode={props.mode}
                      localImage={(file) => localImage(file)}
                      records={props.mediaRecords}
                      onUpload={props.onUpload}
                      uploadBusy={props.uploadBusy}
                    />
                    <label>
                      Tên sản phẩm
                      <input
                        value={product.name}
                        onChange={(e) =>
                          edit((p) => {
                            const item = p.products.find(
                              (x) => x.id === selected,
                            );
                            if (item) item.name = e.target.value;
                          })
                        }
                        maxLength={80}
                        required
                      />
                    </label>
                    <label>
                      Đường dẫn sản phẩm
                      <input
                        value={product.slug}
                        maxLength={80}
                        pattern="[a-z0-9]+(-[a-z0-9]+)*"
                        required
                        onChange={(e) =>
                          edit((p) => {
                            const item = p.products.find(
                              (x) => x.id === selected,
                            );
                            if (item) item.slug = e.target.value;
                          })
                        }
                      />
                      <small>
                        Dùng chữ thường, số và dấu gạch nối. Đổi đường dẫn có
                        thể làm liên kết cũ không còn dùng được.
                      </small>
                    </label>
                    <label>
                      Mô tả ngắn
                      <input
                        value={product.tagline}
                        onChange={(e) =>
                          edit((p) => {
                            const item = p.products.find(
                              (x) => x.id === selected,
                            );
                            if (item) item.tagline = e.target.value;
                          })
                        }
                        maxLength={180}
                        required
                      />
                    </label>
                    <label>
                      Thông tin chi tiết
                      <textarea
                        value={product.description}
                        onChange={(e) =>
                          edit((p) => {
                            const item = p.products.find(
                              (x) => x.id === selected,
                            );
                            if (item) item.description = e.target.value;
                          })
                        }
                        maxLength={5000}
                        required
                      />
                    </label>
                    {descriptionSuggestion && (
                      <details className="admin-copy-suggestion">
                        <summary>
                          Gợi ý viết lại mô tả từ đối chiếu nguồn Bite
                        </summary>
                        <ProductDescription
                          text={descriptionSuggestion.description}
                        />
                        <p>
                          <strong>Đã tham khảo:</strong>{" "}
                          {descriptionSuggestion.biteReference}
                        </p>
                        <p role="note">
                          <strong>Lưu ý khác biệt:</strong>{" "}
                          {descriptionSuggestion.caution}
                        </p>
                        <p>
                          Bản viết lại dựa trên điều khoản đang công bố của
                          Hubby và các điểm cần phân biệt từ Bite. Không tự xác
                          nhận gói nguồn hay thay giá, gói, bảo hành. Xem thêm{" "}
                          <Link
                            to={`/admin/nguon-hang?q=${encodeURIComponent(product.name)}`}
                          >
                            danh sách sản phẩm nguồn
                          </Link>
                          .
                        </p>
                        <button
                          type="button"
                          className="button secondary"
                          disabled={
                            product.description ===
                            descriptionSuggestion.description
                          }
                          onClick={() => {
                            const suggested = descriptionSuggestion.description;
                            edit((content) => {
                              const item = content.products.find(
                                (entry) => entry.id === selected,
                              );
                              if (item) item.description = suggested;
                            });
                            setNotice(
                              "Đã điền mô tả đề xuất vào bản chỉnh sửa. Kiểm tra lại rồi lưu nháp, xuất bản khi sẵn sàng.",
                            );
                          }}
                        >
                          Điền mô tả đề xuất
                        </button>
                      </details>
                    )}
                    <label>
                      Danh mục
                      <select
                        value={product.category}
                        onChange={(e) =>
                          edit((p) => {
                            const item = p.products.find(
                              (x) => x.id === selected,
                            );
                            if (item) item.category = e.target.value;
                          })
                        }
                      >
                        {draft.categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Điểm nổi bật (mỗi dòng một ý)
                      <textarea
                        value={product.features.join("\n")}
                        onChange={(e) =>
                          edit((p) => {
                            const item = p.products.find(
                              (x) => x.id === selected,
                            );
                            if (item)
                              item.features = e.target.value.split("\n");
                          })
                        }
                        maxLength={2800}
                        required
                      />
                    </label>
                    <label>
                      Cách nhận sản phẩm
                      <input
                        value={product.deliveryLabel}
                        onChange={(e) =>
                          edit((p) => {
                            const item = p.products.find(
                              (x) => x.id === selected,
                            );
                            if (item) item.deliveryLabel = e.target.value;
                          })
                        }
                        maxLength={120}
                      />
                    </label>
                    <label className="admin-checkbox">
                      <input
                        type="checkbox"
                        checked={product.activationRequired}
                        onChange={(e) =>
                          edit((p) => {
                            const item = p.products.find(
                              (x) => x.id === selected,
                            );
                            if (item)
                              item.activationRequired = e.target.checked;
                          })
                        }
                      />
                      Cần thông tin kích hoạt
                    </label>
                    {!product.terms && (
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() =>
                          edit((p) => {
                            const item = p.products.find(
                              (x) => x.id === selected,
                            );
                            if (item)
                              item.terms = {
                                warranty: "",
                                receipt: "",
                                activationNote: "",
                              };
                          })
                        }
                      >
                        Thêm thông tin nhận hàng & bảo hành
                      </button>
                    )}
                    {product.terms &&
                      Object.entries(product.terms).map(([key, value]) => (
                        <label key={key}>
                          {
                            {
                              warranty: "Bảo hành",
                              receipt: "Hướng dẫn nhận",
                              activationNote: "Lưu ý kích hoạt",
                            }[key]
                          }
                          <textarea
                            value={value}
                            maxLength={key === "warranty" ? 240 : 500}
                            required
                            onChange={(e) =>
                              edit((p) => {
                                const item = p.products.find(
                                  (x) => x.id === selected,
                                );
                                if (item?.terms)
                                  item.terms[key as keyof typeof item.terms] =
                                    e.target.value;
                              })
                            }
                          />
                        </label>
                      ))}
                    <h2>Gói & giá</h2>
                    <p>
                      Thiết lập giá theo từng gói. Số lượng bên dưới chỉ dành
                      cho bản xem trước, không thay thế kho giao hàng.
                    </p>
                    {product.variants.map((variant) => (
                      <fieldset className="admin-variant" key={variant.id}>
                        <legend>{variant.label || "Gói mới"}</legend>
                        <label className="admin-checkbox">
                          <input
                            type="checkbox"
                            checked={variant.priceConfigured !== false}
                            onChange={(e) =>
                              edit((p) => {
                                const v = p.products
                                  .find((x) => x.id === selected)
                                  ?.variants.find((x) => x.id === variant.id);
                                if (v) v.priceConfigured = e.target.checked;
                              })
                            }
                          />{" "}
                          Đã chốt giá niêm yết
                        </label>
                        <label>
                          Tên gói
                          <input
                            value={variant.label}
                            onChange={(e) =>
                              edit((p) => {
                                const v = p.products
                                  .find((x) => x.id === selected)
                                  ?.variants.find((x) => x.id === variant.id);
                                if (v) v.label = e.target.value;
                              })
                            }
                            maxLength={80}
                            required
                          />
                        </label>
                        <div className="admin-field-row">
                          <label>
                            Giá (VND)
                            <input
                              type="number"
                              min={0}
                              max={1_000_000_000}
                              step={1}
                              value={variant.priceVnd}
                              onChange={(e) =>
                                edit((p) => {
                                  const v = p.products
                                    .find((x) => x.id === selected)
                                    ?.variants.find((x) => x.id === variant.id);
                                  if (v) v.priceVnd = Number(e.target.value);
                                })
                              }
                              required
                            />
                          </label>
                          <label>
                            Số lượng xem trước
                            <input
                              type="number"
                              min={0}
                              max={999}
                              step={1}
                              value={variant.stock}
                              onChange={(e) =>
                                edit((p) => {
                                  const v = p.products
                                    .find((x) => x.id === selected)
                                    ?.variants.find((x) => x.id === variant.id);
                                  if (v) v.stock = Number(e.target.value);
                                })
                              }
                              required
                            />
                          </label>
                        </div>
                        {props.mode === "staging" && (
                          <ProductSourceLink
                            variantKey={variant.id}
                            published={props.sourceVariants?.find((row) => row.variant_key === variant.id)}
                            initialBinding={props.sourceBindings?.find((row) =>
                              row.variantId === props.sourceVariants?.find((entry) => entry.variant_key === variant.id)?.id
                            )}
                            csrf={props.sourceCsrf ?? ""}
                            available={props.sourceAvailable === true}
                            cmsChanged={dirty}
                          />
                        )}
                        <button
                          className="text-link"
                          type="button"
                          disabled={product.variants.length <= 1}
                          onClick={() =>
                            edit((p) => {
                              const item = p.products.find(
                                (x) => x.id === selected,
                              );
                              if (item)
                                item.variants = item.variants.filter(
                                  (v) => v.id !== variant.id,
                                );
                            })
                          }
                        >
                          Bỏ gói khỏi bản nháp
                        </button>
                      </fieldset>
                    ))}
                    <button
                      type="button"
                      className="button secondary"
                      disabled={product.variants.length >= 8}
                      onClick={() =>
                        edit((p) => {
                          const item = p.products.find(
                            (x) => x.id === selected,
                          );
                          item?.variants.push({
                            id: `v-${crypto.randomUUID()}`,
                            label: "Gói mới",
                            priceVnd: 0,
                            priceConfigured: false,
                            stock: 0,
                          });
                        })
                      }
                    >
                      Thêm gói dịch vụ
                    </button>
                  </>
                )}
              </>
            )}
            {tab === "media" && (
              <section className="admin-media-library">
                <h2>Thư viện ảnh chung</h2>
                <p>
                  Ảnh đã lưu có thể dùng cho nhiều sản phẩm và banner. Để thay
                  ảnh của một sản phẩm, mở mục Sản phẩm → Sửa.
                </p>
                {props.mode !== "sandbox" ? (
                  <>
                    <MediaUpload
                      busy={props.uploadBusy}
                      onUpload={props.onUpload}
                    />
                    <h3>Ảnh đã tải lên ({props.mediaRecords?.length ?? 0})</h3>
                    <div className="admin-media-grid">
                      {props.mediaRecords?.map((media) => (
                        <figure className="media-option" key={media.id}>
                          <img
                            src={`/media/${media.id}`}
                            alt={media.alt}
                            loading="lazy"
                          />
                          <figcaption>{media.alt}</figcaption>
                          <small>
                            {media.status === "published"
                              ? "Đã xuất bản"
                              : "Ảnh nháp"}
                          </small>
                          <small>Nguồn: {media.source_license}</small>
                        </figure>
                      ))}
                    </div>
                    {!props.mediaRecords?.length && (
                      <p>Chưa có ảnh trong thư viện.</p>
                    )}
                  </>
                ) : (
                  <p>
                    Thư viện trên máy chủ chỉ có khi cấu hình môi trường lưu
                    trữ. Ảnh local có thể chọn trực tiếp khi sửa sản phẩm.
                  </p>
                )}
              </section>
            )}
            {tab === "history" && (
              <>
                <h2>Lịch sử phiên bản</h2>
                <p>Khôi phục tạo bản nháp mới; không ghi đè phiên bản cũ.</p>
                <div className="revision-list">
                  {props.history.map((revision) => (
                    <article key={revision.id}>
                      <div>
                        <strong>Phiên bản {revision.version}</strong>
                        <p>
                          {new Intl.DateTimeFormat("vi-VN", {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone: "Asia/Saigon",
                          }).format(new Date(revision.createdAt))}
                        </p>
                      </div>
                      <span className="revision-state">
                        {revision.id === props.publishedId
                          ? "Đang áp dụng"
                          : "Bản nháp / lịch sử"}
                      </span>
                      <button
                        type="button"
                        className="button secondary"
                        disabled={props.busy}
                        onClick={() => {
                          if (
                            dirty &&
                            !window.confirm(
                              "Bạn có chỉnh sửa chưa lưu. Bỏ các chỉnh sửa này và tạo bản nháp từ phiên bản đã chọn?",
                            )
                          )
                            return;
                          run(() => props.onRestore(revision.id));
                        }}
                      >
                        Tạo nháp từ bản này
                      </button>
                    </article>
                  ))}
                </div>
              </>
            )}
            {tab !== "history" && tab !== "dashboard" && (
              <div className="admin-actions">
                <button
                  className="button primary"
                  type="submit"
                  disabled={props.busy || !dirty}
                >
                  Lưu bản nháp
                </button>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() =>
                    run(() => {
                      validateContent(draft, props.mode === "sandbox");
                      setPreview(!preview);
                    })
                  }
                >
                  Xem trước chỉnh sửa
                </button>
              </div>
            )}
          </form>
          <aside className="admin-panel admin-summary">
            <p className="eyebrow">XUẤT BẢN</p>
            <h2>Phiên bản {props.headVersion}</h2>
            <span className="wp-status">
              {dirty
                ? "Chưa lưu"
                : props.revision.id === props.publishedId
                  ? "Đang áp dụng"
                  : "Bản nháp"}
            </span>
            <p>
              Lưu nháp không thay đổi cửa hàng. Chỉ bản nháp đã lưu mới có thể
              áp dụng.
            </p>
            <div>
              <span>{draft.products.length} sản phẩm</span>
              <span>
                {draft.products.flatMap((p) => p.variants).length} gói dịch vụ
              </span>
            </div>
            <button
              className="button primary"
              type="button"
              disabled={
                props.busy || dirty || props.revision.id === props.publishedId
              }
              onClick={() => run(() => props.onPublish(props.revision.id))}
            >
              {props.mode === "sandbox"
                ? "Áp dụng bản đã lưu local"
                : "Xuất bản thay đổi"}
            </button>
            <p>
              Xuất bản sẽ áp dụng nội dung trang, danh mục, sản phẩm và các gói
              trong bản nháp. Hãy kiểm tra giá, số lượng và điều kiện bán trước
              khi xuất bản. Thao tác này không tạo đơn hàng hoặc thu tiền.
            </p>
          </aside>
        </div>
        {preview && (
          <section className="admin-preview">
            <div className="admin-notice">
              Xem trước thay đổi chưa lưu — liên kết sẽ mở nội dung cửa hàng
              hiện tại.
            </div>
            <PreviewContent content={draft}>
              <Home preview />
            </PreviewContent>
          </section>
        )}
      </div>
    </AdminShell>
  );
}
