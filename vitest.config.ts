import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    reporters: ["verbose"],
  },
  resolve: {
    alias: { "@": resolve(__dirname, ".") },
  },
  oxc: {
    jsx: {
      runtime: "automatic",
    },
  },
});
