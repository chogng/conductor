import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import type { Plugin } from "vite";

import {
  getBrowserWorkbenchPath,
  shouldRouteToBrowserWorkbench,
} from "./src/cs/server/node/webClientServer.js";

const browserWorkbenchHtmlPath = fileURLToPath(
  new URL("./src/cs/code/browser/workbench/workbench.html", import.meta.url),
);
const desktopWorkbenchHtmlPath = fileURLToPath(
  new URL("./src/cs/code/electron-browser/workbench/workbench.html", import.meta.url),
);

const webClientServerPlugin = (): Plugin => {
  const workbenchPath = getBrowserWorkbenchPath(false);

  return {
    name: "conductor-web-client-server",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) {
          next();
          return;
        }

        const url = new URL(req.url, "http://localhost");
        if (!shouldRouteToBrowserWorkbench(url.pathname) || url.pathname === workbenchPath) {
          next();
          return;
        }

        res.statusCode = 302;
        res.setHeader("Location", `${workbenchPath}${url.search}`);
        res.end();
      });
    },
  };
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [webClientServerPlugin()],
  resolve: {
    alias: {
      cs: fileURLToPath(new URL("./src/cs", import.meta.url)),
      src: fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  worker: {
    format: "es",
  },
  optimizeDeps: {
    exclude: ["cogicon"],
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
        "./src/cs/code/browser/workbench/workbench.ts",
        "./src/cs/code/electron-browser/workbench/workbench.ts",
        "./src/cs/platform/platform.browser.main.ts",
        "./src/cs/platform/platform.desktop.main.ts",
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
