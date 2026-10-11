import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { publishedContent } from "../server/content-repository.server";
export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  if (url.pathname === "/ho-tro") return redirect("/#ho-tro");
  if (params.category) {
    if (
      !(await publishedContent(request, context)).categories.some(
        (c) => c.id === params.category,
      )
    )
      throw new Response("Not found", { status: 404 });
    url.searchParams.set("category", params.category);
  }
  return redirect(`/${url.search}#san-pham`);
}
