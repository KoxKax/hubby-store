import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { secureForm } from "../server/form-security.server";
import { localCall } from "../server/local-shop.server";
export function loader() {
  return new Response(null, { status: 405 });
}
export async function action({ request, context }: ActionFunctionArgs) {
  try {
    const form = await secureForm(request, 12_000);
    const command = JSON.parse(String(form.get("command"))) as Record<
      string,
      unknown
    >;
    return await localCall<{
      payload?: string;
      message?: string;
      ok?: boolean;
    }>(request, context, command);
  } catch (error) {
    if (error instanceof Response)
      return data({ error: await error.text() }, { status: error.status });
    return data({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
  }
}
