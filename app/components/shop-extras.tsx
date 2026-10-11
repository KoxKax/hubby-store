import { type ReactNode, useEffect, useRef, useState } from "react";
import { Form, Link, useFetcher, useRouteLoaderData } from "react-router";
import type { loader as rootLoader } from "../root";
import { useContent } from "./content-context";
import { Icon } from "./icons";

export function Dialog({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      className="shop-dialog"
      ref={ref}
      aria-label={title}
      onCancel={close}
    >
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Đóng cửa sổ"
          onClick={close}
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function AccountAccess() {
  const root = useRouteLoaderData<typeof rootLoader>("root");
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const fetcher = useFetcher<{
    error?: string;
    message?: string;
    signedIn?: boolean;
  }>();
  useEffect(() => {
    if (fetcher.data?.signedIn) setOpen(false);
  }, [fetcher.data]);
  if (root?.signedIn)
    return (
      <Link
        className="icon-button"
        to="/tai-khoan"
        aria-label="Tài khoản và lịch sử đơn hàng"
      >
        <Icon name="user" />
      </Link>
    );
  const path =
    mode === "register"
      ? "/dang-ky"
      : mode === "forgot"
        ? "/quen-mat-khau"
        : "/dang-nhap";
  return (
    <>
      <button
        className="header-auth"
        aria-label="Đăng nhập hoặc đăng ký"
        type="button"
        onClick={() => {
          setMode("login");
          setOpen(true);
        }}
      >
        <Icon name="user" />
        <span>
          Đăng nhập <small>/ Đăng ký</small>
        </span>
      </button>
      {open && (
        <Dialog
          title={
            mode === "register"
              ? "Tạo tài khoản Hubby"
              : mode === "forgot"
                ? "Khôi phục mật khẩu"
                : "Chào bạn trở lại"
          }
          close={() => setOpen(false)}
        >
          <p className="dialog-intro">
            Lưu những lựa chọn yêu thích và theo dõi đơn hàng ở cùng một nơi.
          </p>
          <div className="auth-switch">
            <button
              type="button"
              aria-pressed={mode === "login"}
              onClick={() => setMode("login")}
            >
              Đăng nhập
            </button>
            <button
              type="button"
              aria-pressed={mode === "register"}
              onClick={() => setMode("register")}
            >
              Đăng ký
            </button>
          </div>
          {!root?.authConfigured && (
            <p className="service-note">
              Đăng nhập đang tạm đóng. Bạn vẫn có thể xem sản phẩm và gửi góp ý.
            </p>
          )}
          <fetcher.Form
            key={mode}
            method="post"
            action={path}
            className="admin-form"
          >
            <input type="hidden" name="csrf" value={root?.csrf ?? ""} />
            <input type="hidden" name="next" value="/tai-khoan" />
            <input type="hidden" name="presentation" value="modal" />
            {mode === "register" && (
              <label>
                Tên hiển thị
                <input
                  name="name"
                  autoComplete="nickname"
                  required
                  maxLength={80}
                  disabled={!root?.authConfigured}
                />
              </label>
            )}
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                disabled={!root?.authConfigured}
              />
            </label>
            {mode !== "forgot" && (
              <label>
                Mật khẩu
                <input
                  name="password"
                  type="password"
                  autoComplete={
                    mode === "register" ? "new-password" : "current-password"
                  }
                  required
                  minLength={mode === "register" ? 12 : 1}
                  maxLength={128}
                  disabled={!root?.authConfigured}
                />
              </label>
            )}
            {fetcher.data?.error && (
              <p role="alert" className="form-error">
                {fetcher.data.error}
              </p>
            )}
            {fetcher.data?.message && (
              <p role="status">{fetcher.data.message}</p>
            )}
            <button
              className="button primary"
              type="submit"
              disabled={!root?.authConfigured || fetcher.state !== "idle"}
            >
              {fetcher.state !== "idle"
                ? "Đang xử lý…"
                : mode === "register"
                  ? "Tạo tài khoản"
                  : mode === "forgot"
                    ? "Gửi hướng dẫn"
                    : "Đăng nhập"}
            </button>
          </fetcher.Form>
          {mode !== "forgot" && (
            <Form method="post" action={path}>
              <input type="hidden" name="csrf" value={root?.csrf ?? ""} />
              <input type="hidden" name="next" value="/tai-khoan" />
              <button
                type="submit"
                name="intent"
                value="google"
                className="button secondary auth-google"
                disabled={!root?.authConfigured}
              >
                Tiếp tục với Google
              </button>
            </Form>
          )}
          <button
            className="plain-link"
            type="button"
            onClick={() => setMode("forgot")}
          >
            Quên mật khẩu?
          </button>
        </Dialog>
      )}
    </>
  );
}

export function SupportDock() {
  const content = useContent();
  const [facebookInfo, setFacebookInfo] = useState(false);
  return (
    <>
      <div className="support-dock">
        {content.support.fanpageUrl ? (
          <a
            className="dock-fb"
            href={content.support.fanpageUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="Facebook của Hubby"
          >
            f
          </a>
        ) : (
          <button
            type="button"
            className="dock-fb"
            aria-label="Facebook của Hubby"
            onClick={() => setFacebookInfo(true)}
          >
            f
          </button>
        )}
      </div>
      {facebookInfo && (
        <Dialog title="Facebook của Hubby" close={() => setFacebookInfo(false)}>
          <p>
            Hubby chưa có Fanpage. Nếu cần giúp với đơn hàng, bạn mở đơn và gửi
            yêu cầu hỗ trợ nhé.
          </p>
          <Link
            className="button primary"
            to="/tra-don-hang"
            onClick={() => setFacebookInfo(false)}
          >
            Tra đơn hàng
          </Link>
        </Dialog>
      )}
    </>
  );
}
