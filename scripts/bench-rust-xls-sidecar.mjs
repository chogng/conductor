import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

const DEFAULT_ROOTS = [
  "C:/Users/lanxi/Desktop/ZC",
  "C:/Users/lanxi/Desktop/20251221device",
  "C:/Users/lanxi/Desktop/293K",
];

const EXCEL_EXTENSIONS = new Set([".xls", ".xlsx"]);
const ROOT = process.cwd();
const DEFAULT_EXE_CANDIDATES = [
  path.join(ROOT, "excel", "bin", "rust-xls-converter.exe"),
  path.join(
    ROOT,
    "tools",
    "rust-xls-bench",
    "target",
    "release",
    "rust-xls-bench.exe",
  ),
];

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

const findConverterExe = async () => {
  const fromEnv = String(process.env.CONDUCTOR_RUST_XLS_CONVERTER_PATH ?? "").trim();
  const candidates = fromEnv ? [fromEnv, ...DEFAULT_EXE_CANDIDATES] : DEFAULT_EXE_CANDIDATES;
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) return candidate;
    } catch {
      // try next candidate
    }
  }
  throw new Error(`Rust converter executable was not found: ${candidates.join(", ")}`);
};

const convertOne = async (exePath, filePath, outputPath) => {
  const start = performance.now();
  const child = spawn(exePath, ["--convert-one", filePath, "--out", outputPath], {
    windowsHide: true,
  });

  let stderr = "";
  let stdout = "";
  child.stderr?.setEncoding("utf8");
  child.stdout?.setEncoding("utf8");
  child.stderr?.on("data", (chunk) => {
    stderr += chunk;
  });
  child.stdout?.on("data", (chunk) => {
    stdout += chunk;
  });

  await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          stderr.trim() ||
            stdout.trim() ||
            `converter exited with code=${code} signal=${signal}`,
        ),
      );
    });
  });

  const [sourceStat, outputStat] = await Promise.all([
    fs.stat(filePath),
    fs.stat(outputPath),
  ]);

  return {
    convertMs: performance.now() - start,
    csvBytes: outputStat.size,
    filePath,
    sizeBytes: sourceStat.size,
  };
};

const roots = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const selectedRoots = roots.length ? roots : DEFAULT_ROOTS;
const allFiles = [];
for (const root of selectedRoots) {
  allFiles.push(...(await walkExcelFiles(root)));
}
allFiles.sort((a, b) => a.localeCompare(b));

const exePath = await findConverterExe();
const tempRoot = path.join(ROOT, ".tooling", "rust-xls-sidecar-bench");
await fs.rm(tempRoot, { force: true, recursive: true });
await fs.mkdir(tempRoot, { recursive: true });

const runPool = async (poolSize) => {
  const results = [];
  const failed = [];
  let nextIndex = 0;
  let completed = 0;
  const start = performance.now();

  const runLane = async (laneIndex) => {
    while (nextIndex < allFiles.length) {
      const index = nextIndex;
      nextIndex += 1;
      const filePath = allFiles[index];
      const outputPath = path.join(tempRoot, `pool-${poolSize}-${index}.csv`);
      try {
        results.push(await convertOne(exePath, filePath, outputPath));
      } catch (error) {
        failed.push({
          filePath,
          laneIndex,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      completed += 1;
      if (completed % 25 === 0 || completed === allFiles.length) {
        console.log(`[rust-sidecar pool=${poolSize}] processed ${completed}/${allFiles.length}`);
      }
    }
  };

  await Promise.all(Array.from({ length: poolSize }, (_unused, index) => runLane(index)));

  const summary = results.reduce(
    (acc, result) => {
      acc.convertMs += result.convertMs;
      acc.csvBytes += result.csvBytes;
      acc.sizeBytes += result.sizeBytes;
      return acc;
    },
    {
      convertMs: 0,
      csvBytes: 0,
      sizeBytes: 0,
    },
  );

  const wallMs = performance.now() - start;
  console.log(`\n[rust-sidecar pool=${poolSize}]`);
  console.log(`files=${results.length} failed=${failed.length}`);
  console.log(`source=${formatBytes(summary.sizeBytes)} csvText=${formatBytes(summary.csvBytes)}`);
  console.log(`sumProcess=${formatMs(summary.convertMs)} wall=${formatMs(wallMs)}`);
  console.log(`rss=${formatBytes(process.memoryUsage().rss)}`);
  console.log("[slowest]");
  for (const result of [...results]
    .sort((a, b) => b.convertMs - a.convertMs)
    .slice(0, 8)) {
    console.log(
      `${formatMs(result.convertMs).padStart(7)} size=${formatBytes(result.sizeBytes).padStart(8)} ${result.filePath}`,
    );
  }
  if (failed.length) {
    console.log("[failed]");
    for (const failure of failed.slice(0, 8)) {
      console.log(`${failure.filePath}: ${failure.message}`);
    }
  }
};

console.log(`[rust-sidecar bench] exe=${exePath}`);
console.log(`[rust-sidecar bench] excelFiles=${allFiles.length}`);
await runPool(1);
await runPool(2);
await fs.rm(tempRoot, { force: true, recursive: true });
