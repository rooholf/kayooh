import { defineConfig } from "vitest/config";

// Unit tests run in Node without the app's Vite config (no PWA plugin needed).
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
