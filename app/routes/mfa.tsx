import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  data,
  Form,
  redirect,
  useActionData,
  useLoaderData,
} from "react-router";
import { safeNext } from "../domain/request-security";
import { csrfToken, secureForm } from "../server/form-security.server";
import { identity, requestClient } from "../server/supabase.server";
export async function loader({ request, context }: LoaderFunctionArgs) {
  const user = await identity(request, context);
  if (!user) throw redirect("/dang-nhap?next=/xac-thuc");
  if (!user.owner)
    throw new Response("Chỉ Owner dùng trang này", { status: 403 });
  if (user.aal2)
    throw redirect(
      safeNext(new URL(request.url).searchParams.get("next"), "/admin"),
    );
  const result = await requestClient(request, context).auth.mfa.listFactors();
  if (result.error) throw new Response("Chưa tải được MFA", { status: 503 });
  return {
    csrf: csrfToken(request, context),
    factors: result.data.totp
      .filter((f) => f.status === "verified")
      .map((f) => ({ id: f.id, name: f.friendly_name ?? "Authenticator" })),
    next: safeNext(new URL(request.url).searchParams.get("next"), "/admin"),
  };
}
export async function action({ request, context }: ActionFunctionArgs) {
  const form = await secureForm(request, 8000);
  const user = await identity(request, context);
  if (!user?.owner) throw new Response("Không có quyền", { status: 403 });
  const client = requestClient(request, context);
  const intent = form.get("intent");
  if (intent === "enroll") {
    const existing = await client.auth.mfa.listFactors();
    if (existing.error)
      return data(
        { error: "Chưa tải được MFA.", enrollment: null },
        { status: 400 },
      );
    if (existing.data.totp.some((f) => f.status === "verified"))
      return data(
        {
          error: "Đã có authenticator. Hãy xác minh mã hiện tại.",
          enrollment: null,
        },
        { status: 400 },
      );
    if (existing.data.all.filter((f) => f.status === "unverified").length >= 5)
      return data(
        {
          error:
            "Có quá nhiều yêu cầu MFA chưa hoàn tất; quản lý lại trong Supabase staging.",
          enrollment: null,
        },
        { status: 400 },
      );
    const result = await client.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Hubby Owner",
    });
    if (result.error)
      return data(
        { error: "Chưa thể tạo authenticator.", enrollment: null },
        { status: 400 },
      );
    return {
      error: "",
      enrollment: { id: result.data.id, uri: result.data.totp.uri },
    };
  }
  const factorId = String(form.get("factorId") ?? "");
  const code = String(form.get("code") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(factorId) || !/^\d{6}$/.test(code))
    return data(
      { error: "Mã xác thực cần 6 chữ số.", enrollment: null },
      { status: 400 },
    );
  const factors = await client.auth.mfa.listFactors();
  if (factors.error || !factors.data.all.some((f) => f.id === factorId))
    throw new Response("Factor không thuộc phiên hiện tại", { status: 403 });
  const result = await client.auth.mfa.challengeAndVerify({ factorId, code });
  if (result.error)
    return data(
      { error: "Mã không đúng hoặc đã hết hạn.", enrollment: null },
      { status: 400 },
    );
  return redirect(safeNext(form.get("next"), "/admin"));
}
export default function Mfa() {
  const state = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return (
    <main id="main" tabIndex={-1} className="container auth-page">
      <div className="auth-card">
        <p className="eyebrow">OWNER SECURITY</p>
        <h1>Xác thực hai bước.</h1>
        <p>
          Chỉ xác minh trên staging của bạn. Không gửi mã hoặc khóa TOTP vào
          chat.
        </p>
        {result?.error && (
          <p role="alert" className="form-error">
            {result.error}
          </p>
        )}
        {result?.enrollment && (
          <div className="admin-notice">
            <p>
              Thêm URI này vào ứng dụng Authenticator bằng thiết bị của bạn.
              Khóa chỉ hiện trong phiên này, không lưu vào CMS.
            </p>
            <code className="totp-uri">{result.enrollment.uri}</code>
          </div>
        )}
        {state.factors.length || result?.enrollment ? (
          <Form method="post" className="admin-form">
            <input type="hidden" name="csrf" value={state.csrf} />
            <input type="hidden" name="next" value={state.next} />
            <label>
              Authenticator
              <select name="factorId">
                {result?.enrollment && (
                  <option value={result.enrollment.id}>Hubby Owner mới</option>
                )}
                {state.factors.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Mã 6 chữ số
              <input
                name="code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoComplete="one-time-code"
                required
              />
            </label>
            <button
              name="intent"
              value="verify"
              className="button primary"
              type="submit"
            >
              Xác minh
            </button>
          </Form>
        ) : (
          <Form method="post">
            <input type="hidden" name="csrf" value={state.csrf} />
            <button
              name="intent"
              value="enroll"
              type="submit"
              className="button primary"
            >
              Thiết lập Authenticator
            </button>
          </Form>
        )}
      </div>
    </main>
  );
}
