import fs from "node:fs";
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
const serverFaviconPath = fileURLToPath(
  new URL("./resources/server/favicon.ico", import.meta.url),
);
const serverFaviconPublicPath = "/resources/server/favicon.ico";
const esbuildTsconfigRaw = {
  compilerOptions: {
    experimentalDecorators: true,
  },
};

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
        if (url.pathname === serverFaviconPublicPath) {
          try {
            const content = fs.readFileSync(serverFaviconPath);
            res.statusCode = 200;
            res.setHeader("Content-Type", "image/x-icon");
            res.setHeader("Cache-Control", "no-cache");
            res.end(content);
          } catch {
            res.statusCode = 404;
            res.end();
          }
          return;
        }

        if (!shouldRouteToBrowserWorkbench(url.pathname) || url.pathname === workbenchPath) {
          next();
          return;
        }

        res.statusCode = 302;
        res.setHeader("Location", `${workbenchPath}${url.search}`);
        res.end();
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "resources/server/favicon.ico",
        source: fs.readFileSync(serverFaviconPath),
      });
    },
  };
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [webClientServerPlugin()],
  esbuild: {
    tsconfigRaw: esbuildTsconfigRaw,
  },
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
    esbuildOptions: {
      tsconfigRaw: esbuildTsconfigRaw,
    },
    exclude: ["@chogng/lxicons", "cogicon"],
  },
  build: {
    outDir: "out/renderer",
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
    host: "localhost",
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
