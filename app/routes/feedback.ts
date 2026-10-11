import { type ActionFunctionArgs, data } from "react-router";
import { feedbackInput } from "../domain/engagement";
import { secureForm } from "../server/form-security.server";
import { localCall } from "../server/local-shop.server";
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
    await localCall(request, context, { action: "feedback", ...input });
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
