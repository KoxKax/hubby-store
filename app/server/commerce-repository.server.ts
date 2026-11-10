import type { RouterContextProvider } from "react-router";
import { redirect } from "react-router";
import { z } from "zod";
import { dataConfig } from "./config.server";
import { identity, requestClient } from "./supabase.server";

const amount = z.number().int().min(0).max(100000000000);
export const commerceOrderSchema = z
  .object({
    id: z.uuid(),
    code: z.string().regex(/^HB[A-F0-9]{16}$/),
    created: z.number().int().positive(),
    expires: z.number().int().positive(),
    state: z.enum([
      "pending_payment",
      "paid",
      "delivered",
      "expired",
      "cancelled",
      "review_required",
      "refunded",
    ]),
    subtotal: amount,
    discount: amount,
    total: amount,
    paid: amount,
    refunded: amount,
    items: z
      .array(
        z.object({
          id: z.uuid(),
          product: z.string().max(160),
          label: z.string().max(160),
          quantity: z.number().int().min(1).max(20),
          price: amount,
        }),
      )
      .max(20),
  })
  .strict();
export const supportTicketSchema = z
  .object({
    id: z.uuid(),
    orderId: z.uuid().nullable(),
    subject: z.string().max(120),
    state: z.enum(["open", "closed"]),
    version: z.number().int().positive(),
    created: z.number().int().positive(),
    messages: z
      .array(
        z
          .object({
            id: z.uuid(),
            role: z.enum(["customer", "owner"]),
            text: z.string().max(3000),
            at: z.number().int().positive(),
          })
          .strict(),
      )
      .max(200),
  })
  .strict();
export const customerSpaceSchema = z
  .object({
    orders: z.array(commerceOrderSchema).max(100),
    tickets: z.array(supportTicketSchema).max(100),
  })
  .strict();
export const submissionSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(["feedback", "review"]),
    category: z.string(),
    message: z.string().max(1500),
    productId: z.string().nullable(),
    rating: z.number().int().min(1).max(5).nullable(),
    state: z.enum(["new", "reviewed"]),
    at: z.number().int().positive(),
  })
  .strict();
export const operationsSchema = customerSpaceSchema
  .extend({ submissions: z.array(submissionSchema).max(100) })
  .strict();
export type CommerceOrder = z.infer<typeof commerceOrderSchema>;
export type SupportTicket = z.infer<typeof supportTicketSchema>;

export async function commerceRpc(
  request: Request,
  context: Readonly<RouterContextProvider>,
  name: string,
  args: Record<string, unknown> = {},
) {
  const client = requestClient(request, context);
  const result = await client.rpc(name, args);
  if (result.error) {
    const code = result.error.code;
    throw new Response(
      code === "P0429"
        ? "Bạn chờ một chút trước khi gửi thêm nhé."
        : code === "40001"
          ? "Nội dung đã thay đổi. Bạn tải lại trước khi trả lời nhé."
          : "Chưa thể xử lý yêu cầu. Vui lòng kiểm tra và thử lại.",
      {
        status:
          code === "P0429"
            ? 429
            : code === "42501"
              ? 403
              : code === "40001"
                ? 409
                : 400,
      },
    );
  }
  return result.data as unknown;
}
export async function requireCustomer(
  request: Request,
  context: Readonly<RouterContextProvider>,
  next: string,
) {
  if (!(await identity(request, context)))
    throw redirect(`/dang-nhap?next=${encodeURIComponent(next)}`);
}
export async function customerSpace(
  request: Request,
  context: Readonly<RouterContextProvider>,
  next: string,
) {
  await requireCustomer(request, context, next);
  try {
    return customerSpaceSchema.parse(
      await commerceRpc(request, context, "customer_space"),
    );
  } catch (error) {
    if (error instanceof Response) throw error;
    throw new Response("Chưa thể tải đơn hàng và hỗ trợ.", { status: 503 });
  }
}
export async function customerOrder(
  request: Request,
  context: Readonly<RouterContextProvider>,
  id: string,
) {
  await requireCustomer(request, context, `/don-hang/${id}`);
  if (!z.uuid().safeParse(id).success)
    throw new Response("Không tìm thấy đơn hàng.", { status: 404 });
  const value = await commerceRpc(request, context, "customer_order", {
    p_id: id,
  });
  if (value === null)
    throw new Response("Không tìm thấy đơn hàng.", { status: 404 });
  try {
    return commerceOrderSchema.parse(value);
  } catch {
    throw new Response("Chưa thể tải đơn hàng.", { status: 503 });
  }
}
export function commerceConfigured(env: Parameters<typeof dataConfig>[0]) {
  return !!dataConfig(env);
}
