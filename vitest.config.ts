import { defineConfig } from "vitest/config";
import { resolve } from "path";

const alias = { "@": resolve(__dirname, ".") };
const oxc = { jsx: { runtime: "automatic" as const } };

export default defineConfig({
  test: {
    reporters: ["verbose"],
    projects: [
      {
        resolve: { alias },
        oxc,
        test: {
          name: "unit",
          globals: true,
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        resolve: { alias },
        oxc,
        test: {
          name: "component",
          globals: true,
          environment: "jsdom",
          include: ["tests/component/**/*.test.{ts,tsx}"],
          setupFiles: ["tests/component/setup.ts"],
        },
      },
    ],
  },
});
