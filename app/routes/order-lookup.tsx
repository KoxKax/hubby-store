import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  data,
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { z } from "zod";
import { OrderCard, type OrderView } from "../components/local-commerce";
import { PageIntro } from "../components/storefront";
import { findOwnedOrder, localOrderEmail } from "../domain/order-lookup";
import { csrfToken, secureForm } from "../server/form-security.server";
import { localCall, localEnabled } from "../server/local-shop.server";
export function meta() {
  return [{ title: "Tra đơn hàng — Hubby" }];
}
export function loader({ request, context }: LoaderFunctionArgs) {
  return {
    csrf: csrfToken(request, context),
    local: localEnabled(request, context),
  };
}
export async function action({ request, context }: ActionFunctionArgs) {
  try {
    const form = await secureForm(request, 4000);
    const input = z
      .object({
        code: z.string().trim().min(8).max(36),
        email: z.email().max(254),
      })
      .safeParse({ code: form.get("code"), email: form.get("email") });
    if (!input.success)
      return data(
        { error: "Nhập mã đơn và email hợp lệ.", order: null },
        { status: 400 },
      );
    if (!localEnabled(request, context))
      return data(
        {
          error: "Tra cứu chưa được kết nối. Vui lòng liên hệ hỗ trợ.",
          order: null,
        },
        { status: 503 },
      );
    // Already scoped to the server-verified guest actor, never a public email/code query.
    const owned = await localCall<{ orders: OrderView[] }>(request, context, {
      action: "list",
    });
    const order = findOwnedOrder(
      owned.orders,
      input.data.code,
      input.data.email,
    );
    return {
      error: order
        ? ""
        : "Chưa thể hiển thị đơn. Kiểm tra mã, email và trình duyệt đã đặt hàng; hoặc liên hệ hỗ trợ.",
      order: order ?? null,
    };
  } catch (error) {
    return data(
      {
        error:
          error instanceof Response && error.status === 429
            ? "Vui lòng chờ trước khi thử lại."
            : "Chưa thể tra cứu. Vui lòng thử lại sau.",
        order: null,
      },
      { status: 400 },
    );
  }
}
export default function OrderLookup() {
  const state = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const busy = useNavigation().state !== "idle";
  return (
    <main id="main" tabIndex={-1} className="container lookup-page">
      <PageIntro
        eyebrow="YOUR ORDER, ONE PLACE"
        title="Đơn hàng của bạn."
        description="Nhập mã đơn và email để kiểm tra thông tin."
      />
      <div className="lookup-grid">
        <Form method="post" className="admin-form lookup-card">
          <input type="hidden" name="csrf" value={state.csrf} />
          <label>
            Mã đơn hàng
            <input
              name="code"
              autoComplete="off"
              minLength={8}
              maxLength={36}
              placeholder="Ví dụ: 8 ký tự đầu của mã đơn"
              required
            />
          </label>
          <label>
            Email đặt hàng
            <input
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
              placeholder="Email dùng khi đặt hàng"
            />
          </label>
          <button className="button primary" disabled={busy} type="submit">
            {busy ? "Đang kiểm tra…" : "Tra đơn hàng"}
          </button>
          {result?.error && (
            <p role="alert" className="form-error">
              {result.error}
            </p>
          )}
          {state.local && (
            <p className="service-note">
              Đơn local dùng email {localOrderEmail}; mở trong trình duyệt đã
              đặt hàng. Tra cứu qua email trên thiết bị khác cần kết nối dịch vụ
              xác minh.
            </p>
          )}
        </Form>
        <aside className="lookup-help">
          <span>✳</span>
          <h2>Mã đơn không phải mật khẩu.</h2>
          <p>
            Hubby chỉ hiển thị thông tin khi có quyền truy cập. Không công khai
            tài khoản hoặc mã kích hoạt chỉ bằng mã đơn và email.
          </p>
          <a className="text-link" href="/#ho-tro">
            Cần giúp tìm đơn?
          </a>
        </aside>
      </div>
      {result?.order && (
        <section className="lookup-result" aria-label="Kết quả tra đơn">
          <OrderCard order={result.order} />
        </section>
      )}
    </main>
  );
}
