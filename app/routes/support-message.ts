import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { z } from "zod";
import { findOwnedOrder, localOrderEmail } from "../domain/order-lookup";
import { secureForm } from "../server/form-security.server";
import { localCall } from "../server/local-shop.server";
export function loader() {
  return new Response(null, { status: 405 });
}
export async function action({ request, context }: ActionFunctionArgs) {
  try {
    const form = await secureForm(request, 6000);
    const parsed = z
      .object({
        code: z.string().trim().min(8).max(36),
        message: z.string().trim().min(3).max(1500),
      })
      .safeParse({ code: form.get("code"), message: form.get("message") });
    if (!parsed.success)
      return data(
        { error: "Nhập mã đơn và câu hỏi từ 3–1500 ký tự." },
        { status: 400 },
      );
    const owned = await localCall<{ orders: { id: string }[] }>(
      request,
      context,
      { action: "list" },
    );
    const order = findOwnedOrder(
      owned.orders,
      parsed.data.code,
      localOrderEmail,
    );
    if (!order)
      return data(
        {
          error:
            "Chưa tìm thấy đơn có quyền truy cập trong phiên này. Dùng Tra đơn hàng hoặc mở trình duyệt đã đặt hàng.",
        },
        { status: 404 },
      );
    await localCall(request, context, {
      action: "ticket",
      id: order.id,
      subject: "Câu hỏi từ hộp hỗ trợ",
      text: parsed.data.message,
    });
    return {
      message:
        "Đã lưu câu hỏi vào đơn hàng trên máy này. Xem phản hồi ở trang đơn; chưa chuyển tin nhắn tới Facebook hoặc Telegram.",
      orderId: order.id,
    };
  } catch (error) {
    return data(
      {
        error:
          error instanceof Response && error.status === 429
            ? "Vui lòng chờ trước khi gửi thêm."
            : "Chưa thể gửi câu hỏi. Vui lòng thử lại.",
      },
      { status: 400 },
    );
  }
}
