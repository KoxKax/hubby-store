import { type ActionFunctionArgs, data } from "react-router";
import { reviewInput } from "../domain/engagement";
import { commerceRpc } from "../server/commerce-repository.server";
import { publishedContent } from "../server/content-repository.server";
import { secureForm } from "../server/form-security.server";
import { localCall, localEnabled } from "../server/local-shop.server";
export function loader() {
  return new Response(null, { status: 405 });
}
export async function action({ request, context }: ActionFunctionArgs) {
  try {
    const form = await secureForm(request, 8000);
    const input = reviewInput.parse(
      Object.fromEntries(
        ["key", "productId", "rating", "message"].map((key) => [
          key,
          form.get(key),
        ]),
      ),
    );
    const product = (await publishedContent(request, context)).products.find(
      (p) => p.id === input.productId,
    );
    if (!product)
      return data(
        { error: "Bạn chọn một sản phẩm trong danh mục nhé." },
        { status: 400 },
      );
    if (localEnabled(request, context))
      await localCall(request, context, {
        action: "feedback",
        key: input.key,
        category: "review",
        message: `${product.name} · ${input.rating}/5\n${input.message}`,
      });
    else
      await commerceRpc(request, context, "submit_community", {
        p_key: input.key,
        p_kind: "review",
        p_category: "review",
        p_body: input.message,
        p_product: input.productId,
        p_rating: input.rating,
      });
    return { ok: true };
  } catch (error) {
    return data(
      {
        error:
          error instanceof Response
            ? error.status === 503
              ? "Đánh giá đang tạm đóng. Bạn thử lại sau nhé."
              : await error.text()
            : "Bạn chọn sản phẩm, điểm từ 1 đến 5 và viết từ 10 đến 1.000 ký tự nhé.",
      },
      { status: error instanceof Response ? error.status : 400 },
    );
  }
}
