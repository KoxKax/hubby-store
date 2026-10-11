import { defineConfig } from "vitest/config";

// Domain tests intentionally run without Workers bindings or provider access.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    clearMocks: true,
  },
});
