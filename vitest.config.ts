import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: 20_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.mjs", "bin/**/*.mjs", "shim/**/*.mjs"],
      reporter: ["text-summary"],
      thresholds: { statements: 75, branches: 77, functions: 76, lines: 75 },
    },
  },
});
