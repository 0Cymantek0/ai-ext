import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "AI Pocket",
  description:
    "Capture, organize, and interact with web content using hybrid AI.",
  version: "0.1.0",
  minimum_chrome_version: "120",
  action: {
    default_title: "AI Pocket",
  },
  background: {
    service_worker: "src/background/service-worker.ts",
    type: "module",
  },
  permissions: [
    "storage",
    "scripting",
    "activeTab",
    "sidePanel",
    "offscreen",
    "downloads",
    "notifications",
    "unlimitedStorage",
    "contextMenus",
  ],
  host_permissions: ["<all_urls>"],
  side_panel: {
    default_path: "src/sidepanel/sidepanel.html",
  },
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["src/content/content-main.ts"],
      all_frames: true,
      run_at: "document_idle",
    },
    {
      matches: ["<all_urls>"],
      js: [
        "src/content/text-enhancer.ts",
        "src/content/abbreviation-manager.ts",
      ],
      all_frames: true,
      run_at: "document_idle",
    },
  ],
  web_accessible_resources: [
    {
      resources: [
        "src/sidepanel/*",
        "src/reports/*",
        "assets/*",
        "styles/*",
        "pdfjs-dist/build/*",
        "*.wasm",
      ],
      matches: ["<all_urls>"],
    },
  ],
  icons: {
    "16": "icons/16.png",
    "32": "icons/32.png",
    "48": "icons/48.png",
    "128": "icons/128.png",
  },
});
