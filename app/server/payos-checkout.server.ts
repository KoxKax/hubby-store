import { z } from "zod";
import type { PayosPaymentLink, TrustedPayosOrder } from "./payos.server";
import { createPayosPaymentLink } from "./payos.server";
import { payosGuestHash } from "./payos-guest.server";
import { payosAdminClient } from "./payos-store.server";
import type { HubbyEnv } from "./runtime-context.server";
import { sealStockUnit } from "./stock-seal.server";

const cart = z
  .array(
    z
      .object({
        variantId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
        quantity: z.number().int().min(1).max(20),
      })
      .strict(),
  )
  .min(1)
  .max(20);
const claimed = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("claimed"),
    orderId: z.uuid(),
    orderCode: z.number().int().safe().positive(),
    total: z.number().int().min(2000),
    createdAt: z.number().int().positive(),
    expiresAt: z.number().int().positive(),
  }),
  z.object({
    status: z.literal("linked"),
    checkoutUrl: z.string().url(),
    orderId: z.uuid(),
    orderCode: z.number().int().safe().positive(),
  }),
  z.object({ status: z.literal("uncertain") }),
  z.object({ status: z.literal("closed") }),
]);

export interface CheckoutInput {
  requestKey: string;
  guestToken: string;
  email: string;
  userId: string | null;
  lines: unknown;
  coupon: string;
  canvaEmail?: string;
}

/** Only a verified server-side Auth identity can own a payable order. */
export function checkoutBuyerIdentity(
  user: { id: string; email: string; emailVerified: boolean } | null,
): { userId: string; email: string } {
  if (!user)
    checkoutError("Vui lòng đăng nhập để nhận sản phẩm sau thanh toán.", 409);
  if (user.emailVerified !== true)
    checkoutError(
      "Vui lòng xác minh email tài khoản trước khi thanh toán.",
      409,
    );
  const email = user.email.trim().toLowerCase();
  if (
    !z.uuid().safeParse(user.id).success ||
    email.length > 254 ||
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
  )
    checkoutError(
      "Email tài khoản chưa hợp lệ. Hãy cập nhật và xác minh email trước khi mua.",
      409,
    );
  return { userId: user.id, email };
}

export interface PayosCheckoutGateway {
  rpc(name: string, params: Record<string, unknown>): Promise<unknown>;
  createLink(order: TrustedPayosOrder): Promise<PayosPaymentLink>;
}

function checkoutError(message: string, status = 409): never {
  throw new Response(message, { status });
}

export function safePayosUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return checkoutError("Liên kết thanh toán không hợp lệ.", 503);
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "pay.payos.vn" ||
    url.username ||
    url.password ||
    url.port
  )
    checkoutError("Liên kết thanh toán không hợp lệ.", 503);
  return url.href;
}

