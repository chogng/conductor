import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const OUTPUT_PATH = path.join(ROOT, "tmp", `playwright-apply-report-${Date.now()}.json`);
const TARGET_URL = "http://127.0.0.1:5174/src/cs/code/browser/workbench/workbench-dev.html";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const consoleTail = [];

page.on("console", (message) => {
  const text = message.text();
  if (/perf|analysis|template|processing|error|failed/i.test(text)) {
    consoleTail.push({ type: message.type(), text });
  }
});
page.on("pageerror", (error) => {
  consoleTail.push({ type: "pageerror", text: String(error?.stack || error?.message || error) });
});

await page.addInitScript(() => {
  window.localStorage.setItem("conductor.perf", "1");

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
    constructor(name, children) {
      this.kind = "directory";
      this.name = name;
      this.children = children;
    }
    async queryPermission() {
      return "granted";
    }
    async requestPermission() {
      return "granted";
    }
    async *entries() {
      for (const child of this.children) {
        yield [child.name, child];
      }
    }
    async getFileHandle(name) {
      const child = this.children.find((entry) => entry.kind === "file" && entry.name === name);
      if (!child) {
        throw new Error(`File '${name}' was not found.`);
      }
      return child;
    }
    async getDirectoryHandle(name) {
      const child = this.children.find((entry) => entry.kind === "directory" && entry.name === name);
      if (!child) {
        throw new Error(`Directory '${name}' was not found.`);
      }
      return child;
    }
  }

  const makeCsv = (index) => [
    "SetupTitle,Output",
    "TestParameter,Output.Graph.XAxis.Data,Vd",
    "DataName,Vd,Id,Vg",
    `DataValue,0,${1 + index * 0.001},0`,
    `DataValue,1,${2 + index * 0.001},0`,
    `DataValue,2,${3 + index * 0.001},0`,
  ].join("\n");

  const children = Array.from({ length: 158 }, (_, index) =>
    new TestFileHandle(`mock-output-${String(index + 1).padStart(3, "0")}.csv`, makeCsv(index))
  );
  const root = new TestDirectoryHandle("mock-158", children);
  window.showDirectoryPicker = async () => root;
});

await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.getByRole("button", { name: /^(打开文件夹|导入文件夹|Open Folder)$/ }).click();
await page.waitForFunction(
  () => document.body.innerText.includes("mock-output-158.csv"),
  undefined,
  { timeout: 30000 },
);

let readyToApply = false;
try {
  await page.waitForFunction(
    () => {
      const apply = [...document.querySelectorAll("button")]
        .find((button) => /^(应用到所有|Apply to All)$/.test((button.textContent || "").trim()));
      const loading = [...document.querySelectorAll("[data-source-status]")]
        .filter((node) => node.dataset.sourceStatus === "pending" || node.dataset.sourceStatus === "preparing")
        .length;
      return Boolean(apply && !apply.disabled && loading === 0);
    },
    undefined,
    { timeout: 60000 },
  );
  readyToApply = true;
} catch {
  readyToApply = false;
}

const beforeClickState = await page.evaluate(() => ({
  bodyHead: document.body.innerText.slice(0, 3000),
  buttons: [...document.querySelectorAll("button")].map((button, index) => ({
    index,
    disabled: button.disabled,
    text: (button.textContent || "").trim(),
    visible: Boolean(button.offsetParent),
  })),
}));

await page.getByRole("button", { name: /^(应用到所有|Apply to All)$/ }).click();
await page.waitForTimeout(1000);

const afterClickState = await page.evaluate(() => ({
  bodyHead: document.body.innerText.slice(0, 3000),
  buttons: [...document.querySelectorAll("button")].map((button, index) => ({
    index,
    disabled: button.disabled,
    text: (button.textContent || "").trim(),
    visible: Boolean(button.offsetParent),
  })),
}));

let completed = false;
try {
  await page.waitForFunction(
    () => {
      const report = globalThis.conductorAnalysisPerf?.getReport?.();
      return Boolean(report?.entries?.some((entry) =>
        entry.stage === "processing:batch" || entry.name === "processing:batch"
      ));
    },
    undefined,
    { timeout: 45000 },
  );
  completed = true;
} catch {
  completed = false;
}

const result = await page.evaluate(({
  afterClickStateValue,
  beforeClickStateValue,
  completedFlag,
  readyToApplyFlag,
}) => {
  const perf = globalThis.conductorAnalysisPerf;
  const report = perf?.getReport?.() ?? null;
  const bodyText = document.body.innerText;
  const apply = [...document.querySelectorAll("button")]
    .find((button) => /^(应用到所有|Apply to All)$/.test((button.textContent || "").trim()));
  const sourceStatusCounts = [...document.querySelectorAll("[data-source-status]")]
    .reduce((counts, node) => {
      const key = node.dataset.sourceStatus || "empty";
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {});
  const processingText = bodyText
    .split("\n")
    .filter((line) => /处理|processed|Processing|已处理|\d+\s*\/\s*\d+/.test(line))
    .slice(-30);
  return {
    applyButtonDisabled: apply ? apply.disabled : null,
    afterClickState: afterClickStateValue,
    beforeClickState: beforeClickStateValue,
    completed: completedFlag,
    hasPerfApi: Boolean(perf),
    readyToApply: readyToApplyFlag,
    report,
    sourceStatusCounts,
    processingText,
    bodyTail: bodyText.slice(-2000),
  };
}, {
  afterClickStateValue: afterClickState,
  beforeClickStateValue: beforeClickState,
  completedFlag: completed,
  readyToApplyFlag: readyToApply,
});

await fs.writeFile(
  OUTPUT_PATH,
  JSON.stringify({ ...result, consoleTail: consoleTail.slice(-100) }, null, 2),
  "utf8",
);
await browser.close();

console.log(OUTPUT_PATH);
