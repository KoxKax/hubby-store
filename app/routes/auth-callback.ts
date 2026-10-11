import { type LoaderFunctionArgs, redirect } from "react-router";
import { safeNext } from "../domain/request-security";
import { requestClient } from "../server/supabase.server";
export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const client = requestClient(request, context);
  const code = url.searchParams.get("code");
  if (code && code.length < 4096) {
    const result = await client.auth.exchangeCodeForSession(code);
    if (!result.error) return redirect(safeNext(url.searchParams.get("next")));
  }
  return redirect("/dang-nhap?notice=callback-failed");
}
