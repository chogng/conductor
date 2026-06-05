import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
import { createServer } from "vite";

const workspace = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const timeoutMs = 15000;

const visit = (directory, visitor) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      visit(entryPath, visitor);
      continue;
    }

    visitor(entryPath);
  }
};

const collectBrowserTests = (filters) => {
  const sourceRoot = path.join(workspace, "src/cs/base/test/browser");
  const tests = [];

  visit(sourceRoot, (filePath) => {
    if (!filePath.endsWith(".test.ts")) {
      return;
    }

    const relative = path.relative(workspace, filePath).replace(/\\/g, "/");
    if (filters.length && !filters.some((filter) => relative.includes(filter))) {
      return;
    }

    tests.push(`/${relative}`);
  });

  return tests.sort();
};

const run = async () => {
  const filters = process.argv.slice(2);
  const modules = collectBrowserTests(filters);

  if (!modules.length) {
    console.error("No browser tests matched.");
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

  const target = new URL("test/unit/browser/renderer.html", baseUrl);
  target.searchParams.set("modules", Buffer.from(JSON.stringify(modules), "utf8").toString("base64"));

  const browser = await chromium.launch({
    headless: true,
  });
  const page = await browser.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") {
      console.error(message.text());
    }
  });
  page.on("pageerror", (error) => {
    console.error(error.stack || error.message);
  });

  await page.goto(target.href);
  await page.waitForFunction(
    () => globalThis.__conductorBrowserTestResults !== undefined,
    undefined,
    { timeout: timeoutMs },
  );

  const payload = await page.evaluate(() => globalThis.__conductorBrowserTestResults);

  for (const result of payload.results ?? []) {
    const prefix = result.error ? "✘" : "✔";
    const duration = Number(result.durationMs ?? 0).toFixed(2);
    console.log(`${prefix} ${result.name} (${duration}ms)`);
    if (result.error) {
      console.error(result.error.stack || result.error.message);
    }
  }

  console.log(`Browser tests: ${payload.pass ?? 0} pass / ${payload.fail ?? 0} fail`);

  await browser.close();
  await server.close();
  process.exit(payload.fail ? 1 : 0);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
