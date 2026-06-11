import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    conditions: ["workspace"],
  },
  test: {
    include: [
      "lib/**/src/**/*.test.ts",
      "artifacts/**/src/**/*.test.ts",
    ],
  },
});
