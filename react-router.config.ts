import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  buildDirectory:
    process.env.HUBBY_BUILD_TARGET === "hosted-staging"
      ? ".wrangler/hosted-build"
      : "build",
} satisfies Config;
