import { type LoaderFunctionArgs, redirect } from "react-router";
import { requestClient, signedInDestination } from "../server/supabase.server";
export async function loader({ request, context, url }: LoaderFunctionArgs) {
  const client = requestClient(request, context);
  const code = url.searchParams.get("code");
  if (code && code.length < 4096) {
    const result = await client.auth.exchangeCodeForSession(code);
    if (!result.error)
      return redirect(
        await signedInDestination(
          request,
          context,
          url.searchParams.get("next"),
        ),
      );
  }
  return redirect("/dang-nhap?notice=callback-failed");
}
