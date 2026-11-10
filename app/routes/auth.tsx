import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  data,
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  useLocation,
  useNavigation,
} from "react-router";
import { z } from "zod";
import { PasswordField } from "../components/password-field";
import { GoogleLogin } from "../components/shop-extras";
import { safeNext } from "../domain/request-security";
import {
  authAvailability,
  emailServiceFailure,
} from "../server/auth-availability.server";
import { dataConfig } from "../server/config.server";
import { csrfToken, secureForm } from "../server/form-security.server";
import { runtimeContext } from "../server/runtime-context.server";
import {
  identity,
  requestClient,
  signedInDestination,
} from "../server/supabase.server";

export function meta() {
  return [{ title: "Đăng nhập & bảo mật — Hubby" }];
}
export async function loader({ request, context, url }: LoaderFunctionArgs) {
  const config = dataConfig(context.get(runtimeContext).env);
  const providers = await authAvailability(request, context);
  return {
    configured: !!config && providers.available,
    googleConfigured: providers.google,
    emailConfigured: providers.email,
    csrf: csrfToken(request, context),
    next: safeNext(url.searchParams.get("next")),
  };
}
export async function action({ request, context, url }: ActionFunctionArgs) {
  const form = await secureForm(request, 12_000);
  const config = dataConfig(context.get(runtimeContext).env);
  if (!config)
    return data(
      {
        error:
          "Hệ thống đăng nhập chưa sẵn sàng. Vui lòng thử lại sau.",
        message: "",
      },
      { status: 503 },
    );
  const client = requestClient(request, context);
  // RR8 preserves .data transport suffixes in request.url; use its normalized URL.
  const path = url.pathname;
  const next = safeNext(form.get("next"));
  const intent = String(form.get("intent") ?? "");
  if (path === "/dang-xuat") {
    const result = await client.auth.signOut({ scope: "local" });
    if (result.error)
      throw new Response("Chưa thể đăng xuất. Vui lòng thử lại.", {
        status: 503,
      });
    context.get(runtimeContext).identity = undefined;
    return redirect("/");
  }
  if (intent === "google") {
    if (!(await authAvailability(request, context)).google)
      return data(
        {
          error: "Đăng nhập Google chưa sẵn sàng. Bạn có thể dùng email.",
          message: "",
        },
        { status: 503 },
      );
    const result = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${config.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        skipBrowserRedirect: true,
      },
    });
    if (result.error || !result.data.url)
      return data(
        { error: "Chưa thể bắt đầu đăng nhập Google.", message: "" },
        { status: 400 },
      );
    const target = new URL(result.data.url);
    if (
      target.origin !== config.url ||
      !target.pathname.startsWith("/auth/v1/authorize")
    )
      throw new Response("OAuth URL không hợp lệ", { status: 502 });
    return redirect(target.href);
  }
  const email = z.email().max(254).safeParse(form.get("email"));
  const password = z.string().min(12).max(128).safeParse(form.get("password"));
  if (path === "/dat-lai-mat-khau") {
    if (!password.success || String(form.get("confirm")) !== password.data)
      return data(
        {
          error: "Mật khẩu cần ít nhất 12 ký tự và hai ô phải khớp.",
          message: "",
        },
        { status: 400 },
      );
    if (!(await identity(request, context)))
      return data(
        { error: "Link khôi phục không hợp lệ hoặc hết hạn.", message: "" },
        { status: 401 },
      );
    const result = await client.auth.updateUser({ password: password.data });
    if (result.error)
      return data(
        { error: "Chưa thể cập nhật mật khẩu.", message: "" },
        { status: 400 },
      );
    await client.auth.signOut({ scope: "local" });
    return redirect("/dang-nhap?notice=reset");
  }
  if (!email.success)
    return data({ error: "Email chưa hợp lệ.", message: "" }, { status: 400 });
  if (path === "/quen-mat-khau") {
    const result = await client.auth.resetPasswordForEmail(email.data, {
      redirectTo: `${config.origin}/auth/callback?next=/dat-lai-mat-khau`,
    });
    const issue = emailServiceFailure(result.error?.code);
    if (issue) return data({ error: issue, message: "" }, { status: 503 });
    return {
      error: "",
      message:
        "Nếu email phù hợp, hướng dẫn khôi phục sẽ được gửi. Kiểm tra hộp thư và mục spam.",
    };
  }
  if (path === "/dang-ky") {
    if (!password.success)
      return data(
        { error: "Mật khẩu cần 12–128 ký tự.", message: "" },
        { status: 400 },
      );
    const name = z.string().trim().min(1).max(80).safeParse(form.get("name"));
    if (!name.success)
      return data(
        { error: "Vui lòng nhập tên hiển thị (tối đa 80 ký tự).", message: "" },
        { status: 400 },
      );
    const result = await client.auth.signUp({
      email: email.data,
      password: password.data,
      options: {
        data: { display_name: name.data },
        emailRedirectTo: `${config.origin}/auth/callback?next=/tai-khoan`,
      },
    });
    const issue = emailServiceFailure(result.error?.code);
    if (issue) return data({ error: issue, message: "" }, { status: 503 });
    return {
      error: "",
      message:
        "Nếu đăng ký hợp lệ, hãy kiểm tra email để xác nhận. Không cấp quyền Owner qua đăng ký.",
    };
  }
  const loginPassword = z
    .string()
    .min(1)
    .max(128)
    .safeParse(form.get("password"));
  if (!loginPassword.success)
    return data(
      { error: "Vui lòng nhập mật khẩu.", message: "" },
      { status: 400 },
    );
  const result = await client.auth.signInWithPassword({
    email: email.data,
    password: loginPassword.data,
  });
  if (result.error)
    return data(
      {
        error:
          "Email hoặc mật khẩu chưa đúng, hoặc tài khoản chưa được xác nhận.",
        message: "",
      },
      { status: 400 },
    );
  const destination = await signedInDestination(request, context, next);
  if (form.get("presentation") === "modal")
    return {
      error: "",
      message: "Đã đăng nhập.",
      signedIn: true,
      redirectTo: destination === "/tai-khoan" ? undefined : destination,
    };
  return redirect(destination);
}
export default function AuthPage() {
  const state = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const path = useLocation().pathname;
  const busy = useNavigation().state !== "idle";
  const [emailOpen, setEmailOpen] = useState(false);
  useEffect(() => {
    if (result?.error) setEmailOpen(true);
  }, [result?.error]);
  const register = path === "/dang-ky",
    forgot = path === "/quen-mat-khau",
    reset = path === "/dat-lai-mat-khau";
  const title = register
    ? "Đăng ký bằng email"
    : forgot
      ? "Khôi phục mật khẩu"
      : reset
        ? "Đặt mật khẩu mới."
        : "Đăng nhập";
  const login = !register && !forgot && !reset;
  return (
    <main id="main" tabIndex={-1} className="container auth-page">
      <div className="auth-card">
        <p className="eyebrow">HUBBY</p>
        <h1>{title}</h1>
        <p>Theo dõi đơn hàng và lưu sản phẩm bạn yêu thích.</p>
        {!state.configured && (
          <p className="service-note">
            Đăng nhập đang tạm đóng. Bạn vẫn có thể xem sản phẩm và gửi góp ý.
          </p>
        )}
        {result?.error && (
          <p className="form-error" role="alert">
            {result.error}
          </p>
        )}
        {result?.message && (
          <p className="form-success" role="status">
            {result.message}
          </p>
        )}
        {login && (
          <>
            <GoogleLogin
              csrf={state.csrf}
              configured={state.configured && state.googleConfigured}
              next={state.next}
              busy={busy}
            />
            <button
              type="button"
              className="email-login-toggle"
              aria-expanded={emailOpen}
              aria-controls="page-email-login"
              onClick={() => setEmailOpen(!emailOpen)}
            >
              Đăng nhập bằng email {emailOpen ? "−" : "+"}
            </button>
          </>
        )}
        <div id="page-email-login" hidden={login && !emailOpen}>
          <Form method="post" className="admin-form">
            <input type="hidden" name="csrf" value={state.csrf} />
            <input type="hidden" name="next" value={state.next} />
            {register && (
              <label>
                Tên hiển thị
                <input
                  name="name"
                  maxLength={80}
                  required
                  autoComplete="nickname"
                  disabled={!state.configured || !state.emailConfigured}
                />
              </label>
            )}
            {!reset && (
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  maxLength={254}
                  required
                  autoComplete="email"
                  disabled={!state.configured || !state.emailConfigured}
                />
              </label>
            )}
            {!forgot && (
              <PasswordField
                key={path}
                minLength={register || reset ? 12 : 1}
                autoComplete={
                  register || reset ? "new-password" : "current-password"
                }
                disabled={!state.configured || !state.emailConfigured}
              />
            )}
            {reset && (
              <PasswordField
                label="Nhập lại mật khẩu"
                name="confirm"
                minLength={12}
                autoComplete="new-password"
                disabled={!state.configured || !state.emailConfigured}
              />
            )}
            <button
              className="button primary"
              type="submit"
              disabled={!state.configured || !state.emailConfigured || busy}
            >
              {busy
                ? "Đang xử lý…"
                : register
                  ? "Đăng ký"
                  : forgot
                    ? "Gửi hướng dẫn"
                    : reset
                      ? "Cập nhật mật khẩu"
                      : "Đăng nhập"}
            </button>
          </Form>
          <div className="auth-links">
            <Link to={register || forgot || reset ? "/dang-nhap" : "/dang-ky"}>
              {register || forgot || reset
                ? "Quay lại đăng nhập"
                : "Chưa có tài khoản? Đăng ký"}
            </Link>
            <Link to="/quen-mat-khau">Quên mật khẩu?</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