export async function startPayosCheckout(
  input: CheckoutInput,
  gateway: PayosCheckoutGateway,
) {
  const parsed = cart.safeParse(input.lines);
  const email = input.email.trim().toLowerCase();
  if (
    !z.uuid().safeParse(input.requestKey).success ||
    !/^[A-Za-z0-9_-]{43}$/.test(input.guestToken) ||
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ||
    email.length > 254 ||
    (input.userId !== null && !z.uuid().safeParse(input.userId).success) ||
    !parsed.success ||
    new Set(parsed.data.map((l) => l.variantId)).size !== parsed.data.length
  )
    checkoutError("Giỏ hàng hoặc thông tin liên hệ chưa hợp lệ.", 400);
  // Anonymous orders can be redeemed only with the same HttpOnly guest
  // browser proof, the full order code and its email (see guest lookup RPC).
  // The credential must survive the external payOS redirect.
  if (input.coupon.trim())
    checkoutError("Mã ưu đãi chưa được bật cho thanh toán trực tuyến.", 409);
  const guestHash = await payosGuestHash(input.guestToken);
  const needsCanva = parsed.data.some((line) => line.variantId === "canva-36");
  const canvaEmail = needsCanva ? (input.canvaEmail ?? "").trim().toLowerCase() : "";
  if (needsCanva && (!z.email().max(254).safeParse(canvaEmail).success ||
      parsed.data.some((line) => line.variantId === "canva-36" && line.quantity !== 1)))
    checkoutError("Nhập email Canva hợp lệ và mua một lời mời mỗi đơn. Muốn dùng email khác, hãy tạo đơn riêng.", 400);
  await gateway.rpc("reserve_payos_checkout", {
    p_request: input.requestKey,
    p_email: email,
    p_guest_hash: guestHash,
    p_lines: parsed.data.map((l) => ({
      variantKey: l.variantId,
      quantity: l.quantity,
    })),
    p_user: input.userId,
    p_canva_email: canvaEmail,
  });
  const state = claimed.safeParse(
    await gateway.rpc("claim_payos_link_attempt", {
      p_request: input.requestKey,
      p_guest_hash: guestHash,
    }),
  );
  if (!state.success)
    checkoutError("Chưa thể xác minh liên kết đơn hàng.", 503);
  if (state.data.status === "linked")
    return {
      url: safePayosUrl(state.data.checkoutUrl),
      orderId: state.data.orderId,
    };
  if (state.data.status === "uncertain")
    checkoutError(
      "Đơn đã được gửi sang payOS nhưng chưa có kết quả chắc chắn. Hubby cần đối chiếu trước khi gửi lại.",
      409,
    );
  if (state.data.status === "closed")
    checkoutError(
      "Đơn đã hết hạn hoặc không còn chờ thanh toán. Vui lòng tạo đơn mới.",
      409,
    );
  const order: TrustedPayosOrder = {
    numericCode: state.data.orderCode,
    amountVnd: state.data.total,
    createdAt: state.data.createdAt,
    expiresAt: state.data.expiresAt,
    state: "pending_payment",
    reservationValid: true,
  };
  const link = await gateway.createLink(order);
  // Validate the provider destination before persisting it. A malformed or
  // unexpected URL must never enter the durable payment-link record.
  const checkoutUrl = safePayosUrl(link.checkoutUrl);
  if (
    link.numericCode !== order.numericCode ||
    !(await gateway.rpc("attach_payos_link", {
      p_order: state.data.orderId,
      p_code: state.data.orderCode,
      p_link_id: link.paymentLinkId,
      p_account: link.receivingAccount,
      p_amount: state.data.total,
      p_url: checkoutUrl,
    }))
  )
    checkoutError(
      "Đã tạo yêu cầu thanh toán nhưng chưa ghi nhận được liên kết. Hubby cần đối chiếu đơn này.",
      503,
    );
  return { url: checkoutUrl, orderId: state.data.orderId };
}

// A deliberate second activation gate protects the deployed mock Worker.
// Do not set until real stock, delivery, reversals and webhook UAT are accepted.
export function payosCheckoutReady(env: HubbyEnv) {
  return (
    env.APP_ENV === "staging" &&
    env.DATA_MODE === "supabase" &&
    env.SUPABASE_ENVIRONMENT === "staging" &&
    (env.SUPPLIERS_MODE === "mock" ||
      (env.SUPPLIERS_MODE === "bite" && env.BITE_SCHEMA_READY === "true")) &&
    env.PAYMENTS_MODE === "payos" &&
    env.PAYOS_CHECKOUT_READY === "true" &&
    !!env.SUPABASE_URL &&
    !!env.SUPABASE_SECRET_KEY &&
    !!env.PAYOS_CLIENT_ID &&
    !!env.PAYOS_API_KEY &&
    !!env.PAYOS_CHECKSUM_KEY &&
    /^[0-9a-f]{64}$/i.test(env.INVENTORY_ENCRYPTION_KEY_V1 ?? "") &&
    !!env.SITE_ORIGIN
  );
}

