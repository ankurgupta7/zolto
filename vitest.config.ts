import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["server/test-setup.ts"],
    include: [
      "server/**/*.test.ts",
      "server/**/*.spec.ts",
      "client/**/*.test.ts",
      "client/**/*.test.tsx",
      "shared/**/*.test.ts",
      // Static guards over the deploy scripts (deploy/schemaDrift.test.ts) —
      // no DB or Docker needed, so they belong in the ordinary suite.
      "deploy/**/*.test.ts",
    ],
    environmentMatchGlobs: [["client/**", "jsdom"]],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["server/**", "client/src/**"],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "client/src/components/ui/**",
        // Entry-point bootstrap: binds a port and wires the SPA/static handler.
        // The route wiring it delegates to lives in app.ts (smoke-tested).
        "server/_core/index.ts",
        // Test bootstrap (dotenv loader) — nothing to cover.
        "server/test-setup.ts",
      ],
    },
  },
});
