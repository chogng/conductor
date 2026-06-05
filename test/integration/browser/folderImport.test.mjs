import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
import { createServer } from "vite";

const workspace = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const timeoutMs = 15000;

const createImportFixture = () => {
  const root = mkdtempSync(path.join(tmpdir(), "conductor-folder-import-"));
  writeFileSync(path.join(root, "output.csv"), "Vd,Id\n0,3\n1,4", "utf8");
  writeFileSync(path.join(root, "transfer.csv"), "Vg,Id\n0,1\n1,2", "utf8");
  return root;
};

const run = async () => {
  const server = await createServer({
    configFile: path.join(workspace, "vite.config.ts"),
    logLevel: "error",
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

  const browser = await chromium.launch({
    headless: true,
  });
  const fixture = createImportFixture();

  try {
    const page = await browser.newPage();
    page.on("pageerror", (error) => {
      console.error(error.stack || error.message);
    });

    await page.goto(new URL("src/cs/code/browser/workbench/workbench-dev.html", baseUrl).href, {
      waitUntil: "domcontentloaded",
    });

    const fileChooserPromise = page.waitForEvent("filechooser", {
      timeout: timeoutMs,
    });
    await page.getByRole("button", { name: "导入文件夹" }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(fixture);

    await page.waitForFunction(
      () => {
        const text = document.body.innerText;
        return (
          text.includes("output.csv") &&
          text.includes("transfer.csv") &&
          text.includes("Vd") &&
          text.includes("Id") &&
          text.includes("0\t3")
        );
      },
      undefined,
      { timeout: timeoutMs },
    );

    const result = await page.evaluate(() => ({
      text: document.body.innerText,
    }));

    assert.match(result.text, /output\.csv/);
    assert.match(result.text, /transfer\.csv/);
    assert.match(result.text, /0\t3/);
  } finally {
    await browser.close();
    await server.close();
    rmSync(fixture, { recursive: true, force: true });
  }
};

run().then(
  () => {
    console.log("Browser folder import integration test passed.");
  },
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
