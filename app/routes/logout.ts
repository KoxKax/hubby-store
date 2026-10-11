export { action } from "./auth";
export function loader() {
  throw new Response("Dùng biểu mẫu POST để đăng xuất", { status: 405 });
}