export function payosCheckoutGateway(env: HubbyEnv): PayosCheckoutGateway {
  if (!payosCheckoutReady(env))
    checkoutError("Thanh toán trực tuyến chưa sẵn sàng.", 503);
  const {
    SUPABASE_URL: url,
    SUPABASE_SECRET_KEY: secretKey,
    PAYOS_CLIENT_ID: clientId,
    PAYOS_API_KEY: apiKey,
    PAYOS_CHECKSUM_KEY: checksumKey,
    SITE_ORIGIN: siteOrigin,
  } = env;
  if (!url || !secretKey || !clientId || !apiKey || !checksumKey || !siteOrigin)
    checkoutError("Thiếu cấu hình thanh toán máy chủ.", 503);
  const client = payosAdminClient(url, secretKey);
  return {
    async rpc(name, params) {
      if (
        ![
          "reserve_payos_checkout",
          "claim_payos_link_attempt",
          "attach_payos_link",
        ].includes(name)
      )
        checkoutError("Yêu cầu không hợp lệ.", 400);
      const operation =
        name === "reserve_payos_checkout" && env.SUPPLIERS_MODE === "bite"
          ? "reserve_activation_checkout"
          : name;
      const { p_canva_email: canvaEmail, ...baseParams } = params;
      let activation = null;
      let fingerprint: string | null = null;
      if (operation === "reserve_activation_checkout" && typeof canvaEmail === "string" && canvaEmail) {
        const requestId = z.uuid().parse(params.p_request);
        const key = env.INVENTORY_ENCRYPTION_KEY_V1;
        if (!key || !/^[0-9a-f]{64}$/i.test(key)) checkoutError("Chưa thể lưu thông tin kích hoạt an toàn.", 503);
        activation = await sealStockUnit(
          { id: requestId, variantId: requestId },
          { type: "raw_text", text: JSON.stringify({ purpose: "canva_activation", email: canvaEmail }) },
          1, { 1: key },
        );
        const hmacKey = await crypto.subtle.importKey("raw",
          Uint8Array.from(key.match(/../g) ?? [], (part) => Number.parseInt(part, 16)),
          { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        const signature = await crypto.subtle.sign("HMAC", hmacKey,
          new TextEncoder().encode(`canva-activation:${requestId}:${canvaEmail}`));
        fingerprint = Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
      }
      const values =
        operation === "reserve_activation_checkout"
          ? {
              ...baseParams,
              p_bite_ready: env.BITE_READY === "true" && !!env.BITE_API_KEY,
              p_activation: activation,
              p_fingerprint: fingerprint,
            }
          : baseParams;
      const { data, error } = await client.rpc(operation, values);
      if (error) {
        // Never log RPC parameters, email, guest proof or encrypted payloads.
        console.warn("Checkout database operation failed", {
          operation, code: /^[A-Z0-9]{5,12}$/.test(error.code ?? "") ? error.code : "unknown",
        });
        const messages: Record<string, string> = {
          "Bite offer unavailable or stale": "Tồn kho đang được cập nhật. Vui lòng tải lại trang sau ít phút.",
          "Bite stock or queue reserved": "Số lượng còn lại vừa được giữ cho đơn khác. Vui lòng kiểm tra lại sản phẩm.",
          "Supplier queue is full": "Gói này đang có nhiều đơn chờ xử lý. Vui lòng quay lại sau.",
          "No verified inventory for this variant": "Gói này hiện không còn hàng để đặt. Vui lòng chọn gói khác.",
          "Activation idempotency conflict": "Email Canva đã thay đổi so với yêu cầu trước. Hãy tải lại trang để tạo yêu cầu mới.",
          "Checkout idempotency conflict": "Giỏ hàng hoặc thông tin đặt hàng đã thay đổi. Hãy tải lại trang trước khi tiếp tục.",
          "Canva activation email required": "Vui lòng nhập email Canva nhận lời mời.",
          "Verified customer email mismatch": "Email tài khoản chưa được xác minh. Hãy xác minh email rồi đặt lại đơn.",
          "Variant unavailable or unpriced": "Gói này vừa thay đổi hoặc chưa có giá bán. Vui lòng mở lại trang sản phẩm.",
        };
        checkoutError(messages[error.message] ?? "Chưa thể tạo đơn do lỗi hệ thống. Vui lòng thử lại sau.", 409);
      }
      return data;
    },
    createLink: (order) =>
      createPayosPaymentLink(
        order,
        {
          clientId,
          apiKey,
          checksumKey,
        },
        siteOrigin,
      ),
  };
}
