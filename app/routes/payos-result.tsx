import type { LoaderFunctionArgs } from "react-router";
import { Link, redirect, useLoaderData, useSearchParams } from "react-router";
import { PageIntro } from "../components/storefront";
import { lastGuestOrderCode } from "../server/payos-guest.server";
import { identity, requestClient } from "../server/supabase.server";

export function meta() {
  return [{ title: "Trạng thái thanh toán — Hubby" }];
}
export function headers() {
  return {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
  };
}
export async function loader({ request, context }: LoaderFunctionArgs) {
  const code = new URL(request.url).searchParams.get("orderCode");
  if (code && /^[0-9]{1,11}$/.test(code) && await identity(request, context)) {
    const result = await requestClient(request, context).rpc("customer_order_for_payos_code", { p_code: Number(code) });
    if (!result.error && typeof result.data === "string" && /^[a-f0-9-]{36}$/i.test(result.data)) return redirect(`/don-hang/${result.data}`);
  }
  return { lastOrderCode: lastGuestOrderCode(request) };
}

// Browser redirects are informational only. A signed, durable webhook is the
// sole authority to change an order's paid/delivery state.
export default function PayosResult() {
  const [params] = useSearchParams();
  const { lastOrderCode } = useLoaderData<typeof loader>();
  const cancelled =
    params.get("cancel") === "true" || params.get("cancel") === "1";
  return (
    <main className="container checkout-page" id="main" tabIndex={-1}>
      <PageIntro
        eyebrow="THANH TOÁN"
        title={
          cancelled ? "Bạn đã quay lại Hubby" : "Hubby đang kiểm tra thanh toán"
        }
        description={
          cancelled
            ? "Nếu bạn chưa chuyển khoản, đơn sẽ được xử lý theo thời hạn thanh toán. Nếu đã chuyển tiền, Hubby vẫn kiểm tra giao dịch qua ngân hàng."
            : "Trạng thái thanh toán sẽ được cập nhật khi Hubby nhận và xác minh giao dịch từ ngân hàng. Việc quay về trang này không có nghĩa là đơn đã thanh toán thành công."
        }
      />
      <div className="checkout-form">
        {lastOrderCode && (
          <p>
            Mã đơn gần nhất của bạn: <strong>{lastOrderCode}</strong>. Hãy lưu
            mã này để tra lại cùng email đã nhập.
          </p>
        )}
        <p>
          Bạn có thể kiểm tra tình trạng đơn hàng bằng mã đơn và email đã sử
          dụng khi đặt hàng.
        </p>
        <Link className="button primary" to="/tra-don-hang">
          Tra cứu đơn hàng
        </Link>
        <Link className="text-link" to="/">
          Về trang chủ
        </Link>
      </div>
    </main>
  );
}
