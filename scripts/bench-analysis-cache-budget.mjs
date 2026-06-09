import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

const ROOT = process.cwd();
const WORKER_FILE_NAME = process.platform === "win32" ? "rs-worker.exe" : "rs-worker";
const EXE_PATH = path.join(ROOT, "workers", "rs", WORKER_FILE_NAME);
const SUPPORTED_EXTENSIONS = new Set([".csv", ".xls", ".xlsx"]);
const SINGLE_FILE_BUDGET_BYTES = 32 * 1024 * 1024;
const TOTAL_BUDGET_BYTES = 64 * 1024 * 1024;

const formatMs = (value) => `${Math.round(value)}ms`;

const formatBytes = (value) => {
  if (!Number.isFinite(value)) return "-";
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
  files.sort((a, b) => a.localeCompare(b));
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
      const line = stdoutBuffer.slice(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      if (!line) continue;
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

  child.on("exit", (code, signal) => {
    for (const entry of pending.values()) {
      entry.reject(new Error(`rs-worker exited code=${code} signal=${signal}`));
    }
    pending.clear();
  });

  return {
    send(command, payload) {
      const id = (nextId += 1);
      child.stdin.write(`${JSON.stringify({ id, command, ...payload })}\n`);
      return new Promise((resolve, reject) => {
        pending.set(id, { reject, resolve });
      });
    },
    close() {
      child.kill();
    },
  };
};

const countArrayLength = (value) => (Array.isArray(value) ? value.length : 0);

const hydrateCalculationCacheRef = async (file) => {
  const ref = file?.calculationCacheRef;
  if (!ref || typeof ref !== "object" || ref.format !== "json") return file;
  if (typeof ref.path !== "string" || !path.isAbsolute(ref.path)) return file;
  const text = await fs.readFile(ref.path, "utf8");
  file.analysisCache = JSON.parse(text);
  delete file.calculationCacheRef;
  return file;
};

const summarizeAnalysisCache = (file) => {
  const rawSeries = file?.analysisCache?.series;
  if (!rawSeries || typeof rawSeries !== "object" || Array.isArray(rawSeries)) {
    return {
      baseCurrent: 0,
      bytes: 0,
      fit: 0,
      gm: 0,
      prunable: false,
      series: 0,
      ss: 0,
    };
  }

  let baseCurrent = 0;
  let fit = 0;
  let gm = 0;
  let prunable = false;
  let series = 0;
  let ss = 0;

  for (const result of Object.values(rawSeries)) {
    if (!result || typeof result !== "object") continue;
    series += 1;
    if (Array.isArray(result.gm)) prunable = true;
    if (Array.isArray(result.ss)) prunable = true;
    gm += countArrayLength(result.gm);
    ss += countArrayLength(result.ss);
    if (result.ssFitAuto) fit += 1;
    if (result.baseCurrent) baseCurrent += 1;
  }

  return {
    baseCurrent,
    bytes: (gm + ss) * 4 * 8 + (fit + baseCurrent) * 512,
    fit,
    gm,
    prunable,
    series,
    ss,
  };
};

const simulateBudget = (items) => {
  const bytes = items.map((item) => item.summary.bytes);
  const totalBeforeBytes = bytes.reduce((sum, value) => sum + value, 0);
  const pruneIndexes = new Set();

  for (let index = 0; index < items.length; index += 1) {
    if (
      bytes[index] > SINGLE_FILE_BUDGET_BYTES &&
      items[index].summary.prunable
    ) {
      pruneIndexes.add(index);
    }
  }

  let projectedTotalBytes = totalBeforeBytes;
  for (const index of pruneIndexes) {
    projectedTotalBytes -= bytes[index] ?? 0;
  }

  if (projectedTotalBytes > TOTAL_BUDGET_BYTES) {
    for (let index = 0; index < items.length; index += 1) {
      if (projectedTotalBytes <= TOTAL_BUDGET_BYTES) break;
      if (pruneIndexes.has(index)) continue;
      if (!items[index].summary.prunable) continue;
      pruneIndexes.add(index);
      projectedTotalBytes -= bytes[index] ?? 0;
    }
  }

  return {
    prunedBytes: [...pruneIndexes].reduce(
      (sum, index) => sum + (bytes[index] ?? 0),
      0,
    ),
    prunedFiles: pruneIndexes.size,
    totalAfterBytes: projectedTotalBytes,
    totalBeforeBytes,
  };
};

const root = process.argv[2] || process.env.CONDUCTOR_BENCH_ROOT;
if (!root) {
  throw new Error(
    "Usage: node scripts/bench-analysis-cache-budget.mjs <data-root> or set CONDUCTOR_BENCH_ROOT.",
  );
}
const files = await walkFiles(root);
const rsWorker = createRsWorker();
const started = performance.now();
const failures = [];
const successes = [];

try {
  for (let index = 0; index < files.length; index += 1) {
    const filePath = files[index];
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "conductor-analysis-cache-bench-"),
    );
    try {
      const result = await rsWorker.send("processFileAuto", {
        calculationCachePath: path.join(tempDir, "calculation-cache.json"),
        fileId: `analysis-cache-${index}`,
        fileName: path.basename(filePath),
        maxPoints: 600,
        path: filePath,
      });
      await hydrateCalculationCacheRef(result);
      const summary = summarizeAnalysisCache(result);
      if (!summary.series) {
        failures.push({
          file: path.basename(filePath),
          message: "missing analysisCache",
        });
      } else {
        successes.push({
          file: path.basename(filePath),
          summary,
        });
      }
    } catch (error) {
      failures.push({
        file: path.basename(filePath),
        message: error?.message || String(error),
      });
    } finally {
      await fs.rm(tempDir, { force: true, recursive: true });
    }

    if ((index + 1) % 25 === 0 || index + 1 === files.length) {
      console.log(`[analysis-cache-budget] processed ${index + 1}/${files.length}`);
    }
  }
} finally {
  rsWorker.close();
}

