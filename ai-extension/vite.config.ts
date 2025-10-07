import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import path from "node:path";

import manifest from "./manifest.config";

export default defineConfig({
  plugins: [crx({ manifest })],
  resolve: {
    alias: {
      "@background": path.resolve(__dirname, "src/background"),
      "@content": path.resolve(__dirname, "src/content"),
      "@sidepanel": path.resolve(__dirname, "src/sidepanel"),
      "@shared": path.resolve(__dirname, "src/shared"),
    },
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        serviceWorker: "src/background/service-worker.ts",
        sidepanel: "src/sidepanel/sidepanel.html",
        offscreen: "src/offscreen/offscreen.html",
      },
    },
  },
});
