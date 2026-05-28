import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts"],
    exclude: ["repos/**", "node_modules/**", "dist/**"],
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  pack: {
    entry: ["src/Main.ts"],
    format: ["esm"],
    platform: "node",
  },
});
