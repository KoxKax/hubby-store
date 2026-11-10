import type { RouterContextProvider } from "react-router";
import { redirect } from "react-router";
import { z } from "zod";
import { publishedContent } from "./content-repository.server";
import { identity, requestClient } from "./supabase.server";

const key = z
  .string()
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const savedRows = z
  .array(
    z
      .object({
        product_id: z.uuid(),
        products: z.object({ catalog_key: key }).strict(),
      })
      .strict(),
  )
  .max(20);
export async function savedCustomer(
  request: Request,
  context: Readonly<RouterContextProvider>,
) {
  const user = await identity(request, context);
  if (!user) throw redirect("/dang-nhap?next=%2Ftai-khoan%2Fyeu-thich");
  if (!z.uuid().safeParse(user.id).success)
    throw new Response("Chưa xác minh được tài khoản", { status: 503 });
  return { user, client: requestClient(request, context) };
}
export async function accountSavedProducts(
  request: Request,
  context: Readonly<RouterContextProvider>,
) {
  const { user, client } = await savedCustomer(request, context);
  const result = await client
    .from("wishlists")
    .select("product_id,products!inner(catalog_key)")
    .eq("user_id", user.id)
    .eq("products.status", "published")
    .order("created_at", { ascending: false })
    .limit(20);
  if (result.error)
    throw new Response("Chưa thể tải sản phẩm đã lưu. Bạn thử lại nhé.", {
      status: 503,
    });
  const rows = savedRows.safeParse(result.data);
  if (!rows.success)
    throw new Response("Danh sách đã lưu chưa thể tải", { status: 503 });
  const content = await publishedContent(request, context);
  const selected = new Map(
    rows.data.map((row, index) => [row.products.catalog_key, index]),
  );
  return content.products
    .filter((product) => selected.has(product.id))
    .sort(
      (first, second) =>
        (selected.get(first.id) ?? 0) - (selected.get(second.id) ?? 0),
    );
}
export async function changeSavedProduct(
  request: Request,
  context: Readonly<RouterContextProvider>,
  productId: string,
  save: boolean,
) {
  const { user, client } = await savedCustomer(request, context);
  if (!key.safeParse(productId).success)
    throw new Response("Mã sản phẩm không hợp lệ", { status: 400 });
  const content = await publishedContent(request, context);
  if (!content.products.some((product) => product.id === productId))
    throw new Response("Sản phẩm này không còn trong danh mục", {
      status: 404,
    });
  const found = await client
    .from("products")
    .select("id")
    .eq("catalog_key", productId)
    .eq("status", "published")
    .maybeSingle();
  if (found.error)
    throw new Response("Chưa thể kiểm tra sản phẩm", { status: 503 });
  const uuid = z.uuid().safeParse(found.data?.id);
  if (!uuid.success)
    throw new Response("Sản phẩm này không còn trong danh mục", {
      status: 404,
    });
  // One DB write. User identity is server-verified, never a form field.
  // Existing RLS still owns isolation and published-product eligibility.
  const result = save
    ? await client
        .from("wishlists")
        .insert({ user_id: user.id, product_id: uuid.data })
    : await client
        .from("wishlists")
        .delete()
        .eq("user_id", user.id)
        .eq("product_id", uuid.data);
  if (result.error && !(save && result.error.code === "23505"))
    throw new Response("Chưa thể thay đổi danh sách đã lưu. Bạn thử lại nhé.", {
      status: 503,
    });
}
