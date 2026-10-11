import {
  index,
  layout,
  type RouteConfig,
  route,
} from "@react-router/dev/routes";

export default [
  layout("routes/store.tsx", [
    index("routes/home.tsx"),
    route("san-pham", "routes/legacy-section.ts", { id: "legacy-products" }),
    route("danh-muc/:category", "routes/legacy-section.ts", {
      id: "legacy-category",
    }),
    route("san-pham/:slug", "routes/product.tsx"),
    route("gio-hang", "routes/cart.tsx"),
    route("thanh-toan", "routes/checkout.tsx"),
    route("yeu-thich", "routes/favorites.tsx"),
    route("ho-tro", "routes/legacy-section.ts", { id: "legacy-support" }),
    route("tra-don-hang", "routes/order-lookup.tsx"),
    route("tai-khoan", "routes/account.tsx"),
    route("tai-khoan/don-hang", "routes/customer-hub.tsx", {
      id: "customer-orders",
    }),
    route("tai-khoan/san-pham", "routes/customer-hub.tsx", {
      id: "customer-library",
    }),
    route("tai-khoan/tickets", "routes/customer-hub.tsx", {
      id: "customer-tickets",
    }),
    route("tai-khoan/da-xem", "routes/recent.tsx"),
    route("don-hang/:id", "routes/order.tsx"),
    route("dang-nhap", "routes/auth.tsx", { id: "auth-login" }),
    route("dang-ky", "routes/auth.tsx", { id: "auth-signup" }),
    route("quen-mat-khau", "routes/auth.tsx", { id: "auth-forgot" }),
    route("dat-lai-mat-khau", "routes/auth.tsx", { id: "auth-reset" }),
    route("xac-thuc", "routes/mfa.tsx"),
    route("chinh-sach/:slug", "routes/policy.tsx"),
  ]),
  route("health", "routes/health.ts"),
  route("admin", "routes/admin.tsx"),
  route("admin-demo", "routes/admin-demo.tsx"),
  route("admin-demo/operations", "routes/local-operations.tsx"),
  route("local-api", "routes/local-api.ts"),
  route("support-message", "routes/support-message.ts"),
  route("theme", "routes/theme.ts"),
  route("feedback", "routes/feedback.ts"),
  route("review", "routes/review.ts"),
  route("activity", "routes/activity.ts"),
  route("dang-xuat", "routes/logout.ts"),
  route("auth/callback", "routes/auth-callback.ts"),
  route("auth/confirm", "routes/auth-confirm.tsx"),
  route("media/:id", "routes/media.ts"),
] satisfies RouteConfig;
