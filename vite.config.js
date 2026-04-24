import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const indexHtmlPath = fileURLToPath(new URL("./index.html", import.meta.url));
const desktopWorkbenchHtmlPath = fileURLToPath(
  new URL("./desktop/workbench.html", import.meta.url),
);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react({ fastRefresh: process.env.CONDUCTOR_DESKTOP_DEV !== "1" })],
  worker: {
    format: "es",
  },
  build: {
    rollupOptions: {
      input: {
        app: indexHtmlPath,
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

          if (id.includes("/xlsx/")) {
            return "excel-vendor";
          }

          if (
            id.includes("recharts") ||
            id.includes("victory-vendor") ||
            id.includes("d3-")
          ) {
            return "charts-vendor";
          }

          if (id.includes("papaparse") || id.includes("jszip")) {
            return "data-vendor";
          }

          if (id.includes("lucide-react")) {
            return "icons-vendor";
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
        "./src/main.tsx",
        "./src/workbench-loader.ts",
        "./src/App.tsx",
        "./src/context/language-provider.tsx",
        "./src/context/theme-provider.tsx",
        "./src/styles/global.css",
        "./src/styles/variables.css",
        "./src/context/theme.ts",
        "./src/context/language.ts",
        "./src/config/theme.ts",
        "./src/config/language.ts",
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
      "/socket.io": {
        target: "http://localhost:3001",
        ws: true,
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
      "/socket.io": {
        target: "http://localhost:3001",
        ws: true,
        changeOrigin: true,
        timeout: 300000,
        proxyTimeout: 300000,
      },
    },
  },
});
