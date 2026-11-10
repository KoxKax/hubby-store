import { useEffect, useRef, useState } from "react";
import { useFetcher, useRouteLoaderData } from "react-router";
import { experienceOf } from "../content/experience";
import { type Activity, feedbackCategories } from "../domain/engagement";
import type { loader as rootLoader } from "../root";
import { useContent } from "./content-context";
import { Icon } from "./icons";
import { Dialog } from "./shop-extras";
import { useStore } from "./store-context";

export function ThemeToggle() {
  const root = useRouteLoaderData<typeof rootLoader>("root");
  const fetcher = useFetcher();
  const light = root?.theme === "light";
  return (
    <fetcher.Form method="post" action="/theme">
      <input type="hidden" name="csrf" value={root?.csrf ?? ""} />
      <button
        type="submit"
        className="icon-button theme-toggle"
        name="theme"
        value={light ? "dark" : "light"}
        aria-label={
          light ? "Chuyển sang giao diện tối" : "Chuyển sang giao diện sáng"
        }
        title={light ? "Giao diện tối" : "Giao diện sáng"}
        disabled={fetcher.state !== "idle"}
      >
        <Icon name={light ? "moon" : "sun"} />
      </button>
    </fetcher.Form>
  );
}
export function FeedbackButton({
  className = "plain-link",
  children = "Góp ý cho Hubby",
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      {open && <FeedbackDialog close={() => setOpen(false)} />}
    </>
  );
}
function FeedbackDialog({ close }: { close: () => void }) {
  const root = useRouteLoaderData<typeof rootLoader>("root");
  const [key] = useState(() => crypto.randomUUID());
  const fetcher = useFetcher<{
    ok?: boolean;
    error?: string;
    message?: string;
  }>();
  return (
    <Dialog title="Góp ý cho Hubby" close={close}>
      {fetcher.data?.ok ? (
        <div className="feedback-success" role="status">
          <Icon name="heart" />
          <h3>Cảm ơn bạn đã chia sẻ!</h3>
          <p>Hubby đã nhận được góp ý của bạn.</p>
          <button type="button" className="button primary" onClick={close}>
            Xong
          </button>
        </div>
      ) : (
        <>
          <p className="dialog-intro">
            Có điều gì bạn muốn Hubby làm tốt hơn? Kể cho tụi mình nhé.
          </p>
          <fetcher.Form method="post" action="/feedback" className="admin-form">
            <input type="hidden" name="csrf" value={root?.csrf ?? ""} />
            <input type="hidden" name="key" value={key} />
            <label>
              Chủ đề
              <select name="category" defaultValue="experience">
                {Object.entries(feedbackCategories)
                  .filter(([value]) => value !== "review")
                  .map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Góp ý của bạn
              <textarea
                name="message"
                minLength={10}
                maxLength={1500}
                required
                placeholder="Bạn thích điều gì, hoặc muốn thay đổi điều gì?"
              />
            </label>
            <p className="feedback-note">
              Không cần ghi tên hay email. Đừng gửi mật khẩu, mã xác thực hoặc
              thông tin riêng tư nhé.
            </p>
            {fetcher.data?.error && (
              <p role="alert" className="form-error">
                {fetcher.data.error}
              </p>
            )}
            <button
              type="submit"
              className="button primary"
              disabled={fetcher.state !== "idle"}
            >
              {fetcher.state !== "idle" ? "Đang gửi…" : "Gửi góp ý"}
              <Icon name="arrow" />
            </button>
          </fetcher.Form>
        </>
      )}
    </Dialog>
  );
}
export function ReviewButton({
  className = "plain-link",
}: {
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        Viết đánh giá <Icon name="arrow" />
      </button>
      {open && <ReviewDialog close={() => setOpen(false)} />}
    </>
  );
}
function ReviewDialog({ close }: { close: () => void }) {
  const content = useContent();
  const root = useRouteLoaderData<typeof rootLoader>("root");
  const [key] = useState(() => crypto.randomUUID());
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  return (
    <Dialog title="Đánh giá dịch vụ" close={close}>
      {fetcher.data?.ok ? (
        <div className="feedback-success" role="status">
          <Icon name="heart" />
          <h3>Cảm ơn bạn đã đánh giá!</h3>
          <p>Hubby đã nhận được chia sẻ của bạn.</p>
          <button type="button" className="button primary" onClick={close}>
            Xong
          </button>
        </div>
      ) : (
        <>
          <p className="dialog-intro">
            Kể cho Hubby về trải nghiệm sử dụng dịch vụ của bạn. Đánh giá được
            gửi riêng, không tự công khai.
          </p>
          <fetcher.Form method="post" action="/review" className="admin-form">
            <input type="hidden" name="csrf" value={root?.csrf ?? ""} />
            <input type="hidden" name="key" value={key} />
            <label>
              Sản phẩm
              <select name="productId" required>
                {content.products.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Điểm đánh giá
              <select name="rating" defaultValue="5">
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} / 5
                  </option>
                ))}
              </select>
            </label>
            <label>
              Trải nghiệm của bạn
              <textarea
                name="message"
                minLength={10}
                maxLength={1000}
                required
                placeholder="Bạn thấy dịch vụ và hỗ trợ của Hubby thế nào?"
              />
            </label>
            <p className="feedback-note">
              Không gửi thông tin đăng nhập hoặc mã xác thực.
            </p>
            {fetcher.data?.error && (
              <p role="alert" className="form-error">
                {fetcher.data.error}
              </p>
            )}
            <button
              type="submit"
              className="button primary"
              disabled={fetcher.state !== "idle"}
            >
              {fetcher.state === "idle" ? "Gửi đánh giá" : "Đang gửi…"}
            </button>
          </fetcher.Form>
        </>
      )}
    </Dialog>
  );
}
export function ActivityNotifications() {
  const content = useContent();
  const enabled = experienceOf(content).activityNotifications !== false;
  const { notice } = useStore();
  const feed = useFetcher<{ events: Activity[] }>();
  const [dismissed, setDismissed] = useState(false);
  const [current, setCurrent] = useState<Activity | null>(null);
  const realQueue = useRef<Activity[]>([]);
  const seen = useRef(new Set<string>());
  const busy = useRef(false);
  const load = feed.load;

  useEffect(() => {
    if (!enabled || dismissed) return;
    function poll() {
      if (!document.hidden && !busy.current) void load("/activity");
    }
    poll();
    const timer = setInterval(poll, 12_000);
    const onPaid = () => {
      void load("/activity");
    };
    window.addEventListener("hubby:paid", onPaid);
    return () => {
      clearInterval(timer);
      window.removeEventListener("hubby:paid", onPaid);
    };
  }, [enabled, dismissed, load]);
  busy.current = feed.state !== "idle";

  useEffect(() => {
    if (!feed.data?.events || !enabled || dismissed) return;
    let hasNewReal = false;
    for (const event of feed.data.events) {
      if (seen.current.has(event.id)) continue;
      seen.current.add(event.id);
      if (Date.now() - event.at < 15 * 60_000) {
        realQueue.current.push(event);
        hasNewReal = true;
      }
    }
    realQueue.current = realQueue.current.slice(-10);
    if (seen.current.size > 200)
      seen.current = new Set(Array.from(seen.current).slice(-100));

    if (hasNewReal && !document.hidden && !notice) {
      if (!current) {
        const next = realQueue.current.shift();
        if (next) setCurrent(next);
      }
    }
  }, [feed.data, enabled, dismissed, current, notice]);

  const hasMounted = useRef(false);

  useEffect(() => {
    if (!enabled || dismissed) return;

    if (current) {
      const timer = setTimeout(() => {
        setCurrent(null);
      }, 6500);
      return () => clearTimeout(timer);
    }

    const isInitial = !hasMounted.current;
    if (isInitial) hasMounted.current = true;

    const delay = isInitial
      ? 3500
      : realQueue.current.length > 0
        ? 1500
        : Math.floor(Math.random() * 8000) + 9000;

    const scheduleTimer = setTimeout(() => {
      if (document.hidden || notice) return;
      if (realQueue.current.length > 0) {
        setCurrent(realQueue.current.shift() ?? null);
      }
    }, delay);

    return () => clearTimeout(scheduleTimer);
  }, [current, enabled, dismissed, notice]);

  if (!enabled || dismissed || !current || notice) return null;
  const minutes = Math.floor(Math.max(0, Date.now() - current.at) / 60_000);
  return (
    <aside className="purchase-pop" aria-label="Hoạt động gần đây">
      <span className="purchase-icon">
        <Icon name="bag" />
      </span>
      <div>
        <small>{minutes ? `${minutes} phút trước` : "Vừa xong"}</small>
        <p>
          <span className="pop-customer">{current.customer}</span>{" "}
          {current.kind === "purchase" ? (
            <>
              vừa mua <strong>{current.product}</strong>
            </>
          ) : (
            <>
              vừa thêm <strong>{current.product}</strong> vào giỏ hàng
            </>
          )}
        </p>
      </div>
      <button
        type="button"
        className="icon-button"
        aria-label="Tắt thông báo hoạt động"
        onClick={() => {
          setDismissed(true);
          setCurrent(null);
          realQueue.current = [];
        }}
      >
        <Icon name="close" />
      </button>
    </aside>
  );
}
