import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  data,
  Form,
  redirect,
  useActionData,
  useLoaderData,
} from "react-router";
import { csrfToken, secureForm } from "../server/form-security.server";
import { requestClient, signedInDestination } from "../server/supabase.server";
export function loader({ request, context, url }: LoaderFunctionArgs) {
  const hash = url.searchParams.get("token_hash") ?? "";
  const type = url.searchParams.get("type");
  if (!/^[a-f0-9]{64}$/.test(hash) || (type !== "email" && type !== "recovery"))
    throw new Response("Link xác nhận không hợp lệ", { status: 400 });
  return { hash, type, csrf: csrfToken(request, context) };
}
export async function action({ request, context }: ActionFunctionArgs) {
  const form = await secureForm(request, 4000);
  const hash = String(form.get("hash") ?? "");
  const type = form.get("type");
  if (!/^[a-f0-9]{64}$/.test(hash) || (type !== "email" && type !== "recovery"))
    throw new Response("Link xác nhận không hợp lệ", { status: 400 });
  const result = await requestClient(request, context).auth.verifyOtp({
    token_hash: hash,
    type,
  });
  if (result.error)
    return data(
      { message: "Link không đúng hoặc đã hết hạn. Yêu cầu hướng dẫn mới." },
      { status: 400 },
    );
  return redirect(
    await signedInDestination(
      request,
      context,
      type === "recovery" ? "/dat-lai-mat-khau" : "/tai-khoan",
    ),
  );
}
export default function Confirm() {
  const state = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return (
    <main id="main" tabIndex={-1} className="container auth-page">
      <div className="auth-card">
        <h1>
          {state.type === "recovery"
            ? "Khôi phục tài khoản?"
            : "Xác nhận địa chỉ email?"}
        </h1>
        <p>
          Chỉ tiếp tục nếu chính bạn yêu cầu email này. Mở trang không tiêu thụ
          token.
        </p>
        {result?.message && <p role="alert">{result.message}</p>}
        <Form method="post" className="admin-form">
          <input type="hidden" name="csrf" value={state.csrf} />
          <input type="hidden" name="hash" value={state.hash} />
          <input type="hidden" name="type" value={state.type} />
          <button className="button primary" type="submit">
            Tôi yêu cầu xác nhận này
          </button>
        </Form>
      </div>
    </main>
  );
}
