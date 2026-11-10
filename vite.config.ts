import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import { readHostedServiceVars } from "./scripts/hosting-config.ts";

const hosted = process.env.HUBBY_BUILD_TARGET === "hosted-staging";

export default defineConfig({
  plugins: [
    cloudflare({
      configPath: hosted ? "wrangler.hosted.jsonc" : "wrangler.jsonc",
      viteEnvironment: { name: "ssr" },
      config: hosted
        ? (config) => ({ vars: { ...config.vars, ...readHostedServiceVars() } })
        : undefined,
    }),
    reactRouter(),
  ],
});
