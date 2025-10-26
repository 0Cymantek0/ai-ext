import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { copyFileSync, mkdirSync } from "node:fs";

import manifest from "./manifest.config";

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
    {
      name: "copy-pdfjs-worker",
      closeBundle() {
        // Copy PDF.js worker to dist
        const workerSrc = path.resolve(__dirname, "node_modules/pdfjs-dist/build/pdf.worker.mjs");
        const workerDest = path.resolve(__dirname, "dist/pdfjs-dist/build");
        
        try {
          mkdirSync(workerDest, { recursive: true });
          copyFileSync(workerSrc, path.join(workerDest, "pdf.worker.mjs"));
          console.log("✓ Copied PDF.js worker to dist");
        } catch (error) {
          console.error("Failed to copy PDF.js worker:", error);
        }
      },
    },
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
      "@devtools-shared": path.resolve(__dirname, "../dev-tools/shared"),
    },
    preserveSymlinks: true,
  },
  server: {
    fs: {
      allow: [
        path.resolve(__dirname, "../dev-tools/shared"),
        path.resolve(__dirname, "src"),
      ],
    },
  },
  build: {
    outDir: "dist",
    // CRXJS handles all entry points from manifest.config.ts
    // Do not manually specify rollupOptions.input as it interferes with TypeScript transformation
  },
});
