import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

const DEFAULT_ROOTS = [
  "C:/Users/lanxi/Desktop/ZC",
  "C:/Users/lanxi/Desktop/20251221device",
  "C:/Users/lanxi/Desktop/293K",
];

const SUPPORTED_EXTENSIONS = new Set([".csv", ".xls", ".xlsx"]);
const ROOT = process.cwd();
const EXE_PATH = path.join(ROOT, "excel", "bin", "rs-worker.exe");

const formatMs = (value) => `${Math.round(value)}ms`;
const formatBytes = (value) => {
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)}${units[unitIndex]}`;
};

const walkFiles = async (root) => {
  const files = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(fullPath);
      }
    }
  }
  return files;
};

const createRsWorker = () => {
  const child = spawn(EXE_PATH, ["--stdio-worker"], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  let stdoutBuffer = "";
  let nextId = 0;
  const pending = new Map();

  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk;
    while (true) {
      const newlineIndex = stdoutBuffer.indexOf("\n");
      if (newlineIndex < 0) break;
      const line = stdoutBuffer.slice(0, newlineIndex);
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      const message = JSON.parse(line);
      const entry = pending.get(message.id);
      if (!entry) continue;
      pending.delete(message.id);
      if (message.ok) {
        entry.resolve(message.result);
      } else {
        entry.reject(new Error(message.error?.message || "rs-worker failed"));
      }
    }
  });

  child.stderr.on("data", (chunk) => {
    const text = String(chunk ?? "").trim();
    if (text) console.warn(text);
  });

  const send = (command, payload) => {
    const id = (nextId += 1);
    child.stdin.write(`${JSON.stringify({ id, command, ...payload })}\n`);
    return new Promise((resolve, reject) => {
      pending.set(id, { reject, resolve });
    });
  };

  return {
    child,
    send,
    close() {
      child.kill();
    },
  };
};

const roots = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const selectedRoots = roots.length ? roots : DEFAULT_ROOTS;
const files = [];
for (const root of selectedRoots) {
  files.push(...(await walkFiles(root)));
}
files.sort((a, b) => a.localeCompare(b));

const rsWorker = createRsWorker();
const started = performance.now();
let rows = 0;
let cells = 0;
let sourceBytes = 0;
let previewRows = 0;

try {
  for (let index = 0; index < files.length; index += 1) {
    const filePath = files[index];
    const fileId = `bench-${index}`;
    const stat = await fs.stat(filePath);
    sourceBytes += stat.size;
    const openResult = await rsWorker.send("open", {
      fileId,
      fileName: path.basename(filePath),
      path: filePath,
      seedRows: 4,
    });
    rows += Number(openResult.rowCount) || 0;
    cells +=
      (Number(openResult.rowCount) || 0) *
      Math.max(0, Number(openResult.columnCount) || 0);
    const rowsResult = await rsWorker.send("previewRows", {
      endRow: Math.min(24, Number(openResult.rowCount) || 0),
      fileId,
      startRow: 0,
    });
    previewRows += Array.isArray(rowsResult.rows) ? rowsResult.rows.length : 0;
    if ((index + 1) % 25 === 0 || index + 1 === files.length) {
      console.log(`[rs-worker-preview] opened ${index + 1}/${files.length}`);
    }
  }

  console.log("\n[rs-worker-preview summary]");
  console.log(`files=${files.length}`);
  console.log(`source=${formatBytes(sourceBytes)}`);
  console.log(`rows=${rows} approxCells=${cells} previewRows=${previewRows}`);
  console.log(`wall=${formatMs(performance.now() - started)}`);
  console.log(`nodeRss=${formatBytes(process.memoryUsage().rss)}`);
} finally {
  rsWorker.close();
}
