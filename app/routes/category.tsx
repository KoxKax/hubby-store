import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { publishedContent } from "../server/content-repository.server";
import Catalog from "./catalog";

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const category = (await publishedContent(request, context)).categories.find(
    (item) => item.id === params.category,
  );
  if (!category) throw new Response("Not found", { status: 404 });
  return { category };
}
export const meta: MetaFunction<typeof loader> = ({ loaderData }) => [
  { title: `${loaderData?.category.name ?? "Danh mục"} — Hubby` },
];
export default function Category() {
  const { category } = useLoaderData<typeof loader>();
  return <Catalog fixedCategory={category.id} />;
}
