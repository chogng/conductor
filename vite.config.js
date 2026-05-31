import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const browserWorkbenchHtmlPath = fileURLToPath(
  new URL("./src/cs/code/browser/workbench/workbench.html", import.meta.url),
);
const desktopWorkbenchHtmlPath = fileURLToPath(
  new URL("./src/cs/code/electron-browser/workbench/workbench.html", import.meta.url),
);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react({ fastRefresh: process.env.CONDUCTOR_DESKTOP_DEV !== "1" })],
  resolve: {
    alias: {
      cs: fileURLToPath(new URL("./src/cs", import.meta.url)),
      src: fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  worker: {
    format: "es",
  },
  build: {
    rollupOptions: {
      input: {
        app: browserWorkbenchHtmlPath,
        workbench: desktopWorkbenchHtmlPath,
      },
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;

          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/scheduler/")
          ) {
            return "react-vendor";
          }

          if (id.includes("@tanstack/react-query")) {
            return "app-vendor";
          }

          if (id.includes("papaparse") || id.includes("jszip")) {
            return "data-vendor";
          }

          return "vendor";
        },
      },
    },
  },
  server: {
    host: true,
    warmup: {
      clientFiles: [
        "./src/cs/code/browser/workbench/renderer.tsx",
        "./src/cs/code/browser/workbench/rendererLoader.ts",
        "./src/cs/code/browser/workbench/app.tsx",
        "./src/cs/code/browser/workbench/browserBoot.ts",
        "./src/cs/code/browser/workbench/web.main.ts",
        "./src/cs/code/electron-browser/workbench/desktopBoot.ts",
        "./src/cs/code/electron-browser/workbench/desktop.main.ts",
        "./src/cs/platform/platform.browser.main.ts",
        "./src/cs/platform/platform.desktop.main.ts",
        "./src/cs/base/browser/browser.main.ts",
        "./src/cs/workbench/workbench.common.main.ts",
        "./src/cs/workbench/workbench.browser.main.ts",
        "./src/cs/workbench/workbench.desktop.main.ts",
        "./src/cs/workbench/workbench.contributions.main.ts",
        "./src/i18n/loader.ts",
        "./src/i18n/en.ts",
        "./src/i18n/zh.ts",
      ],
    },
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        timeout: 300000,
        proxyTimeout: 300000,
      },
    },
  },
  preview: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        timeout: 300000,
        proxyTimeout: 300000,
      },
    },
  },
});
