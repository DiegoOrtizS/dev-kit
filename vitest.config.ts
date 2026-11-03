import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: 20_000,
    experimental: { viteModuleRunner: false },
    coverage: {
      provider: "v8",
      autoAttachSubprocess: true,
      include: ["src/**/*.mjs", "bin/**/*.mjs", "shim/**/*.mjs"],
      reporter: ["text-summary"],
      thresholds: { statements: 94, branches: 91, functions: 95, lines: 94 },
    },
  },
});
