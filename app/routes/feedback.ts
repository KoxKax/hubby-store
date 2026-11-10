import { type ActionFunctionArgs, data } from "react-router";
import { feedbackInput } from "../domain/engagement";
import { commerceRpc } from "../server/commerce-repository.server";
import { secureForm } from "../server/form-security.server";
import { localCall, localEnabled } from "../server/local-shop.server";
export function loader() {
  return new Response(null, { status: 405 });
}
export async function action({ request, context }: ActionFunctionArgs) {
  try {
    const form = await secureForm(request, 8000);
    const input = feedbackInput.parse(
      Object.fromEntries(
        ["key", "category", "message"].map((key) => [key, form.get(key)]),
      ),
    );
    if (localEnabled(request, context))
      await localCall(request, context, { action: "feedback", ...input });
    else {
      if (input.category === "review")
        return data(
          { error: "Dùng biểu mẫu đánh giá sản phẩm nhé." },
          { status: 400 },
        );
      await commerceRpc(request, context, "submit_community", {
        p_key: input.key,
        p_kind: "feedback",
        p_category: input.category,
        p_body: input.message,
      });
    }
    return { ok: true, message: "Cảm ơn bạn! Hubby đã nhận được góp ý." };
  } catch (error) {
    return data(
      {
        error:
          error instanceof Response
            ? error.status === 503
              ? "Góp ý đang tạm đóng. Bạn thử lại sau nhé."
              : await error.text()
            : "Bạn chọn chủ đề và viết góp ý từ 10 đến 1.500 ký tự nhé.",
      },
      { status: error instanceof Response ? error.status : 400 },
    );
  }
}
