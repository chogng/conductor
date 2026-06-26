import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
import { createServer } from "vite";

const workspace = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const timeoutMs = 15000;
const dropTransferCsv = [
  "SetupTitle,Transfer_DB",
  "TestParameter,Output.Graph.XAxis.Data,Vg",
  "DataName,Vg,Id,Ig,Vd",
  "DataValue,-2,1e-12,1e-13,0.1",
  "DataValue,-1,1e-11,1e-13,0.1",
  "DataValue,0,1e-10,1e-13,0.1",
  "DataValue,-2,2e-12,1e-13,1.0",
  "DataValue,-1,2e-11,1e-13,1.0",
  "DataValue,0,2e-10,1e-13,1.0",
].join("\n");

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

const getOpenFolderButton = (page) =>
  page.getByRole("button", { name: /^(打开文件夹|导入文件夹|Open Folder)$/ });

const getApplyAllButton = (page) =>
  page.getByRole("button", { name: /^(应用到所有|Apply to All)$/ });

const getCancelButton = (page) =>
  page.getByRole("button", { name: /^(取消|Cancel)$/ });

const getNewTemplateItem = (page) =>
  page.getByText(/^(新建模板\.\.\.|New Template\.\.\.)$/, { exact: true });

const waitForImportedPreview = async (page) => {
  await page.waitForFunction(
    () => {
      const text = document.body.innerText;
      const cells = Array.from(document.querySelectorAll(".table_view_cell"))
        .map((cell) => cell.textContent?.trim() ?? "");
      return (
        text.includes("output.csv") &&
        text.includes("transfer.csv") &&
        ["Vd", "Id", "0", "3"].every((value) => cells.includes(value))
      );
    },
    undefined,
    { timeout: timeoutMs },
  );
};

const waitForDroppedPreview = async (page) => {
  await page.waitForFunction(
    () => {
      const text = document.body.innerText;
      const cells = Array.from(document.querySelectorAll(".table_view_cell"))
        .map((cell) => cell.textContent?.trim() ?? "");
      return (
        text.includes("drop.csv") &&
        text.includes("Transfer_DB") &&
        ["DataName", "Vg", "Id", "DataValue", "-2", "1e-12"].every((value) => cells.includes(value))
      );
    },
    undefined,
    { timeout: timeoutMs },
  );
};

const waitForAppliedChart = async (page) => {
  await getApplyAllButton(page).click();
  await page.waitForFunction(
    () => Boolean(document.querySelector(".chart_view .plot_main_chart_canvas")),
    undefined,
    { timeout: timeoutMs },
  );
};

const openTemplateEditor = async (page) => {
  await page.locator(".template_picker_button").click();
  await getNewTemplateItem(page).click();
  await page.locator(".template_editor_view").waitFor({
    timeout: timeoutMs,
  });
};

const getTemplateChipInput = (page, label) =>
  page.locator(".template_chip_field")
    .filter({ has: page.locator(".template_field_label", { hasText: label }) })
    .locator("input");

const selectTemplateYColumnB = async (page) => {
  await getTemplateChipInput(page, /^(Y 列|Y columns)$/).click();
  const button = page.locator('.table_view_column_button[data-col-index="1"]');
  await button.waitFor({
    state: "visible",
    timeout: timeoutMs,
  });
  await button.click();
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll(".template_chip_token"))
      .some((token) => token.textContent?.includes("B")),
    undefined,
    { timeout: timeoutMs },
  );
};

const assertTemplateCellPicking = async (page) => {
  await openTemplateEditor(page);

  const xRangeInput = getTemplateChipInput(page, /^X$/);
  await xRangeInput.fill("B4:B6");
  await xRangeInput.press("Enter");
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll(".template_chip_token"))
      .some((token) => token.textContent?.includes("B4:B6")),
    undefined,
    { timeout: timeoutMs },
  );
  await selectTemplateYColumnB(page);

  await getCancelButton(page).click();
  await getApplyAllButton(page).waitFor({
    timeout: timeoutMs,
  });
};

const assertImportedPreview = async (page) => {
  const text = await page.locator("body").innerText();
  assert.match(text, /output\.csv/);
  assert.match(text, /transfer\.csv/);
  await assertTableCells(page, ["Vd", "Id", "0", "3"]);
};

const assertTableCells = async (page, expectedValues) => {
  const missing = await page.evaluate((values) => {
    const cells = Array.from(document.querySelectorAll(".table_view_cell"))
      .map((cell) => cell.textContent?.trim() ?? "");
    return values.filter((value) => !cells.includes(value));
  }, expectedValues);
  assert.deepEqual(missing, []);
};

const runDirectoryPickerImportTest = async (browser, baseUrl) => {
  const page = await browser.newPage();
  page.on("pageerror", (error) => {
    console.error(error.stack || error.message);
  });

  try {
    await installDirectoryPickerMock(page);
    await openWorkbench(page, baseUrl);

    await getOpenFolderButton(page).click();

    await waitForImportedPreview(page);
    await assertImportedPreview(page);
    const pickerCalls = await page.evaluate(() => window.__folderPickerCalls);
    assert.equal(pickerCalls, 1);
  } finally {
    await page.close();
  }
};

const runDropImportTest = async (browser, baseUrl) => {
  const page = await browser.newPage();
  page.on("pageerror", (error) => {
    console.error(error.stack || error.message);
  });

  try {
    await openWorkbench(page, baseUrl);
    await getOpenFolderButton(page).waitFor({
      timeout: timeoutMs,
    });

    await page.evaluate((csvText) => {
      const target = document.querySelector(".file-list-viewport");
      if (!target) {
        throw new Error("File list viewport was not found.");
      }

      const file = new File([csvText], "drop.csv", {
        lastModified: 1,
        type: "text/csv;charset=utf-8",
      });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      for (const type of ["dragenter", "dragover", "drop"]) {
        target.dispatchEvent(new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }));
      }
    }, dropTransferCsv);

    await waitForDroppedPreview(page);
    const text = await page.locator("body").innerText();
    assert.match(text, /drop\.csv/);
    await assertTableCells(page, ["DataValue", "0", "1e-10"]);
    await assertTemplateCellPicking(page);
    await waitForAppliedChart(page);
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
    await getOpenFolderButton(page).click();
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
    await runDropImportTest(browser, baseUrl);
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
