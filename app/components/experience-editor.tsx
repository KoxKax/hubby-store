import { useState } from "react";
import { type Experience, experienceOf } from "../content/experience";
import type { StorefrontContent } from "../content/types";
import { imageKind } from "../domain/media";
export function ExperienceEditor({
  draft,
  edit,
}: {
  draft: StorefrontContent;
  edit: (change: (content: StorefrontContent) => void) => void;
}) {
  const settings = experienceOf(draft);
  const [error, setError] = useState("");
  function change(fn: (s: Experience) => void) {
    edit((p) => {
      p.experience ??= structuredClone(experienceOf(p));
      fn(p.experience);
    });
  }
  async function readImage(file: File) {
    if (file.size > 180000)
      throw Error("Banner tối đa 180KB. Chỉ dùng ảnh có quyền sử dụng.");
    const mime = imageKind(new Uint8Array(await file.arrayBuffer()));
    if (!mime || mime !== file.type)
      throw Error("Chỉ nhận PNG, JPEG, WebP, AVIF hợp lệ.");
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(Error("Chưa đọc được ảnh."));
      reader.readAsDataURL(file);
    });
  }
  async function upload(file: File | undefined, id: string) {
    if (!file) return;
    setError("");
    try {
      const src = await readImage(file);
      change((s) => {
        const slide = s.slides.find((b) => b.id === id);
        if (slide) slide.media = { src, alt: slide.title };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chưa đọc được ảnh.");
    }
  }
  async function uploadMany(files: File[]) {
    if (!files.length) return;
    setError("");
    try {
      if (settings.slides.filter((b) => b.media).length + files.length > 12)
        throw Error("Tối đa 12 ảnh banner.");
      const sources = await Promise.all(files.map(readImage));
      const currentBytes = settings.slides.reduce(
        (sum, b) => sum + (b.media?.src.length ?? 0),
        0,
      );
      if (currentBytes + sources.join("").length > 1_200_000)
        throw Error("Tổng ảnh quá lớn. Hãy nén ảnh hoặc chọn ít ảnh hơn.");
      change((s) => {
        for (const [i, src] of sources.entries()) {
          const empty = s.slides.find((b) => !b.media);
          const alt =
            files[i]?.name.replace(/\.[^.]+$/, "").slice(0, 160) ||
            "Banner Hubby";
          if (empty) empty.media = { src, alt };
          else if (s.slides.length < 12)
            s.slides.push({
              id: `slide-${crypto.randomUUID()}`,
              title: alt,
              description: "Khám phá sản phẩm",
              href: "/#san-pham",
              theme: "lavender",
              media: { src, alt },
            });
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chưa đọc được ảnh.");
    }
  }
  return (
    <section className="experience-editor">
      <h2>Bố cục trang chủ</h2>
      <p>
        Giới thiệu, banner trượt và thông báo đầu trang. Lưu nháp → xem trước →
        áp dụng. Không tự ghi đè nội dung đã xuất bản.
      </p>
      {Object.entries(settings.intro).map(([key, value]) => (
        <label key={key}>
          {
            {
              eyebrow: "Nhãn giới thiệu",
              title: "Tiêu đề giới thiệu",
              accent: "Dòng màu nhấn",
              description: "Mô tả giới thiệu",
            }[key as keyof Experience["intro"]]
          }
          <input
            value={value}
            maxLength={
              key === "description" ? 320 : key === "eyebrow" ? 80 : 120
            }
            required
            onChange={(e) =>
              change((s) => {
                s.intro[key as keyof Experience["intro"]] = e.target.value;
              })
            }
          />
        </label>
      ))}
      <h3>Thông báo luân phiên</h3>
      {settings.notices.map((n, i) => (
        <fieldset key={n.id}>
          <legend>Thông báo {i + 1}</legend>
          <label>
            Nội dung thông báo
            <input
              value={n.text}
              maxLength={180}
              required
              onChange={(e) =>
                change((s) => {
                  const item = s.notices[i];
                  if (item) item.text = e.target.value;
                })
              }
            />
          </label>
          <label>
            Link thông báo
            <input
              value={n.href}
              maxLength={200}
              required
              onChange={(e) =>
                change((s) => {
                  const item = s.notices[i];
                  if (item) item.href = e.target.value;
                })
              }
            />
          </label>
          <button
            type="button"
            className="button secondary"
            disabled={settings.notices.length <= 1}
            onClick={() =>
              change((s) => {
                s.notices.splice(i, 1);
              })
            }
          >
            Bỏ thông báo {i + 1}
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="button secondary"
        disabled={settings.notices.length >= 8}
        onClick={() =>
          change((s) => {
            s.notices.push({
              id: `notice-${crypto.randomUUID()}`,
              text: "Thông báo mới",
              href: "/#san-pham",
            });
          })
        }
      >
        Thêm thông báo
      </button>
      <h3>Banner trượt</h3>
      <p>
        Trang chủ tự chuyển ảnh mỗi 6 giây. Chỉ banner có ảnh mới được hiển thị;
        tối đa 12 ảnh, 180KB/ảnh. Chọn nhiều ảnh cùng lúc, rồi lưu nháp và áp
        dụng.
      </p>
      <label>
        Thêm nhiều ảnh banner
        <input
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,image/avif"
          onChange={(e) => {
            void uploadMany(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </label>
      {settings.slides.map((b, i) => (
        <fieldset key={b.id}>
          <legend>Banner {i + 1}</legend>
          <label>
            Tên banner (quản lý)
            <input
              value={b.title}
              required
              maxLength={160}
              onChange={(e) =>
                change((s) => {
                  const item = s.slides[i];
                  if (item) item.title = e.target.value;
                })
              }
            />
          </label>
          <label>
            Mô tả banner
            <input
              value={b.description}
              required
              maxLength={240}
              onChange={(e) =>
                change((s) => {
                  const item = s.slides[i];
                  if (item) item.description = e.target.value;
                })
              }
            />
          </label>
          <label>
            Link banner
            <input
              value={b.href}
              required
              maxLength={200}
              onChange={(e) =>
                change((s) => {
                  const item = s.slides[i];
                  if (item) item.href = e.target.value;
                })
              }
            />
          </label>
          <label>
            Màu nút điều khiển
            <select
              value={b.theme}
              onChange={(e) =>
                change((s) => {
                  const item = s.slides[i];
                  if (item)
                    item.theme = e.target
                      .value as Experience["slides"][number]["theme"];
                })
              }
            >
              <option value="mint">Mint</option>
              <option value="peach">Peach</option>
              <option value="lavender">Lavender</option>
            </select>
          </label>
          <label>
            Ảnh banner
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/avif"
              onChange={(e) => void upload(e.target.files?.[0], b.id)}
            />
          </label>
          {b.media && (
            <>
              <img
                src={b.media.src}
                alt={b.media.alt}
                style={{ width: "100%", maxHeight: 160, objectFit: "cover" }}
              />
              <label>
                Mô tả ảnh
                <input
                  value={b.media.alt}
                  maxLength={160}
                  required
                  onChange={(e) =>
                    change((s) => {
                      const item = s.slides[i];
                      if (item?.media) item.media.alt = e.target.value;
                    })
                  }
                />
              </label>
              <button
                type="button"
                className="button secondary"
                onClick={() =>
                  change((s) => {
                    const item = s.slides[i];
                    if (item) delete item.media;
                  })
                }
              >
                Bỏ ảnh banner {i + 1}
              </button>
            </>
          )}
          <button
            type="button"
            className="button secondary"
            onClick={() =>
              change((s) => {
                s.slides.splice(i, 1);
              })
            }
          >
            Bỏ banner {i + 1}
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="button secondary"
        disabled={settings.slides.length >= 12}
        onClick={() =>
          change((s) => {
            s.slides.push({
              id: `slide-${crypto.randomUUID()}`,
              title: "Một lựa chọn cho bạn",
              description: "Khám phá cùng Hubby",
              href: "/#san-pham",
              theme: "lavender",
            });
          })
        }
      >
        Thêm banner
      </button>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <label>
        <input
          type="checkbox"
          checked={settings.activityNotifications !== false}
          onChange={(e) =>
            change((s) => {
              s.activityNotifications = e.target.checked;
              s.illustrativePurchases = false;
            })
          }
        />{" "}
        Hiện hoạt động gần đây (thêm giỏ; đơn mua chỉ sau thanh toán thật)
      </label>
      <p>
        Chỉ hiện sản phẩm và thời hạn, không công khai email hoặc mã đơn. Thanh
        toán thử trong local không tạo thông báo mua.
      </p>
      <h3>Đánh giá đã được phép công bố</h3>
      <p>
        Chỉ nhập phản hồi thật có sự đồng ý; để trống khi chưa có. Không tạo
        điểm số hoặc khách hàng giả.
      </p>
      {settings.reviews.map((r, i) => (
        <fieldset key={r.id}>
          <legend>Đánh giá {i + 1}</legend>
          <label>
            Tên công khai
            <input
              value={r.name}
              required
              maxLength={80}
              onChange={(e) =>
                change((s) => {
                  const item = s.reviews[i];
                  if (item) item.name = e.target.value;
                })
              }
            />
          </label>
          <label>
            Sản phẩm đánh giá
            <input
              value={r.product}
              required
              maxLength={80}
              onChange={(e) =>
                change((s) => {
                  const item = s.reviews[i];
                  if (item) item.product = e.target.value;
                })
              }
            />
          </label>
          <label>
            Nội dung đánh giá
            <textarea
              value={r.text}
              required
              maxLength={1000}
              onChange={(e) =>
                change((s) => {
                  const item = s.reviews[i];
                  if (item) item.text = e.target.value;
                })
              }
            />
          </label>
          <button
            type="button"
            className="button secondary"
            onClick={() =>
              change((s) => {
                s.reviews.splice(i, 1);
              })
            }
          >
            Bỏ đánh giá {i + 1}
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="button secondary"
        disabled={settings.reviews.length >= 12}
        onClick={() =>
          change((s) => {
            s.reviews.push({
              id: `review-${crypto.randomUUID()}`,
              name: "",
              product: "",
              text: "",
            });
          })
        }
      >
        Thêm đánh giá đã duyệt
      </button>
    </section>
  );
}
