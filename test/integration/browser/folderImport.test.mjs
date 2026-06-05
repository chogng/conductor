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

const installDirectoryPickerMock = async (page) => {
  await page.addInitScript(() => {
    class TestFileHandle {
      constructor(name, text) {
        this.kind = "file";
        this.name = name;
        this.text = text;
      }

      async queryPermission() {
        return "granted";
      }

      async requestPermission() {
        return "granted";
      }

      async getFile() {
        return new File([this.text], this.name, {
          lastModified: 1,
          type: "text/csv;charset=utf-8",
        });
      }
    }

    class TestDirectoryHandle {
      constructor(name, children, permission = "granted") {
        this.kind = "directory";
        this.name = name;
        this.children = children;
        this.permission = permission;
      }

      async queryPermission() {
        return this.permission;
      }

      async requestPermission() {
        this.permission = "granted";
        return this.permission;
      }

      assertPermission() {
        if (this.permission !== "granted") {
          throw new Error("Permission denied.");
        }
      }

      async *entries() {
        this.assertPermission();
        for (const child of this.children) {
          yield [child.name, child];
        }
      }

      async getDirectoryHandle(name) {
        this.assertPermission();
        const child = this.children.find(entry => entry.kind === "directory" && entry.name === name);
        if (!child) {
          throw new Error(`Directory '${name}' was not found.`);
        }

        return child;
      }

      async getFileHandle(name) {
        this.assertPermission();
        const child = this.children.find(entry => entry.kind === "file" && entry.name === name);
        if (!child) {
          throw new Error(`File '${name}' was not found.`);
        }

        return child;
      }
    }

    const root = new TestDirectoryHandle("selected-folder", [
      new TestFileHandle("output.csv", "Vd,Id\n0,3\n1,4"),
      new TestFileHandle("transfer.csv", "Vg,Id\n0,1\n1,2"),
    ], "prompt");

    window.__folderPickerCalls = 0;
    window.showDirectoryPicker = async () => {
      window.__folderPickerCalls += 1;
      return root;
    };
  });
};

const installInterceptedDirectoryPickerMock = async (page) => {
  await page.addInitScript(() => {
    window.__folderPickerCalls = 0;
    window.showDirectoryPicker = async () => {
      window.__folderPickerCalls += 1;
      throw new DOMException(
        "Failed to execute 'showDirectoryPicker' on 'Window': Intercepted by Page.setInterceptFileChooserDialog().",
        "AbortError",
      );
    };
  });
};

const openWorkbench = async (page, baseUrl) => {
  await page.goto(new URL("src/cs/code/browser/workbench/workbench-dev.html", baseUrl).href, {
    waitUntil: "domcontentloaded",
  });
};

const waitForImportedPreview = async (page) => {
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
};

const assertImportedPreview = async (page) => {
  const text = await page.locator("body").innerText();
  assert.match(text, /output\.csv/);
  assert.match(text, /transfer\.csv/);
  assert.match(text, /0\t3/);
};

const runDirectoryPickerImportTest = async (browser, baseUrl) => {
  const page = await browser.newPage();
  page.on("pageerror", (error) => {
    console.error(error.stack || error.message);
  });

  try {
    await installDirectoryPickerMock(page);
    await openWorkbench(page, baseUrl);

    await page.getByRole("button", { name: "导入文件夹" }).click();

    await waitForImportedPreview(page);
    await assertImportedPreview(page);
    const pickerCalls = await page.evaluate(() => window.__folderPickerCalls);
    assert.equal(pickerCalls, 1);
  } finally {
    await page.close();
  }
};

const runInterceptedDirectoryPickerFallbackTest = async (browser, baseUrl) => {
  const page = await browser.newPage();
  const fixture = createImportFixture();
  page.on("pageerror", (error) => {
    console.error(error.stack || error.message);
  });

  try {
    await installInterceptedDirectoryPickerMock(page);
    await openWorkbench(page, baseUrl);

    const fileChooserPromise = page.waitForEvent("filechooser", {
      timeout: timeoutMs,
    });
    await page.getByRole("button", { name: "导入文件夹" }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(fixture);

    await waitForImportedPreview(page);
    await assertImportedPreview(page);
    const pickerCalls = await page.evaluate(() => window.__folderPickerCalls);
    assert.equal(pickerCalls, 1);
  } finally {
    await page.close();
    rmSync(fixture, { recursive: true, force: true });
  }
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

  try {
    await runDirectoryPickerImportTest(browser, baseUrl);
    await runInterceptedDirectoryPickerFallbackTest(browser, baseUrl);
  } finally {
    await browser.close();
    await server.close();
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
