import { type ActionFunctionArgs, data } from "react-router";
import { secureForm } from "../server/form-security.server";
import { saveTheme } from "../server/theme.server";
export function loader() {
  return new Response(null, { status: 405 });
}
export async function action({ request, context }: ActionFunctionArgs) {
  const form = await secureForm(request, 2000);
  const theme = form.get("theme");
  if (theme !== "dark" && theme !== "light")
    return data({ error: "Chế độ không hợp lệ." }, { status: 400 });
  saveTheme(request, context, theme);
  return { ok: true, theme };
}
