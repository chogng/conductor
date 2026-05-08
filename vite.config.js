import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const indexHtmlPath = fileURLToPath(new URL("./index.html", import.meta.url));
const desktopWorkbenchHtmlPath = fileURLToPath(
  new URL("./src/cs/code/electron-sandbox/workbench/workbench.html", import.meta.url),
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
        "./src/cs/code/electron-sandbox/workbench/workbench.js",
        "./src/cs/platform/language/browser/languageService.ts",
        "./src/cs/workbench/services/themes/browser/themeService.ts",
        "./src/cs/workbench/contrib/splash/browser/partsSplash.ts",
        "./src/cs/workbench/contrib/splash/electron-sandbox/splash.contribution.ts",
        "./src/styles/global.css",
        "./src/styles/variables.css",
        "./src/cs/workbench/browser/hooks/useTheme.ts",
        "./src/cs/workbench/browser/hooks/useLanguage.ts",
        "./src/cs/workbench/common/theme.ts",
        "./src/cs/platform/language/common/language.ts",
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
