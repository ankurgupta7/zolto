import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: path.resolve(import.meta.dirname),
  // Serve the app's real public assets — most importantly the vendored
  // webfonts at /fonts/fonts.css, the same files production serves.
  publicDir: path.resolve(import.meta.dirname, "..", "..", "client", "public"),
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "..", "..", "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "..", "..", "shared"),
    },
  },
  server: { port: 5199, host: true },
});
