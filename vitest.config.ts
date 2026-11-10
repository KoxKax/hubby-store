import { defineConfig } from "vitest/config";

// Domain tests intentionally run without Workers bindings or provider access.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    clearMocks: true,
    // PGlite initializes Postgres WASM per suite. Bound parallelism and allow
    // cold starts on Windows so contention doesn't masquerade as SQL failures.
    maxWorkers: 2,
    hookTimeout: 30_000,
  },
});
