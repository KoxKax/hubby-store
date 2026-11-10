import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { useContent } from "../components/content-context";
import { PageIntro } from "../components/storefront";
import { customerCopy } from "../content/experience";
import { publishedContent } from "../server/content-repository.server";
export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const policy = (await publishedContent(request, context)).policies.find(
    (item) => item.slug === params.slug,
  );
  if (!policy) throw new Response("Not found", { status: 404 });
  return { policy };
}
export const meta: MetaFunction<typeof loader> = ({ loaderData: data }) => [
  { title: `${data?.policy.title ?? "Chính sách"} — Hubby` },
];
export default function Policy() {
  const data = useLoaderData<typeof loader>();
  const policy =
    useContent().policies.find((item) => item.slug === data.policy.slug) ??
    data.policy;
  return (
    <main id="main" className="container policy-page" tabIndex={-1}>
      <PageIntro
        eyebrow="THÔNG TIN CỬA HÀNG"
        title={policy.title}
        description="Vui lòng đọc thông tin dưới đây để hiểu rõ quyền lợi và điều kiện sử dụng dịch vụ tại Hubby."
      />
      <article className="policy-content">
        {customerCopy(policy.body)
          .split(/\n\s*\n/)
          .filter(Boolean)
          .map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
      </article>
      <nav className="policy-actions" aria-label="Sau khi đọc chính sách">
        <Link className="button secondary" to="/#san-pham">
          Xem sản phẩm
        </Link>
        <Link className="button secondary" to="/#ho-tro">
          Cách liên hệ Hubby
        </Link>
      </nav>
    </main>
  );
}
