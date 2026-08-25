import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// Client build for the tourism-contest web chat. Dev: `vite -c web/client/vite.config.ts`
// proxies /api to the local web server (tsx watch web/server/index.ts, :8790).
export default defineConfig({
  root: __dirname,
  plugins: [preact()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2019",
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8790",
      "/healthz": "http://localhost:8790",
    },
  },
});
