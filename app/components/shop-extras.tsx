import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import {
  Form,
  Link,
  useFetcher,
  useNavigate,
  useRouteLoaderData,
} from "react-router";
import type { loader as rootLoader } from "../root";
import { useContent } from "./content-context";
import { Icon } from "./icons";
import { PasswordField } from "./password-field";

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
  if (root?.signedIn)
    return (
      <>
        {root.owner && (
          <Link
            className="icon-button"
            to="/admin"
            aria-label="Quản trị cửa hàng"
            title="Quản trị cửa hàng"
          >
            <Icon name="grid" />
          </Link>
        )}
        <Link
          className="icon-button"
          to="/tai-khoan"
          aria-label="Tài khoản và lịch sử đơn hàng"
        >
          <Icon name="user" />
        </Link>
      </>
    );
  return (
    <>
      <button
        className="header-auth"
        aria-label="Đăng nhập"
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        <Icon name="user" />
        <span>Đăng nhập</span>
      </button>
      {open && <LoginDialog close={() => setOpen(false)} />}
    </>
  );
}
function LoginDialog({ close }: { close: () => void }) {
  const root = useRouteLoaderData<typeof rootLoader>("root");
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [emailOpen, setEmailOpen] = useState(false);
  const emailId = useId();
  return (
    <Dialog title="Đăng nhập" close={close}>
      <p className="dialog-intro">
        Theo dõi đơn hàng và lưu sản phẩm bạn yêu thích.
      </p>
      <GoogleLogin
        csrf={root?.csrf ?? ""}
        configured={!!root?.authConfigured && !!root?.googleConfigured}
      />
      {root?.authConfigured &&
        !root.googleConfigured &&
        root.emailConfigured && (
          <p className="service-note">
            Google chưa được kết nối. Bạn dùng email bên dưới nhé.
          </p>
        )}
      {root?.authConfigured && !root.emailConfigured && (
        <p className="service-note">Đăng nhập bằng email đang tạm đóng.</p>
      )}
      <button
        type="button"
        className="email-login-toggle"
        aria-expanded={emailOpen}
        aria-controls={emailId}
        onClick={() => {
          setEmailOpen(!emailOpen);
          setMode("login");
        }}
      >
        Đăng nhập bằng email <Icon name={emailOpen ? "minus" : "plus"} />
      </button>
      {!root?.authConfigured && (
        <p className="service-note">
          Đăng nhập đang tạm đóng. Bạn vẫn có thể xem sản phẩm và gửi góp ý.
        </p>
      )}
      {emailOpen && (
        <div id={emailId} className="email-login-panel">
          <EmailLogin key={mode} mode={mode} onMode={setMode} close={close} />
        </div>
      )}
    </Dialog>
  );
}
export function GoogleLogin({
  csrf,
  configured,
  next = "/tai-khoan",
  busy = false,
}: {
  csrf: string;
  configured: boolean;
  next?: string;
  busy?: boolean;
}) {
  return (
    <Form method="post" action="/dang-nhap" className="google-login-form">
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="next" value={next} />
      <button
        type="submit"
        name="intent"
        value="google"
        className="button secondary auth-google"
        disabled={!configured || busy}
      >
        <span className="google-mark" aria-hidden="true">
          G
        </span>
        Đăng nhập bằng Google
      </button>
    </Form>
  );
}
function EmailLogin({
  mode,
  onMode,
  close,
}: {
  mode: "login" | "register" | "forgot";
  onMode: (mode: "login" | "register" | "forgot") => void;
  close: () => void;
}) {
  const root = useRouteLoaderData<typeof rootLoader>("root");
  const navigate = useNavigate();
  const fetcher = useFetcher<{
    error?: string;
    message?: string;
    signedIn?: boolean;
    redirectTo?: string;
  }>();
  useEffect(() => {
    if (fetcher.data?.signedIn) {
      close();
      if (fetcher.data.redirectTo) void navigate(fetcher.data.redirectTo);
    }
  }, [fetcher.data?.signedIn, fetcher.data?.redirectTo, close, navigate]);
  const path =
    mode === "register"
      ? "/dang-ky"
      : mode === "forgot"
        ? "/quen-mat-khau"
        : "/dang-nhap";
  return (
    <>
      {mode !== "login" && (
        <h3>
          {mode === "register" ? "Đăng ký bằng email" : "Khôi phục mật khẩu"}
        </h3>
      )}
      <fetcher.Form method="post" action={path} className="admin-form">
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
              disabled={!root?.authConfigured || !root?.emailConfigured}
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
            disabled={!root?.authConfigured || !root?.emailConfigured}
          />
        </label>
        {mode !== "forgot" && (
          <PasswordField
            minLength={mode === "register" ? 12 : 1}
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
            disabled={!root?.authConfigured || !root?.emailConfigured}
          />
        )}
        {fetcher.data?.error && (
          <p role="alert" className="form-error">
            {fetcher.data.error}
          </p>
        )}
        {fetcher.data?.message && <p role="status">{fetcher.data.message}</p>}
        <button
          className="button primary"
          type="submit"
          disabled={
            !root?.authConfigured ||
            !root?.emailConfigured ||
            fetcher.state !== "idle"
          }
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
      <div className="email-auth-links">
        {mode === "login" ? (
          <>
            <button
              className="plain-link"
              type="button"
              onClick={() => onMode("forgot")}
            >
              Quên mật khẩu?
            </button>
            <p>
              Chưa có tài khoản?{" "}
              <button
                className="plain-link"
                type="button"
                onClick={() => onMode("register")}
              >
                Đăng ký
              </button>
            </p>
          </>
        ) : (
          <button
            className="plain-link"
            type="button"
            onClick={() => onMode("login")}
          >
            Quay lại đăng nhập
          </button>
        )}
      </div>
    </>
  );
}

export function SupportDock() {
  const content = useContent();
  if (!content.support.fanpageUrl) return null;
  return (
    <div className="support-dock">
      <a
        className="dock-fb"
        href={content.support.fanpageUrl}
        target="_blank"
        rel="noreferrer"
        aria-label="Facebook của Hubby"
      >
        f
      </a>
    </div>
  );
}
