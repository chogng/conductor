import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { Worker, isMainThread, parentPort } from "node:worker_threads";

const DEFAULT_ROOTS = [
  "C:/Users/lanxi/Desktop/ZC",
  "C:/Users/lanxi/Desktop/20251221device",
  "C:/Users/lanxi/Desktop/293K",
];

const EXCEL_EXTENSIONS = new Set([".xls", ".xlsx"]);

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

const walkExcelFiles = async (root) => {
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
      if (EXCEL_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(fullPath);
      }
    }
  }

  return files;
};

if (!isMainThread) {
  const xlsx = await import("xlsx");

  parentPort.on("message", async (message) => {
    if (message?.type === "stop") {
      process.exit(0);
      return;
    }

    const filePath = message?.filePath;
    const requestId = message?.requestId;
    try {
      const stat = await fs.stat(filePath);
      const ioStart = performance.now();
      const buffer = await fs.readFile(filePath);
      const ioMs = performance.now() - ioStart;
      const convertStart = performance.now();
      const workbook = xlsx.read(buffer, {
        type: "buffer",
        cellDates: false,
        cellNF: false,
        cellStyles: false,
        cellText: false,
        dense: true,
        raw: false,
      });
      const firstSheetName = workbook.SheetNames[0];
      const csv = xlsx.utils.sheet_to_csv(workbook.Sheets[firstSheetName], {
        blankrows: false,
        FS: ",",
        RS: "\n",
      });
      parentPort.postMessage({
        type: "result",
        payload: {
          convertMs: performance.now() - convertStart,
          csvBytes: Buffer.byteLength(csv),
          filePath,
          ioMs,
          requestId,
          sizeBytes: stat.size,
        },
      });
    } catch (error) {
      parentPort.postMessage({
        type: "error",
        payload: {
          filePath,
          message: error instanceof Error ? error.message : String(error),
          requestId,
        },
      });
    }
  });
} else {
  const roots = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const selectedRoots = roots.length ? roots : DEFAULT_ROOTS;
  const allFiles = [];
  for (const root of selectedRoots) {
    allFiles.push(...(await walkExcelFiles(root)));
  }
  allFiles.sort((a, b) => a.localeCompare(b));

  const runPool = async (poolSize) => {
    const workers = Array.from(
      { length: poolSize },
      () => new Worker(new URL(import.meta.url), { type: "module" }),
    );
    const results = [];
    const failed = [];
    let nextIndex = 0;
    let completed = 0;
    let requestId = 0;
    const start = performance.now();

    await new Promise((resolve) => {
      const assign = (worker) => {
        const filePath = allFiles[nextIndex];
        nextIndex += 1;
        if (!filePath) {
          if (completed >= allFiles.length) resolve();
          return;
        }
        requestId += 1;
        worker.postMessage({ filePath, requestId, type: "convert" });
      };

      for (const worker of workers) {
        worker.on("message", (message) => {
          if (message?.type === "result") {
            results.push(message.payload);
          } else if (message?.type === "error") {
            failed.push(message.payload);
          }
          completed += 1;
          if (completed % 25 === 0 || completed === allFiles.length) {
            console.log(`[pool=${poolSize}] processed ${completed}/${allFiles.length}`);
          }
          if (completed >= allFiles.length) {
            resolve();
            return;
          }
          assign(worker);
        });
        assign(worker);
      }
    });

    for (const worker of workers) {
      worker.postMessage({ type: "stop" });
    }

    const summary = results.reduce(
      (acc, result) => {
        acc.convertMs += result.convertMs;
        acc.csvBytes += result.csvBytes;
        acc.ioMs += result.ioMs;
        acc.sizeBytes += result.sizeBytes;
        return acc;
      },
      {
        convertMs: 0,
        csvBytes: 0,
        ioMs: 0,
        sizeBytes: 0,
      },
    );

    const wallMs = performance.now() - start;
    console.log(`\n[pool=${poolSize}]`);
    console.log(`files=${results.length} failed=${failed.length}`);
    console.log(`source=${formatBytes(summary.sizeBytes)} csvText=${formatBytes(summary.csvBytes)}`);
    console.log(`sumIo=${formatMs(summary.ioMs)} sumConvert=${formatMs(summary.convertMs)} wall=${formatMs(wallMs)}`);
    console.log(`rss=${formatBytes(process.memoryUsage().rss)}`);

    console.log("[slowest]");
    for (const result of [...results]
      .sort((a, b) => b.convertMs - a.convertMs)
      .slice(0, 8)) {
      console.log(
        `${formatMs(result.convertMs).padStart(7)} size=${formatBytes(result.sizeBytes).padStart(8)} ${result.filePath}`,
      );
    }
  };

  console.log(`[bench] excelFiles=${allFiles.length}`);
  await runPool(1);
  await runPool(2);
}
