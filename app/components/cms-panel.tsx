import { type FormEvent, type ReactNode, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { validateContent } from "../content/schema";
import type { StorefrontContent } from "../content/types";
import type { CmsRevision } from "../domain/cms";
import { imageKind } from "../domain/media";
import Home from "../routes/home";
import { PreviewContent } from "./content-context";
import { ExperienceEditor } from "./experience-editor";

export interface MediaRecord {
  id: string;
  alt: string;
  status: string;
  source_license: string;
}
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
  uploadForm?: ReactNode;
}
const tabs = [
  { id: "home", label: "Trang chủ" },
  { id: "content", label: "Nội dung" },
  { id: "products", label: "Sản phẩm & gói" },
  { id: "media", label: "Media" },
  { id: "history", label: "Lịch sử" },
];
export function CmsPanel(props: Props) {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "content";
  const [draft, setDraft] = useState(() =>
    structuredClone(props.revision.snapshot),
  );
  const [selected, setSelected] = useState(draft.products[0]?.id ?? "");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(false);
  const product = draft.products.find((p) => p.id === selected);
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
      setNotice(
        props.mode === "sandbox"
          ? "Đã cập nhật CMS local."
          : "Đã gửi yêu cầu tới staging.",
      );
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
        throw new Error("Ảnh sandbox tối đa 250KB; staging hỗ trợ 2MB.");
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
    <main id="main" tabIndex={-1} className="container admin-page">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">
            HUBBY /{" "}
            {props.mode === "sandbox" ? "LOCAL SANDBOX" : "OWNER STAGING"}
          </p>
          <h1>Không gian quản trị.</h1>
          <p>Nội dung, sản phẩm và phiên bản — ở cùng một nơi.</p>
        </div>
        <Link className="button secondary" to="/">
          Xem cửa hàng
        </Link>
      </div>
      <div className="admin-notice">
        {props.mode === "sandbox"
          ? "CMS thử nghiệm lưu trên máy chủ local của máy này, không phải đăng nhập Owner, không xuất bản lên Internet. Không nhập kho thật hoặc khóa bí mật. Lịch sử CMS trên trình duyệt cũ vẫn được giữ riêng, không tự ghi đè dữ liệu mới."
          : "Staging: mọi thao tác được kiểm Owner + MFA ở server và PostgreSQL. Checkout vẫn là mẫu, chưa có thanh toán thật."}
      </div>
      <div className="admin-tabs">
        {tabs.map((item) => (
          <button
            key={item.id}
            className={tab === item.id ? "active" : ""}
            type="button"
            aria-pressed={tab === item.id}
            onClick={() =>
              setParams({ tab: item.id }, { preventScrollReset: true })
            }
          >
            {item.label}
          </button>
        ))}
      </div>
      {(notice || props.feedback) && (
        <div className="admin-message" role="status">
          {props.feedback || notice}
        </div>
      )}
      <div className="admin-editor-grid">
        <form onSubmit={save} className="admin-form admin-panel">
          {tab === "home" &&
            (props.mode === "sandbox" ? (
              <ExperienceEditor draft={draft} edit={edit} />
            ) : (
              <p>
                Bố cục mới cần migration staging trước khi áp dụng. Không sử
                dụng để ghi payload chưa được hỗ trợ vào Supabase.
              </p>
            ))}
          {tab === "content" && (
            <>
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
                <div className="admin-section-row" key={section.id}>
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
              <h2>Mã giảm giá mẫu</h2>
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
                  <label key={faq.question}>
                    Trả lời FAQ {index + 1}
                    <textarea
                      value={faq.answer}
                      onChange={(e) =>
                        edit((p) => {
                          const item = p.faqs[index];
                          if (item) item.answer = e.target.value;
                        })
                      }
                      maxLength={2000}
                    />
                  </label>
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
          {(tab === "products" || tab === "media") && (
            <>
              {tab === "products" && props.mode === "sandbox" && (
                <div className="admin-actions">
                  <button
                    type="button"
                    className="button secondary"
                    disabled={draft.products.length >= 19}
                    onClick={() => {
                      const id = `demo-${crypto.randomUUID().slice(0, 8)}`;
                      edit((p) => {
                        const template = p.products[0];
                        if (!template) return;
                        p.products.push({
                          ...structuredClone(template),
                          id,
                          slug: id,
                          name: "Sản phẩm mẫu mới",
                          monogram: "DEMO",
                          badge: "Gói mẫu",
                          tagline: "Nội dung thử nghiệm cần được duyệt.",
                          description:
                            "Sản phẩm số thử nghiệm. Chưa xác minh quyền phân phối hoặc điều kiện thương mại. Không dùng dữ liệu thật.",
                          media: undefined,
                          variants: [
                            {
                              id: `${id}-1`,
                              label: "Gói mẫu",
                              priceVnd: 89000,
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
                    }}
                  >
                    Thêm sản phẩm mẫu
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={draft.products.length <= 1}
                    onClick={() => {
                      const next =
                        draft.products.find((p) => p.id !== selected)?.id ?? "";
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
                    }}
                  >
                    Ẩn sản phẩm khỏi bản nháp
                  </button>
                </div>
              )}
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
              {product && (
                <>
                  {tab === "products" && (
                    <>
                      <h2>Thông tin sản phẩm</h2>
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
                        Đây chưa phải kho hàng. Không nhập credentials hoặc
                        license thật.
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
                                      ?.variants.find(
                                        (x) => x.id === variant.id,
                                      );
                                    if (v) v.priceVnd = Number(e.target.value);
                                  })
                                }
                                required
                              />
                            </label>
                            <label>
                              Tồn mẫu
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
                                      ?.variants.find(
                                        (x) => x.id === variant.id,
                                      );
                                    if (v) v.stock = Number(e.target.value);
                                  })
                                }
                                required
                              />
                            </label>
                          </div>
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
                              label: "Gói mẫu mới",
                              priceVnd: 0,
                              stock: 0,
                            });
                          })
                        }
                      >
                        Thêm gói mẫu
                      </button>
                    </>
                  )}
                  {tab === "media" && (
                    <>
                      <h2>Ảnh sản phẩm</h2>
                      <p>Chỉ dùng ảnh có quyền sử dụng. SVG/HTML bị từ chối.</p>
                      {product.media && (
                        <>
                          <img
                            className="admin-media-preview"
                            src={product.media.src}
                            alt={product.media.alt}
                          />
                          <label>
                            Alt text
                            <input
                              value={product.media.alt}
                              onChange={(e) =>
                                edit((p) => {
                                  const m = p.products.find(
                                    (x) => x.id === selected,
                                  )?.media;
                                  if (m) m.alt = e.target.value;
                                })
                              }
                              maxLength={160}
                            />
                          </label>
                          <button
                            type="button"
                            className="text-link"
                            onClick={() =>
                              edit((p) => {
                                const item = p.products.find(
                                  (x) => x.id === selected,
                                );
                                if (item) delete item.media;
                              })
                            }
                          >
                            Bỏ ảnh trong bản nháp
                          </button>
                        </>
                      )}
                      {props.mode === "sandbox" ? (
                        <label>
                          Chọn ảnh local (tối đa 250KB)
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/avif"
                            onChange={(e) =>
                              void localImage(e.target.files?.[0])
                            }
                          />
                        </label>
                      ) : (
                        <p>
                          Upload bằng biểu mẫu riêng bên dưới rồi chọn ảnh trong
                          thư viện.
                        </p>
                      )}
                      <div className="admin-media-grid">
                        {props.mediaRecords?.map((m) => (
                          <button
                            type="button"
                            className="media-option"
                            key={m.id}
                            onClick={() =>
                              edit((p) => {
                                const item = p.products.find(
                                  (x) => x.id === selected,
                                );
                                if (item)
                                  item.media = {
                                    src: `/media/${m.id}`,
                                    alt: m.alt,
                                  };
                              })
                            }
                          >
                            <img
                              src={`/media/${m.id}`}
                              alt={m.alt}
                              loading="lazy"
                            />
                            <span>
                              {m.alt} · {m.status}
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </>
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
                      onClick={() => run(() => props.onRestore(revision.id))}
                    >
                      Tạo nháp từ bản này
                    </button>
                  </article>
                ))}
              </div>
            </>
          )}
          {tab !== "history" && (
            <div className="admin-actions">
              <button
                className="button primary"
                type="submit"
                disabled={props.busy}
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
          <p className="eyebrow">PUBLISH CONTROL</p>
          <h2>Phiên bản {props.headVersion}</h2>
          <p>
            Lưu nháp không thay đổi cửa hàng. Chỉ bản nháp đã lưu mới có thể áp
            dụng.
          </p>
          <div>
            <span>{draft.products.length} sản phẩm</span>
            <span>
              {draft.products.flatMap((p) => p.variants).length} gói mẫu
            </span>
          </div>
          <button
            className="button primary"
            type="button"
            disabled={props.busy || props.revision.id === props.publishedId}
            onClick={() => run(() => props.onPublish(props.revision.id))}
          >
            {props.mode === "sandbox"
              ? "Áp dụng bản đã lưu local"
              : "Xuất bản bản đã lưu staging"}
          </button>
          <p>Không có thanh toán hoặc giao hàng thật.</p>
        </aside>
      </div>
      {tab === "media" && props.uploadForm}
      {preview && (
        <section className="admin-preview">
          <div className="admin-notice">
            Xem trước thay đổi chưa lưu — liên kết sẽ mở nội dung cửa hàng hiện
            tại.
          </div>
          <PreviewContent content={draft}>
            <Home preview />
          </PreviewContent>
        </section>
      )}
    </main>
  );
}
