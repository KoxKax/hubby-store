import type { RouterContextProvider } from "react-router";
import { getStorefrontContent } from "../content/fixtures";
import { validateContent } from "../content/schema";
import type { StorefrontContent } from "../content/types";
import { dataConfig } from "./config.server";
import { localCall, localEnabled } from "./local-shop.server";
import { runtimeContext } from "./runtime-context.server";
import { requestClient } from "./supabase.server";
export async function publishedContent(
  request: Request,
  context: Readonly<RouterContextProvider>,
) {
  const state = context.get(runtimeContext);
  if (state.env.LOCAL_SHOP && localEnabled(request, context)) {
    state.publishedContent ??= localCall<StorefrontContent>(request, context, {
      action: "catalog",
    });
    return state.publishedContent;
  }
  if (!dataConfig(context.get(runtimeContext).env))
    return getStorefrontContent();
  const { data, error } = await requestClient(request, context).rpc(
    "published_storefront",
  );
  if (error || !data)
    throw new Response(
      "Nội dung staging chưa được xuất bản hoặc chưa thể tải",
      { status: 503 },
    );
  try {
    return validateContent(data);
  } catch {
    throw new Response("Nội dung xuất bản không đúng schema", { status: 503 });
  }
}
