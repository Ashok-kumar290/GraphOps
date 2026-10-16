import { defineConfig } from "vite";
export default defineConfig({
  server: { proxy: { "/api": "http://127.0.0.1:8080" } },
  // Fonts ship as files: the server CSP allows only same-origin assets, not data: URLs.
  build: { sourcemap: false, assetsInlineLimit: 0 },
});
