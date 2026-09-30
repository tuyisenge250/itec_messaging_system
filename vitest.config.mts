import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    testTimeout: 15000,
    hookTimeout: 15000,
    fileParallelism: false, // tests share one local Postgres/Redis — avoid cross-test races
    setupFiles: ["./tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@": dirname,
    },
  },
});
