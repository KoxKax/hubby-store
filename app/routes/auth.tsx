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
import { safeNext } from "../domain/request-security";
import { dataConfig } from "../server/config.server";
import { csrfToken, secureForm } from "../server/form-security.server";
import { runtimeContext } from "../server/runtime-context.server";
import { identity, requestClient } from "../server/supabase.server";

export function meta() {
  return [{ title: "Đăng nhập & bảo mật — Hubby" }];
}
export function loader({ request, context }: LoaderFunctionArgs) {
  const config = dataConfig(context.get(runtimeContext).env);
  return {
    configured: !!config,
    csrf: csrfToken(request, context),
    next: safeNext(new URL(request.url).searchParams.get("next")),
  };
}
export async function action({ request, context }: ActionFunctionArgs) {
  const form = await secureForm(request, 12_000);
  const config = dataConfig(context.get(runtimeContext).env);
  if (!config)
    return data(
      {
        error:
          "Chưa cấu hình staging. Không có tài khoản nào được tạo hoặc đăng nhập.",
        message: "",
      },
      { status: 503 },
    );
  const client = requestClient(request, context);
  const path = new URL(request.url).pathname;
  const next = safeNext(form.get("next"));
  const intent = String(form.get("intent") ?? "");
  if (path === "/dang-xuat") {
    await client.auth.signOut({ scope: "local" });
    return redirect("/");
  }
  if (intent === "google") {
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
    await client.auth.resetPasswordForEmail(email.data, {
      redirectTo: `${config.origin}/auth/callback?next=/dat-lai-mat-khau`,
    });
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
    await client.auth.signUp({
      email: email.data,
      password: password.data,
      options: {
        data: { display_name: name.data },
        emailRedirectTo: `${config.origin}/auth/callback?next=/tai-khoan`,
      },
    });
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
  if (form.get("presentation") === "modal")
    return { error: "", message: "Đã đăng nhập.", signedIn: true };
  return redirect(next);
}
export default function AuthPage() {
  const state = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const path = useLocation().pathname;
  const busy = useNavigation().state !== "idle";
  const register = path === "/dang-ky",
    forgot = path === "/quen-mat-khau",
    reset = path === "/dat-lai-mat-khau";
  const title = register
    ? "Tạo không gian của bạn."
    : forgot
      ? "Lấy lại quyền truy cập."
      : reset
        ? "Đặt mật khẩu mới."
        : "Chào bạn trở lại.";
  return (
    <main id="main" tabIndex={-1} className="container auth-page">
      <div className="auth-card">
        <p className="eyebrow">HUBBY ACCOUNT</p>
        <h1>{title}</h1>
        <p>
          {state.configured
            ? "Phiên đăng nhập được xác minh ở server."
            : "Chế độ local — chưa kết nối dịch vụ đăng nhập. Không nhập thông tin thật."}
        </p>
        {!state.configured && (
          <div className="admin-notice">
            Bạn có thể <Link to="/admin-demo">thử CMS local</Link> mà không cần
            tài khoản. Đây không phải quyền Owner thật.
          </div>
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
                disabled={!state.configured}
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
                disabled={!state.configured}
              />
            </label>
          )}
          {!forgot && (
            <label>
              Mật khẩu
              <input
                name="password"
                type="password"
                minLength={register || reset ? 12 : 1}
                maxLength={128}
                required
                autoComplete={
                  register || reset ? "new-password" : "current-password"
                }
                disabled={!state.configured}
              />
            </label>
          )}
          {reset && (
            <label>
              Nhập lại mật khẩu
              <input
                name="confirm"
                type="password"
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                required
                disabled={!state.configured}
              />
            </label>
          )}
          <button
            className="button primary"
            type="submit"
            disabled={!state.configured || busy}
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
        {!forgot && !reset && (
          <Form method="post">
            <input type="hidden" name="csrf" value={state.csrf} />
            <input type="hidden" name="next" value={state.next} />
            <button
              className="button secondary auth-google"
              name="intent"
              value="google"
              type="submit"
              disabled={!state.configured || busy}
            >
              Tiếp tục với Google
            </button>
          </Form>
        )}
        <div className="auth-links">
          <Link to={register ? "/dang-nhap" : "/dang-ky"}>
            {register ? "Đã có tài khoản? Đăng nhập" : "Tạo tài khoản"}
          </Link>
          <Link to="/quen-mat-khau">Quên mật khẩu?</Link>
        </div>
      </div>
    </main>
  );
}
