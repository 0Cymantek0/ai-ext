import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import path from "node:path";

import manifest from "./manifest.config";

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@background": path.resolve(__dirname, "src/background"),
      "@content": path.resolve(__dirname, "src/content"),
      "@sidepanel": path.resolve(__dirname, "src/sidepanel"),
      "@shared": path.resolve(__dirname, "src/shared"),
      "@components": path.resolve(__dirname, "src/components"),
      "@lib": path.resolve(__dirname, "src/lib"),
      "@hooks": path.resolve(__dirname, "src/hooks"),
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
