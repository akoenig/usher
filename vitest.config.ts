import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts"],
    exclude: ["repos/**", "node_modules/**", "dist/**"],
  },
});
