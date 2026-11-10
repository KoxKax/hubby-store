import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { z } from "zod";
import {
  biteTrackingGateway,
  biteTrackingReady,
  catalogStateSchema,
} from "../server/bite-catalog.server";
import { secureForm } from "../server/form-security.server";
import { runtimeContext } from "../server/runtime-context.server";
import { requireOwner } from "../server/supabase.server";
import { supplierGateway, supplierStorageReady } from "../server/supplier.server";

export { ErrorBoundary } from "./admin";
export function headers() {
  return { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" };
}

// Read on demand so opening the CMS never downloads the whole supplier catalog.
export async function loader({ request, context, url }: LoaderFunctionArgs) {
  const { user } = await requireOwner(request, context, url);
  const env = context.get(runtimeContext).env;
  if (!biteTrackingReady(env))
    return { ready: false, items: [], total: 0, page: 1 };
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const requestedPage = Number(url.searchParams.get("page"));
  const page = Number.isSafeInteger(requestedPage)
    ? Math.min(334, Math.max(1, requestedPage))
    : 1;
  let catalog: ReturnType<typeof catalogStateSchema.parse>;
  try {
    catalog = catalogStateSchema.parse(
      await biteTrackingGateway(env).rpc("bite_catalog_admin", {
        p_actor: user.id,
        p_search: q,
        p_page: page,
      }),
    );
  } catch {
    return { ready: false, items: [], total: 0, page };
  }
  const now = Date.now();
  const recent = (s: string | null) =>
    s !== null && Number.isFinite(Date.parse(s)) &&
    now - Date.parse(s) <= 15 * 60_000;
  return {
    ready: true,
    total: catalog.total,
    page,
    items: catalog.items.map((offer) => ({
      id: offer.externalId,
      name: offer.name,
      price: offer.price,
      currency: offer.currency,
      stock: offer.stock,
      delivery: offer.delivery,
      eligible:
        offer.active && offer.inStock && offer.stock !== 0 &&
        (offer.delivery === "automatic" || offer.delivery === "manual") &&
        offer.currency === "USD" &&
        Number(offer.price) > 0 && recent(offer.syncedAt) &&
        recent(catalog.sync.lastSuccess) && !catalog.sync.issue,
    })),
  };
}

export async function action({ request, context, url }: ActionFunctionArgs) {
  const form = await secureForm(request, 12_000);
  const { client, user } = await requireOwner(request, context, url);
  const env = context.get(runtimeContext).env;
  if (!supplierStorageReady(env))
    return data({ message: "Nguồn hàng chưa sẵn sàng để liên kết.", saved: false }, { status: 503 });
  const parsed = z.object({
    variantId: z.uuid(),
    variantKey: z.string().min(1).max(80),
    externalId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
    maxPending: z.coerce.number().int().min(1).max(100),
  }).safeParse({
    variantId: form.get("variantId"),
    variantKey: form.get("variantKey"),
    externalId: form.get("externalId"),
    maxPending: form.get("maxPending"),
  });
  if (!parsed.success || form.get("confirmed") !== "yes")
    return data({ message: "Kiểm tra lại gói, mã nguồn và xác nhận trước khi lưu.", saved: false }, { status: 400 });
  const input = parsed.data;
  // A local draft option has no real variant id yet. Also prevent mapping
  // a stale/deactivated option even if the browser kept an old editor open.
  const { data: variant, error: variantError } = await client
    .from("product_variants")
    .select("id,variant_key,enabled")
    .eq("id", input.variantId)
    .eq("variant_key", input.variantKey)
    .eq("enabled", true)
    .maybeSingle();
  if (variantError || !variant)
    return data({ message: "Gói chưa được xuất bản hoặc đã thay đổi. Hãy tải lại mục Sản phẩm.", saved: false }, { status: 409 });
  const enabled = form.get("enabled") === "yes";
  if (enabled && !biteTrackingReady(env))
    return data({ message: "Chưa có dữ liệu nguồn hàng đủ mới để bật tự động.", saved: false }, { status: 409 });
  try {
    const changed = await supplierGateway(env).rpc("set_supplier_binding", {
      p_actor: user.id,
      p_variant: input.variantId,
      p_external: input.externalId,
      p_enabled: enabled,
      p_max: input.maxPending,
    });
    if (changed !== true) throw new Error("Binding not saved");
    return {
      saved: true,
      message: enabled ? "Đã liên kết và bật tự đặt hàng cho gói này." : "Đã lưu nguồn hàng, chưa bật tự đặt hàng.",
      binding: { variantId: input.variantId, externalId: input.externalId, enabled, maxPending: input.maxPending },
    };
  } catch {
    return data({ saved: false, message: "Chưa lưu được. Kiểm tra mã nguồn, hàng còn bán, hình thức giao và thời điểm đồng bộ rồi thử lại." }, { status: 409 });
  }
}
