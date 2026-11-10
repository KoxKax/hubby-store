import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, Form, Link, useActionData, useLoaderData } from "react-router";
import { EmptyState, PageIntro, ProductCard } from "../components/storefront";
import { csrfToken, secureForm } from "../server/form-security.server";
import {
  accountSavedProducts,
  changeSavedProduct,
} from "../server/saved-products.server";

export function meta() {
  return [{ title: "Sản phẩm đã lưu vào tài khoản — Hubby" }];
}
export async function loader({ request, context }: LoaderFunctionArgs) {
  return {
    products: await accountSavedProducts(request, context),
    csrf: csrfToken(request, context),
  };
}
export async function action({ request, context }: ActionFunctionArgs) {
  try {
    const form = await secureForm(request, 3000);
    for (const field of form.keys())
      if (!["csrf", "productId", "intent"].includes(field))
        throw new Response("Thông tin không hợp lệ", { status: 400 });
    if (
      form.getAll("productId").length !== 1 ||
      form.getAll("intent").length !== 1
    )
      throw new Response("Thông tin không hợp lệ", { status: 400 });
    const intent = form.get("intent");
    if (intent !== "save" && intent !== "remove")
      throw new Response("Thao tác không hợp lệ", { status: 400 });
    const productId = String(form.get("productId"));
    await changeSavedProduct(request, context, productId, intent === "save");
    return {
      ok: true as const,
      productId,
      message:
        intent === "save"
          ? "Đã lưu sản phẩm vào tài khoản."
          : "Đã bỏ sản phẩm khỏi danh sách.",
    };
  } catch (error) {
    if (error instanceof Response && error.status === 302) throw error;
    return data(
      {
        ok: false as const,
        error:
          error instanceof Response
            ? await error.text()
            : "Chưa thể thay đổi danh sách. Bạn thử lại nhé.",
      },
      { status: error instanceof Response ? error.status : 503 },
    );
  }
}
export default function SavedProducts() {
  const state = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return (
    <main id="main" tabIndex={-1} className="container favorites-page">
      <PageIntro
        eyebrow="TÀI KHOẢN"
        title="Sản phẩm đã lưu"
        description="Những gói bạn đã lưu vào tài khoản để xem lại trên thiết bị khác."
      />
      {result && (
        <p role={result.ok ? "status" : "alert"}>
          {result.ok ? result.message : result.error}
        </p>
      )}
      {state.products.length ? (
        <div className="product-grid">
          {state.products.map((product) => (
            <div key={product.id} className="saved-product-item">
              <ProductCard product={product} />
              <Form method="post">
                <input type="hidden" name="csrf" value={state.csrf} />
                <input type="hidden" name="productId" value={product.id} />
                <button
                  type="submit"
                  name="intent"
                  value="remove"
                  className="plain-link"
                >
                  Bỏ lưu {product.name}
                </button>
              </Form>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Bạn chưa lưu sản phẩm vào tài khoản"
          description="Mở trang sản phẩm và chọn “Lưu vào tài khoản” để xem lại tại đây."
        />
      )}
      <Link className="text-link continue-shopping" to="/yeu-thich">
        Xem danh sách yêu thích trên trình duyệt này
      </Link>
    </main>
  );
}