const totals = successes.reduce(
  (acc, item) => {
    acc.baseCurrent += item.summary.baseCurrent;
    acc.bytes += item.summary.bytes;
    acc.fit += item.summary.fit;
    acc.gm += item.summary.gm;
    acc.series += item.summary.series;
    acc.ss += item.summary.ss;
    return acc;
  },
  {
    baseCurrent: 0,
    bytes: 0,
    fit: 0,
    gm: 0,
    series: 0,
    ss: 0,
  },
);

const budget = simulateBudget(successes);
const largest = successes
  .map((item) => ({
    bytes: item.summary.bytes,
    file: item.file,
    gm: item.summary.gm,
    series: item.summary.series,
    ss: item.summary.ss,
  }))
  .sort((a, b) => b.bytes - a.bytes)
  .slice(0, 10);

console.log("\n[analysis-cache-budget summary]");
console.log(`root=${root}`);
console.log(`files=${files.length} successes=${successes.length} failures=${failures.length}`);
console.log(
  `series=${totals.series} gm=${totals.gm} ss=${totals.ss} fit=${totals.fit} baseCurrent=${totals.baseCurrent}`,
);
console.log(
  `estimated=${formatBytes(totals.bytes)} budgetAfter=${formatBytes(budget.totalAfterBytes)} prunedFiles=${budget.prunedFiles} pruned=${formatBytes(budget.prunedBytes)}`,
);
console.log(`wall=${formatMs(performance.now() - started)}`);

if (largest.length) {
  console.log("\n[largest analysis caches]");
  for (const item of largest) {
    console.log(
      `${formatBytes(item.bytes).padStart(8)} series=${String(item.series).padStart(3)} gm=${String(item.gm).padStart(6)} ss=${String(item.ss).padStart(6)} ${item.file}`,
    );
  }
}

if (failures.length) {
  console.log("\n[failures]");
  for (const failure of failures.slice(0, 20)) {
    console.log(`${failure.file}: ${failure.message}`);
  }
}

if (failures.some((failure) => failure.message === "missing analysisCache")) {
  process.exitCode = 1;
}
