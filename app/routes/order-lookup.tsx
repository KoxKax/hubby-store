import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  data,
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { z } from "zod";
import {
  CommerceOrderCard,
  DeliveryUnitList,
} from "../components/commerce-space";
import {
  OrderCard,
  type OrderView,
  statuses,
} from "../components/local-commerce";
import { PageIntro } from "../components/storefront";
import { formatVnd } from "../domain/money";
import {
  findVerifiedAccountOrder,
  localOrderEmail,
} from "../domain/order-lookup";
import {
  commerceOrderSchema,
  commerceRpc,
  customerSpace,
} from "../server/commerce-repository.server";
import { csrfToken, secureForm } from "../server/form-security.server";
import { localCall, localEnabled } from "../server/local-shop.server";
import { payosCheckoutReady } from "../server/payos-checkout.server";
import { payosFulfillmentReady } from "../server/payos-fulfillment.server";
import { readPayosGuestToken } from "../server/payos-guest.server";
import {
  guestOrderGateway,
  guestOrderWithProof,
  revealGuestPayosDelivery,
} from "../server/payos-guest-order.server";
import {
  payosGuestResumeGateway,
  payosResumeRedirect,
  resumeGuestPayosCheckout,
} from "../server/payos-resume.server";
import { runtimeContext } from "../server/runtime-context.server";
import { identity } from "../server/supabase.server";
export function meta() {
  return [{ title: "Tra đơn hàng — Hubby" }];
}
export function headers() {
  return {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
  };
}
export async function loader({ request, context }: LoaderFunctionArgs) {
  const local = localEnabled(request, context);
  const user = local ? null : await identity(request, context);
  const env = context.get(runtimeContext).env;
  return {
    csrf: csrfToken(request, context),
    local,
    email: user?.email ?? "",
    guest: !local && payosCheckoutReady(env),
    claimReady: !!user && env.GUEST_CLAIM_READY === "true",
  };
}
export async function action({ request, context }: ActionFunctionArgs) {
  try {
    const form = await secureForm(request, 4000);
    const input = z
      .object({
        code: z.string().trim().min(8).max(36),
        email: z.email().max(254),
        intent: z
          .enum(["lookup", "reveal", "claim", "resume"])
          .default("lookup"),
      })
      .safeParse({
        code: form.get("code"),
        email: form.get("email"),
        intent: form.get("intent") ?? "lookup",
      });
    if (!input.success)
      return data(
        {
          error: "Nhập mã đơn và email hợp lệ.",
          order: null,
          mode: "none" as const,
        },
        { status: 400 },
      );
    if (localEnabled(request, context)) {
      // Local results remain scoped to the verified guest actor cookie.
      const { order } = await localCall<{ order: OrderView | null }>(
        request,
        context,
        {
          action: "lookup",
          code: input.data.code,
          email: input.data.email,
        },
      );
      return {
        error: order
          ? ""
          : "Chưa tìm được đơn. Kiểm tra mã, email và trình duyệt đã đặt hàng.",
        order,
        mode: "local" as const,
      };
    }
    const user = await identity(request, context);
    if (!user) {
      const env = context.get(runtimeContext).env;
      const token = readPayosGuestToken(request);
      if (!payosCheckoutReady(env) || !token)
        return {
          error:
            "Không có phiên đặt hàng trên trình duyệt này. Nếu mua bằng thiết bị khác, hãy đăng nhập hoặc liên hệ hỗ trợ để xác minh.",
          order: null,
          mode: "none" as const,
        };
      const gateway = guestOrderGateway(env);
      const order = await guestOrderWithProof(
        input.data.code,
        input.data.email,
        token,
        gateway,
      );
      if (!order)
        return {
          error: "Không tìm thấy đơn phù hợp với mã, email và trình duyệt này.",
          order: null,
          mode: "none" as const,
        };
      if (input.data.intent === "resume") {
        if (order.state !== "pending_payment")
          throw new Response("Đơn không còn chờ thanh toán.", { status: 409 });
        const url = await resumeGuestPayosCheckout(
          input.data.code,
          input.data.email,
          token,
          payosGuestResumeGateway(env),
        );
        return payosResumeRedirect(url);
      }
      if (input.data.intent === "reveal") {
        if (
          order.state !== "delivered" ||
          !payosFulfillmentReady(env) ||
          !env.INVENTORY_ENCRYPTION_KEY_V1
        )
          return {
            error:
              "Đơn chưa hoàn tất giao hàng. Bạn có thể tra lại trạng thái sau.",
            order,
            mode: "guest" as const,
          };
        const products = await revealGuestPayosDelivery(
          input.data.code,
          input.data.email,
          token,
          gateway,
          env.INVENTORY_ENCRYPTION_KEY_V1,
        );
        return {
          error: "",
          order,
          mode: "guest" as const,
          products,
          lookupEmail: input.data.email,
        };
      }
      return {
        error: "",
        order,
        mode: "guest" as const,
        lookupEmail: input.data.email,
      };
    }
    if (
      input.data.email.trim().toLowerCase() !== user.email.trim().toLowerCase()
    )
      return {
        error: "Không tìm thấy đơn thuộc tài khoản và email này.",
        order: null,
        mode: "none" as const,
      };
    // Deployed Workers must preserve the existing lookup until the guarded
    // guest-claim migration has passed staging validation and is enabled.
    if (context.get(runtimeContext).env.GUEST_CLAIM_READY !== "true") {
      if (input.data.intent === "claim")
        return {
          error: "Tính năng lưu đơn vào tài khoản hiện chưa được mở.",
          order: null,
          mode: "none" as const,
        };
      const space = await customerSpace(request, context, "/tra-don-hang");
      const order = findVerifiedAccountOrder(
        space.orders,
        input.data.code,
        input.data.email,
        user.email,
      );
      return {
        error: order ? "" : "Không tìm thấy đơn thuộc tài khoản và email này.",
        order: order ?? null,
        mode: "account" as const,
      };
    }
    // The database checks verified ownership. Claiming a guest order is an
    // explicit action; ordinary lookup never transfers ownership.
    const fullCode = input.data.code.toUpperCase();
    if (!/^HB[A-F0-9]{16}$/.test(fullCode))
      return {
        error: "Vui lòng nhập đầy đủ mã đơn HB gồm 18 ký tự.",
        order: null,
        mode: "none" as const,
      };
    const claiming = input.data.intent === "claim";
    const raw = await commerceRpc(
      request,
      context,
      claiming ? "claim_verified_guest_order" : "customer_order_by_code",
      claiming
        ? { p_code: fullCode, p_email: input.data.email }
        : { p_code: fullCode },
    );
    const order = raw === null ? null : commerceOrderSchema.parse(raw);
    return {
      error: order ? "" : "Không tìm thấy đơn thuộc tài khoản và email này.",
      order: order ?? null,
      mode: claiming && order ? ("claimed" as const) : ("account" as const),
    };
  } catch (error) {
    return data(
      {
        error:
          error instanceof Response && error.status === 429
            ? "Vui lòng chờ trước khi thử lại."
            : "Chưa thể tra cứu. Vui lòng thử lại sau.",
        order: null,
        mode: "none" as const,
      },
      { status: error instanceof Response ? error.status : 400 },
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
        eyebrow="TRA ĐƠN HÀNG"
        title="Tìm đơn hàng"
        description={
          state.local
            ? "Nhập mã đơn và email đã dùng khi đặt hàng."
            : state.claimReady
              ? "Nhập mã đơn và email đặt hàng để tra cứu. Nếu đã đăng nhập và xác minh email, bạn có thể lưu đơn mua không đăng nhập vào tài khoản."
              : "Nhập mã đơn và email đã dùng khi mua. Với đơn không đăng nhập, hãy mở trang này trên trình duyệt đã đặt hàng."
        }
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
              placeholder={
                state.local
                  ? "8 ký tự đầu của mã đơn"
                  : "HB… (mã đơn trong lịch sử mua hàng)"
              }
              required
              disabled={busy}
            />
          </label>
          <label>
            Email đặt hàng
            <input
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={state.email}
              maxLength={254}
              required
              placeholder="Email dùng khi đặt hàng"
              disabled={busy}
            />
          </label>
          <button
            className="button primary"
            disabled={busy}
            type="submit"
            name="intent"
            value="lookup"
          >
            {busy ? "Đang kiểm tra…" : "Tra đơn hàng"}
          </button>
          {state.claimReady && (
            <button
              className="button secondary"
              disabled={busy}
              type="submit"
              name="intent"
              value="claim"
            >
              Lưu đơn mua không đăng nhập vào tài khoản
            </button>
          )}
          {result?.error && (
            <p role="alert" className="form-error">
              {result.error}
            </p>
          )}
          {state.local ? (
            <p className="service-note">
              Mở bằng trình duyệt đã đặt hàng và nhập đúng email của đơn. Đơn
              thử cũ dùng {localOrderEmail}. Tra cứu trên thiết bị khác cần xác
              minh qua email.
            </p>
          ) : (
            <p className="service-note">
              {state.claimReady
                ? "Để nhận lại đơn mua không đăng nhập trên thiết bị khác, nhập đầy đủ mã đơn, email đã xác minh và chọn lưu đơn vào tài khoản."
                : state.guest
                  ? "Nếu mua không cần tài khoản, hãy sử dụng đúng trình duyệt đã đặt hàng. Không chia sẻ trình duyệt đã lưu phiên nhận hàng."
                  : "Để tra cứu đơn mua không đăng nhập, hãy mở trang này trên trình duyệt đã đặt hàng."}{" "}
              <Link to="/dang-nhap?next=%2Ftra-don-hang">Đăng nhập</Link>
              <br />
              <Link to="/tai-khoan/don-hang">Xem toàn bộ đơn hàng của tôi</Link>
            </p>
          )}
        </Form>
        <aside className="lookup-help">
          <span>✳</span>
          <h2>Chưa tìm được đơn?</h2>
          <p>
            Kiểm tra lại email đã dùng khi mua và mã đơn bạn lưu. Để bảo vệ
            thông tin của bạn, mã đơn và email không đủ để mở tài khoản hay mã
            kích hoạt đã mua.
          </p>
          <a className="text-link" href="/#ho-tro">
            Cần giúp tìm đơn?
          </a>
        </aside>
      </div>
      {result?.order && (
        <section className="lookup-result" aria-label="Kết quả tra đơn">
          {result.mode === "account" || result.mode === "claimed" ? (
            <>
              {result.mode === "claimed" && (
                <p role="status">
                  Đã lưu đơn vào tài khoản. Bạn có thể xem lại trên các thiết
                  bị đã đăng nhập.
                </p>
              )}
              <CommerceOrderCard order={result.order} />
            </>
          ) : result.mode === "guest" ? (
            <section className="admin-panel">
              <p className="eyebrow">{result.order.code}</p>
              <h2>Đơn hàng của bạn</h2>
              <span className="pill">{statuses[result.order.state]}</span>
              <p>
                Tổng cộng: <strong>{formatVnd(result.order.total)}</strong>
              </p>
              {result.order.items.map((item) => (
                <p key={item.id}>
                  {item.product} · {item.label} × {item.quantity}
                </p>
              ))}
              {result.order.state === "delivered" && !result.products && (
                <Form method="post">
                  <input type="hidden" name="csrf" value={state.csrf} />
                  <input type="hidden" name="code" value={result.order.code} />
                  <input
                    type="hidden"
                    name="email"
                    value={result.lookupEmail}
                  />
                  <button
                    name="intent"
                    value="reveal"
                    type="submit"
                    className="button primary"
                    disabled={busy}
                  >
                    Xem thông tin đã mua
                  </button>
                </Form>
              )}
              {result.order.state === "pending_payment" && state.guest && (
                <Form method="post">
                  <input type="hidden" name="csrf" value={state.csrf} />
                  <input type="hidden" name="code" value={result.order.code} />
                  <input
                    type="hidden"
                    name="email"
                    value={result.lookupEmail}
                  />
                  <button
                    type="submit"
                    name="intent"
                    value="resume"
                    className="button primary"
                    disabled={busy}
                  >
                    Tiếp tục thanh toán
                  </button>
                </Form>
              )}
              {result.products && (
                <>
                  <p>
                    Thông tin chỉ hiển thị trong phiên này. Không chia sẻ cho
                    người khác.
                  </p>
                  <DeliveryUnitList products={result.products} />
                </>
              )}
            </section>
          ) : result.mode === "local" ? (
            <OrderCard order={result.order} />
          ) : null}
        </section>
      )}
    </main>
  );
}
