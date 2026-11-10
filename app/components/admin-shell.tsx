import { type ReactNode, useEffect, useRef, useState } from "react";
import { Form, Link, useRouteLoaderData } from "react-router";
import type { loader as rootLoader } from "../root";
import { Icon } from "./icons";

export const cmsSections = [
  { id: "dashboard", label: "Bảng điều khiển", icon: "grid" },
  { id: "products", label: "Sản phẩm", icon: "bag" },
  { id: "home", label: "Trang chủ & banner", icon: "layers" },
  { id: "content", label: "Nội dung & chính sách", icon: "menu" },
  { id: "media", label: "Thư viện ảnh", icon: "play" },
  { id: "history", label: "Lịch sử phiên bản", icon: "clock" },
];
export const operationSections = [
  { id: "overview", label: "Báo cáo vận hành", icon: "grid" },
  { id: "orders", label: "Đơn hàng", icon: "bag" },
  { id: "inventory", label: "Kho hàng", icon: "layers" },
  { id: "suppliers", label: "Nguồn hàng API", icon: "layers" },
  { id: "payments", label: "Thanh toán", icon: "shield" },
  { id: "tickets", label: "Yêu cầu hỗ trợ", icon: "headset" },
  { id: "reviews", label: "Đánh giá", icon: "heart" },
  { id: "feedback", label: "Góp ý", icon: "user" },
  { id: "audit", label: "Nhật ký hoạt động", icon: "clock" },
];
export function AdminShell({
  mode,
  section,
  operations = false,
  onSection,
  children,
}: {
  mode: "sandbox" | "staging";
  section: string;
  operations?: boolean;
  onSection?: (id: string) => void;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const [sourceUnread, setSourceUnread] = useState(0);
  const [newSourceChanges, setNewSourceChanges] = useState(false);
  const [desktopAlerts, setDesktopAlerts] = useState<
    NotificationPermission | "unavailable"
  >("unavailable");
  const latestSourceId = useRef<number | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!expanded) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpanded(false);
        menuButton.current?.focus();
      }
    };
    const screen = window.matchMedia("(min-width: 701px)");
    const resize = () => {
      if (screen.matches) setExpanded(false);
    };
    document.addEventListener("keydown", close);
    screen.addEventListener("change", resize);
    return () => {
      document.removeEventListener("keydown", close);
      screen.removeEventListener("change", resize);
    };
  }, [expanded]);
  const root = useRouteLoaderData<typeof rootLoader>("root");
  useEffect(() => {
    if (
      mode === "staging" &&
      root?.owner &&
      typeof window.Notification === "function"
    )
      setDesktopAlerts(window.Notification.permission);
  }, [mode, root?.owner]);
  useEffect(() => {
    if (mode !== "staging" || !root?.owner) return;
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/admin/nguon-hang/thong-bao", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!response.ok) return;
        const result: unknown = await response.json();
        if (
          !active ||
          !result ||
          typeof result !== "object" ||
          !("unread" in result)
        )
          return;
        if (
          typeof result.unread !== "number" ||
          !Number.isSafeInteger(result.unread)
        )
          return;
        setSourceUnread(result.unread);
        if (
          !("latestId" in result) ||
          typeof result.latestId !== "number" ||
          !Number.isSafeInteger(result.latestId)
        )
          return;
        // The unread count alone misses another change to an already-unread SKU.
        // Remember the last change ID to highlight updates on the next CMS visit.
        const key = "hubby-bite-alert-cursor-v1";
        let saved: string | null = null;
        try {
          saved = window.localStorage.getItem(key);
        } catch {
          // Browser storage may be disabled; the in-memory cursor still works.
        }
        const previous =
          latestSourceId.current ?? (saved === null ? null : Number(saved));
        const hasNewChanges =
          previous !== null &&
          Number.isSafeInteger(previous) &&
          result.latestId > previous;
        if (
          previous === null ||
          !Number.isSafeInteger(previous) ||
          result.latestId > previous
        ) {
          latestSourceId.current = result.latestId;
          try {
            window.localStorage.setItem(key, String(result.latestId));
          } catch {
            // In-app alerts still work for this tab.
          }
        }
        if (hasNewChanges) {
          setNewSourceChanges(true);
          if (
            typeof window.Notification === "function" &&
            window.Notification.permission === "granted"
          ) {
            try {
              new window.Notification("Nguồn hàng Bite vừa thay đổi", {
                body: "Có thông tin mới về sản phẩm, giá hoặc tồn kho. Mở mục Nguồn hàng API để xem chi tiết.",
                tag: "hubby-bite-source-update",
              });
            } catch {
              // Some browsers require service-worker notifications.
            }
          }
        }
      } catch {
        // A transient connection failure must not turn an unknown count into zero.
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [mode, root?.owner]);
  const base = mode === "sandbox" ? "/admin-demo" : "/admin";
  return (
    <div className="wp-admin">
      <header className="wp-toolbar">
        <Link to={`${base}?tab=dashboard`} className="wp-brand">
          Hubby<span>✳</span>
          <small>Quản trị</small>
        </Link>
        <button
          ref={menuButton}
          className="wp-menu-toggle"
          type="button"
          aria-label="Menu quản trị"
          aria-expanded={expanded}
          aria-controls="wp-sidebar"
          onClick={() => setExpanded(!expanded)}
        >
          <Icon name="menu" />
        </button>
        <div>
          {mode === "sandbox" && <span className="wp-environment">Local</span>}
          <Link to="/">
            Xem cửa hàng <Icon name="arrow" />
          </Link>
          {mode === "staging" && root?.owner && (
            <details className="wp-account-menu">
              <summary aria-label="Tài khoản quản trị">
                <Icon name="user" />
                <span>Admin</span>
              </summary>
              <div>
                <Link to="/tai-khoan">Thông tin tài khoản</Link>
                <Form method="post" action="/dang-xuat">
                  <input type="hidden" name="csrf" value={root.csrf} />
                  <button type="submit">Đăng xuất</button>
                </Form>
              </div>
            </details>
          )}
        </div>
      </header>
      {expanded && (
        <button
          type="button"
          className="wp-menu-backdrop"
          aria-label="Đóng menu quản trị"
          onClick={() => setExpanded(false)}
        />
      )}
      <div className="wp-layout">
        <aside
          id="wp-sidebar"
          className={`wp-sidebar ${expanded ? "is-open" : ""}`}
          aria-label="Menu quản trị"
        >
          <p>NỘI DUNG CỬA HÀNG</p>
          <nav aria-label="Quản lý nội dung">
            {cmsSections.map((item) =>
              onSection ? (
                <button
                  key={item.id}
                  type="button"
                  className={
                    !operations && section === item.id ? "is-active" : ""
                  }
                  aria-current={
                    !operations && section === item.id ? "page" : undefined
                  }
                  onClick={() => {
                    onSection(item.id);
                    setExpanded(false);
                  }}
                >
                  <Icon name={item.icon} />
                  {item.label}
                </button>
              ) : (
                <Link key={item.id} to={`${base}?tab=${item.id}`}>
                  <Icon name={item.icon} />
                  {item.label}
                </Link>
              ),
            )}
          </nav>
          {
            <>
              <p>VẬN HÀNH</p>
              <nav aria-label="Vận hành cửa hàng">
                {operationSections
                  .filter(
                    (item) =>
                      (mode === "sandbox" && item.id !== "suppliers") ||
                      [
                        "overview",
                        "orders",
                        "inventory",
                        "suppliers",
                        "payments",
                        "tickets",
                        "reviews",
                        "feedback",
                      ].includes(item.id),
                  )
                  .map((item) => (
                    <Link
                      key={item.id}
                      className={
                        operations && section === item.id ? "is-active" : ""
                      }
                      aria-current={
                        operations && section === item.id ? "page" : undefined
                      }
                      to={
                        mode === "staging" && item.id === "suppliers"
                          ? "/admin/nguon-hang"
                          : mode === "staging" && item.id === "inventory"
                            ? "/admin/kho"
                            : mode === "staging" && item.id === "payments"
                              ? "/admin/thanh-toan"
                              : `${mode === "sandbox" ? "/admin-demo/operations" : "/admin/operations"}?tab=${item.id}`
                      }
                      onClick={() => setExpanded(false)}
                    >
                      <Icon name={item.icon} />
                      {item.label}
                      {item.id === "suppliers" &&
                        mode === "staging" &&
                        sourceUnread > 0 && (
                          <strong
                            className="supplier-unread"
                            title={`${sourceUnread} thông báo nguồn hàng chưa xem`}
                          >
                            {" "}
                            ({sourceUnread})
                          </strong>
                        )}
                    </Link>
                  ))}
              </nav>
            </>
          }
          <div className="wp-sidebar-footer">
            Hubby ·{" "}
            {mode === "sandbox" ? "Không gian local" : "Quản trị cửa hàng"}
          </div>
        </aside>
        <main id="main" tabIndex={-1} className="wp-content">
          {mode === "staging" && root?.owner && newSourceChanges && (
            <div role="status" className="admin-notice supplier-fresh-notice">
              <span>Có cập nhật mới từ Bite kể từ lần bạn mở quản trị. </span>
              <Link
                to="/admin/nguon-hang?view=changes"
                onClick={() => setNewSourceChanges(false)}
              >
                Xem chi tiết →
              </Link>
              <button
                type="button"
                className="button secondary"
                onClick={() => setNewSourceChanges(false)}
                aria-label="Ẩn thông báo mới"
              >
                Đóng
              </button>
            </div>
          )}
          {mode === "staging" &&
            root?.owner &&
            sourceUnread > 0 &&
            section !== "suppliers" && (
              <p role="status" className="admin-notice">
                Có {sourceUnread} nhóm thay đổi nguồn hàng chưa xem.{" "}
                <Link to="/admin/nguon-hang?view=changes">Xem thông báo →</Link>
              </p>
            )}
          {mode === "staging" && root?.owner && desktopAlerts === "default" && (
            <div className="admin-notice">
              <span>
                Muốn nhận thông báo trên máy khi nguồn hàng thay đổi? Tính năng
                hoạt động khi trang quản trị còn mở.{" "}
              </span>{" "}
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  void window.Notification.requestPermission()
                    .then(setDesktopAlerts)
                    .catch(() => setDesktopAlerts("denied"));
                }}
              >
                Bật thông báo
              </button>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
