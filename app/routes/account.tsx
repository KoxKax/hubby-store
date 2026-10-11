import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, Form, Link, useActionData, useLoaderData } from "react-router";
import { AccountAccess } from "../components/shop-extras";
import { PageIntro } from "../components/storefront";
import { dataConfig } from "../server/config.server";
import { csrfToken, secureForm } from "../server/form-security.server";
import { runtimeContext } from "../server/runtime-context.server";
import { identity, requestClient } from "../server/supabase.server";
export function meta() {
  return [{ title: "Tài khoản của bạn — Hubby" }];
}
export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.get(runtimeContext).env;
  const user = await identity(request, context);
  let displayName = "";
  if (user) {
    const profile = await requestClient(request, context)
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    displayName = profile.data?.display_name ?? "";
  }
  return {
    user,
    displayName,
    csrf: csrfToken(request, context),
    configured: !!dataConfig(env),
    sandbox: env.APP_ENV === "local" && env.DATA_MODE !== "supabase",
  };
}
export async function action({ request, context }: ActionFunctionArgs) {
  const form = await secureForm(request, 4000);
  const user = await identity(request, context);
  if (!user)
    return data({ message: "Bạn cần đăng nhập vào staging." }, { status: 401 });
  const name = String(form.get("displayName") ?? "").trim();
  if (name.length < 1 || name.length > 80)
    return data({ message: "Tên cần 1–80 ký tự." }, { status: 400 });
  const result = await requestClient(request, context)
    .from("profiles")
    .update({ display_name: name })
    .eq("id", user.id);
  if (result.error)
    return data({ message: "Chưa thể lưu hồ sơ." }, { status: 400 });
  return { message: "Đã lưu tên hiển thị." };
}
export default function Account() {
  const state = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return (
    <main id="main" tabIndex={-1} className="container account-page">
      <PageIntro
        eyebrow="YOUR HUBBY SPACE"
        title={state.user ? "Không gian của bạn." : "Một nơi cho mọi lựa chọn."}
        description="Hồ sơ, lịch sử mua và hỗ trợ ở cùng một nơi."
      />
      <div className="account-grid">
        <section className="admin-panel">
          <h2>{state.user ? "Hồ sơ" : "Đăng nhập & đăng ký"}</h2>
          {state.user ? (
            <>
              <p>{state.user.email}</p>
              {result?.message && <p role="status">{result.message}</p>}
              <Form method="post" className="admin-form">
                <input type="hidden" name="csrf" value={state.csrf} />
                <label>
                  Tên hiển thị
                  <input
                    name="displayName"
                    defaultValue={state.displayName}
                    maxLength={80}
                    required
                  />
                </label>
                <button type="submit" className="button secondary">
                  Lưu hồ sơ
                </button>
              </Form>
              <Form method="post" action="/dang-xuat">
                <input type="hidden" name="csrf" value={state.csrf} />
                <button type="submit" className="button secondary">
                  Đăng xuất phiên này
                </button>
              </Form>
            </>
          ) : (
            <>
              <p>
                {state.configured
                  ? "Dùng email hoặc Google để truy cập."
                  : "Chưa cấu hình dịch vụ đăng nhập. Các biểu mẫu đã có, nhưng chưa nhận thông tin thật."}
              </p>
              <AccountAccess />
            </>
          )}
        </section>
        <section className="admin-panel">
          <h2>Lựa chọn của bạn</h2>
          {state.user?.owner && (
            <Link
              className="button primary"
              to={state.user.aal2 ? "/admin" : "/xac-thuc"}
            >
              {state.user.aal2 ? "Mở Owner CMS" : "Xác thực MFA"}
            </Link>
          )}
          {state.sandbox && (
            <div className="admin-actions">
              <Link className="button secondary" to="/tai-khoan/don-hang">
                Đơn hàng của bạn
              </Link>
              <Link className="button secondary" to="/tai-khoan/san-pham">
                Sản phẩm đã nhận
              </Link>
              <Link className="button secondary" to="/tai-khoan/tickets">
                Yêu cầu hỗ trợ
              </Link>
              <Link className="button secondary" to="/tai-khoan/da-xem">
                Đã xem gần đây
              </Link>
            </div>
          )}
          <div>
            <Link className="text-link" to="/yeu-thich">
              Xem sản phẩm yêu thích
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
