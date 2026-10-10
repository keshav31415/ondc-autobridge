import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    coverage: {
      provider: "v8",
      include: ["packages/core/src/**/*.ts"],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 75 },
    },
  },
});
