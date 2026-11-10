import type { ReactNode } from "react";
import type { LoaderFunctionArgs } from "react-router";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useRouteError,
  useRouteLoaderData,
} from "react-router";
import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/400-italic.css";
import "@fontsource/be-vietnam-pro/500.css";
import "@fontsource/be-vietnam-pro/600.css";
import "@fontsource/be-vietnam-pro/700.css";
import "./styles/storefront.css";
import "./styles/admin.css";
import "./styles/commerce.css";
import "./styles/refresh.css";
import "./styles/themes.css";
import "./styles/admin-workspace.css";
import "./styles/visual-polish.css";
import "./styles/light-theme.css";
import { ContentProvider } from "./components/content-context";
import { StoreProvider } from "./components/store-context";
import { authAvailability } from "./server/auth-availability.server";
import { dataConfig } from "./server/config.server";
import { publishedContent } from "./server/content-repository.server";
import { csrfToken } from "./server/form-security.server";
import { localEnabled } from "./server/local-shop.server";
import { runtimeContext } from "./server/runtime-context.server";
import { identity } from "./server/supabase.server";
import { readTheme } from "./server/theme.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.get(runtimeContext).env;
  const [user, providers, content] = await Promise.all([
    identity(request, context),
    authAvailability(request, context),
    publishedContent(request, context),
  ]);
  return {
    content,
    signedIn: !!user,
    owner: user?.owner === true,
    authConfigured: !!dataConfig(env) && providers.available,
    googleConfigured: providers.google,
    emailConfigured: providers.email,
    csrf: csrfToken(request, context),
    couponsEnabled: localEnabled(request, context),
    theme: readTheme(request),
    sandbox:
      env.APP_ENV === "local" &&
      env.DATA_MODE !== "supabase" &&
      !env.LOCAL_SHOP,
  };
}

export function Layout({ children }: { children: ReactNode }) {
  const root = useRouteLoaderData<typeof loader>("root");
  return (
    <html lang="vi" data-theme={root?.theme ?? "dark"}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <link
          rel="icon"
          type="image/x-icon"
          href="/favicon.ico"
          sizes="48x48"
        />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const { content, sandbox } = useLoaderData<typeof loader>();
  return (
    <ContentProvider initial={content} sandbox={sandbox}>
      <StoreProvider>
        <Outlet />
      </StoreProvider>
    </ContentProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const unavailable = isRouteErrorResponse(error) && error.status === 503;
  return (
    <main className="phase-card">
      <p className="eyebrow">Hubby</p>
      <h1>
        {notFound
          ? "Không tìm thấy trang"
          : unavailable
            ? "Dịch vụ chưa sẵn sàng"
            : "Chưa thể tải trang"}
      </h1>
      <p>
        {notFound
          ? "Đường dẫn có thể đã thay đổi. Bạn quay về trang chủ nhé."
          : unavailable
            ? "Tính năng này chưa được kết nối. Bạn có thể quay lại cửa hàng và thử sau."
            : "Vui lòng thử lại sau."}
      </p>
      <a href="/">Về trang đầu</a>
    </main>
  );
}
