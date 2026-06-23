import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
import { createServer } from "vite";

const workspace = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const timeoutMs = 15000;

const previews = new Map([
  ["titlebar-update", "/test/unit/browser/previews/titlebarUpdatePreview.ts"],
]);

const parseArgs = (args) => ({
  name: args.find(arg => !arg.startsWith("--")) ?? "titlebar-update",
  noOpen: args.includes("--no-open"),
  smoke: args.includes("--smoke"),
});

const openExternal = (url) => {
  const command = process.platform === "win32" ? "cmd"
    : process.platform === "darwin" ? "open"
      : "xdg-open";
  const args = process.platform === "win32"
    ? ["/c", "start", "", url]
    : [url];

  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.once("error", error => {
    console.error(`Failed to open the browser automatically: ${error.message}`);
  });
  child.unref();
};

const run = async () => {
  const { name, noOpen, smoke } = parseArgs(process.argv.slice(2));
  const modulePath = previews.get(name);
  if (!modulePath) {
    console.error(`Unknown browser preview: ${name}`);
    console.error(`Available previews: ${Array.from(previews.keys()).join(", ")}`);
    process.exit(1);
  }

  const server = await createServer({
    configFile: path.join(workspace, "vite.config.ts"),
    logLevel: "error",
    resolve: {
      alias: {
        assert: path.join(workspace, "test/unit/assert.js"),
      },
    },
    server: {
      host: "127.0.0.1",
      port: 0,
      strictPort: false,
    },
  });

  await server.listen();

  const baseUrl = server.resolvedUrls?.local[0];
  if (!baseUrl) {
    await server.close();
    throw new Error("Vite did not expose a local server URL.");
  }

  const target = new URL("test/unit/browser/preview.html", baseUrl);
  target.searchParams.set("module", modulePath);

  if (!smoke) {
    console.log(`Browser preview running: ${target.href}`);
    if (!noOpen) {
      openExternal(target.href);
      console.log("Opening the preview in your default browser.");
    }
    console.log("Press Ctrl+C to stop the preview server.");

    const shutdown = async () => {
      await server.close();
    };

    process.once("SIGINT", () => {
      void shutdown().finally(() => process.exit(0));
    });
    process.once("SIGTERM", () => {
      void shutdown().finally(() => process.exit(0));
    });

    await new Promise(() => undefined);
    return;
  }

  const browser = await chromium.launch({
    headless: true,
  });
  const page = await browser.newPage({
    viewport: {
      width: 1320,
      height: 900,
    },
  });
  page.on("console", message => {
    if (message.type() === "error") {
      console.error(message.text());
    }
  });
  page.on("pageerror", error => {
    console.error(error.stack || error.message);
  });

  await page.goto(target.href);
  await page.waitForFunction(
    () => globalThis.__conductorBrowserPreviewReady !== undefined,
    undefined,
    { timeout: timeoutMs },
  );

  const ready = await page.evaluate(() => globalThis.__conductorBrowserPreviewReady);
  if (!ready?.ok) {
    throw new Error(ready?.error?.stack || ready?.error?.message || "Browser preview failed.");
  }

  await browser.close();
  await server.close();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
