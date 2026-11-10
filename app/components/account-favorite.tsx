import { Link, useFetcher, useRouteLoaderData } from "react-router";
import type { loader as rootLoader } from "../root";
import { Icon } from "./icons";

export function AccountFavorite({ productId }: { productId: string }) {
  const root = useRouteLoaderData<typeof rootLoader>("root");
  const fetcher = useFetcher<{
    ok?: boolean;
    productId?: string;
    message?: string;
    error?: string;
  }>();
  if (!root?.signedIn) return null;
  return (
    <div className="account-save-control">
      <fetcher.Form method="post" action="/tai-khoan/yeu-thich">
        <input type="hidden" name="csrf" value={root.csrf} />
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="intent" value="save" />
        <button
          type="submit"
          className="button secondary"
          disabled={fetcher.state !== "idle"}
        >
          <Icon name="heart" />
          {fetcher.state !== "idle" ? "Đang lưu…" : "Lưu vào tài khoản"}
        </button>
      </fetcher.Form>
      {fetcher.data?.productId === productId && fetcher.data?.ok && (
        <p role="status">
          {fetcher.data.message}{" "}
          <Link to="/tai-khoan/yeu-thich">Xem danh sách</Link>
        </p>
      )}
      {fetcher.data?.error && (
        <p role="alert" className="form-error">
          {fetcher.data.error}
        </p>
      )}
    </div>
  );
}
