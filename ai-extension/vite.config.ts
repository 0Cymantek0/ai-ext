import { defineConfig, loadEnv } from "vite";
import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { copyFileSync, mkdirSync } from "node:fs";

import manifest from "./manifest.config";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const debugRecorderFlag = env.VITE_DEBUG_RECORDER === "true" ? "true" : "false";
  
  return {
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
    {
      name: "copy-tfjs-wasm",
      closeBundle() {
        // Copy TensorFlow.js WASM files to dist root
        const wasmDir = path.resolve(__dirname, "node_modules/@tensorflow/tfjs-backend-wasm/dist");
        const distDir = path.resolve(__dirname, "dist");
        
        const wasmFiles = [
          "tfjs-backend-wasm.wasm",
          "tfjs-backend-wasm-simd.wasm",
          "tfjs-backend-wasm-threaded-simd.wasm",
        ];
        
        try {
          for (const file of wasmFiles) {
            const src = path.join(wasmDir, file);
            const dest = path.join(distDir, file);
            try {
              copyFileSync(src, dest);
              console.log(`✓ Copied ${file} to dist`);
            } catch (err) {
              // Some WASM files might not exist in all versions, that's ok
              console.log(`⚠ Could not copy ${file} (might not exist in this version)`);
            }
          }
        } catch (error) {
          console.error("Failed to copy TensorFlow.js WASM files:", error);
        }
      },
    },
  ],
  define: {
    "import.meta.env.VITE_DEBUG_RECORDER": debugRecorderFlag,
    "import.meta.env.VITE_GEMINI_API_KEY": JSON.stringify(env.VITE_GEMINI_API_KEY || ""),
  },
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
    dedupe: ['react', 'react-dom'],
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
    minify: mode === "production" ? "esbuild" : false,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Bundle TensorFlow separately to avoid size issues
          if (id.includes('@tensorflow')) {
            return 'tensorflow';
          }
        },
      },
    },
  },
  };
});
