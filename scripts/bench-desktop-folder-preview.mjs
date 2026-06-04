import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

const ROOT = process.cwd();
const WORKER_FILE_NAME = process.platform === "win32" ? "rs-worker.exe" : "rs-worker";
const FIRST_STAT_BATCH_SIZE = 8;
const PREVIEW_SEED_ROWS = 5000;
const MAX_WALK_DEPTH = 16;

const formatMs = (value) => `${Math.round(value)}ms`;

const resolveWorkerPath = async () => {
  const envPath =
    process.env.CONDUCTOR_RS_WORKER_PATH ||
    process.env.CONDUCTOR_WORKER_PATH ||
    process.env.CONDUCTOR_ENGINE_PATH ||
    process.env.CONDUCTOR_RUST_XLS_CONVERTER_PATH ||
    "";
  const candidates = [
    envPath,
    path.join(ROOT, "workers", "rs", WORKER_FILE_NAME),
    path.join(ROOT, ".tooling", "conductor-rs-target", "release", WORKER_FILE_NAME),
    path.join(ROOT, "conductor-rs", "target", "release", WORKER_FILE_NAME),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) {
        return candidate;
      }
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error(`rs-worker not found. Checked: ${candidates.join(", ")}`);
};

const isCsv = (fileName) => path.extname(fileName).toLowerCase() === ".csv";
const isExcel = (fileName) => {
  const extension = path.extname(fileName).toLowerCase();
  return extension === ".xls" || extension === ".xlsx";
};
const isSupportedImportFile = (fileName) => isCsv(fileName) || isExcel(fileName);

const compareImportTasks = (first, second) => {
  const firstIsExcel = isExcel(first.name);
  const secondIsExcel = isExcel(second.name);
  if (firstIsExcel !== secondIsExcel) {
    return firstIsExcel ? 1 : -1;
  }

  return first.relativePath.localeCompare(second.relativePath, undefined, {
    numeric: true,
    sensitivity: "base",
  });
};

const findFirstBatch = async (folder, relativeFolderPath, depth = 0) => {
  if (depth > MAX_WALK_DEPTH) {
    return { files: [], readDirs: 0 };
  }

  const entries = await fs.readdir(folder, { withFileTypes: true });
  const fileTasks = [];
  const folderTasks = [];

  for (const entry of entries) {
    const resource = path.join(folder, entry.name);
    const relativePath = `${relativeFolderPath}/${entry.name}`;
    if (entry.isDirectory()) {
      folderTasks.push({ relativePath, resource });
      continue;
    }
    if (!entry.isFile() || !isSupportedImportFile(entry.name)) {
      continue;
    }
    fileTasks.push({
      name: entry.name,
      relativePath,
      resource,
    });
  }

  if (fileTasks.length) {
    const files = [];
    const statTasks = [...fileTasks]
      .sort(compareImportTasks)
      .slice(0, FIRST_STAT_BATCH_SIZE);
    for (const task of statTasks) {
      const stat = await fs.stat(task.resource);
      files.push({
        ...task,
        lastModified: stat.mtimeMs,
        size: stat.size,
      });
    }

    return { files, readDirs: 1 };
  }

  let readDirs = 1;
  for (const task of folderTasks) {
    const result = await findFirstBatch(task.resource, task.relativePath, depth + 1);
    readDirs += result.readDirs;
    if (result.files.length) {
      return { files: result.files, readDirs };
    }
  }

  return { files: [], readDirs };
};

const walkSupportedFiles = async (root) => {
  const files = [];
  const stack = [{ depth: 0, folder: root }];
  while (stack.length) {
    const current = stack.pop();
    if (!current || current.depth > MAX_WALK_DEPTH) {
      continue;
    }

    let entries = [];
    try {
      entries = await fs.readdir(current.folder, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const resource = path.join(current.folder, entry.name);
      if (entry.isDirectory()) {
        stack.push({ depth: current.depth + 1, folder: resource });
        continue;
      }
      if (entry.isFile() && isSupportedImportFile(entry.name)) {
        files.push(resource);
      }
    }
  }

  return files;
};

const createWorker = (exePath) => {
  const child = spawn(exePath, ["--stdio-worker"], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  let stdoutBuffer = "";
  let nextId = 0;
  const pending = new Map();

  child.stdout.on("data", (chunk) => {
    stdoutBuffer += String(chunk ?? "");
    while (true) {
      const newlineIndex = stdoutBuffer.indexOf("\n");
      if (newlineIndex < 0) {
        break;
      }

      const line = stdoutBuffer.slice(0, newlineIndex);
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      const text = line.trim();
      if (!text) {
        continue;
      }

      let message = null;
      try {
        message = JSON.parse(text);
      } catch (error) {
        console.warn(`[bench] invalid worker JSON: ${error.message}`);
        continue;
      }

      const entry = pending.get(message.id);
      if (!entry) {
        continue;
      }

      pending.delete(message.id);
      if (message.ok) {
        entry.resolve(message.result ?? {});
      } else {
        entry.reject(new Error(message.error?.message || "rs-worker failed"));
      }
    }
  });

  child.stderr.on("data", (chunk) => {
    const text = String(chunk ?? "").trim();
    if (text) {
      console.warn(`[rs-worker] ${text}`);
    }
  });

  child.on("exit", (code, signal) => {
    const error = new Error(`rs-worker exited code=${code ?? "null"} signal=${signal ?? "null"}`);
    for (const entry of pending.values()) {
      entry.reject(error);
    }
    pending.clear();
  });

  const send = (command, payload) => {
    const id = (nextId += 1);
    const message = JSON.stringify({ id, command, ...payload });
    const promise = new Promise((resolve, reject) => {
      pending.set(id, { reject, resolve });
    });
    child.stdin.write(`${message}\n`, "utf8");
    return promise;
  };

  return {
    close() {
      child.kill();
    },
    send,
  };
};

const timeColdCommand = async (exePath, command, payload) => {
  const startedAt = performance.now();
  const worker = createWorker(exePath);
  try {
    const result = await worker.send(command, payload);
    return {
      durationMs: performance.now() - startedAt,
      result,
    };
  } finally {
    worker.close();
  }
};

const timeWarmCommand = async (worker, command, payload) => {
  const startedAt = performance.now();
  const result = await worker.send(command, payload);
  return {
    durationMs: performance.now() - startedAt,
    result,
  };
};

const main = async () => {
  const folderArg = process.argv[2] || process.env.CONDUCTOR_BENCH_ROOT;
  if (!folderArg) {
    throw new Error("Usage: node scripts/bench-desktop-folder-preview.mjs <folder>");
  }

  const folder = path.resolve(folderArg);
  const folderName = path.basename(folder) || "Folder";
  const exePath = await resolveWorkerPath();

  const scanStartedAt = performance.now();
  const firstBatch = await findFirstBatch(folder, folderName);
  const scanMs = performance.now() - scanStartedAt;
  const firstCsv = firstBatch.files.find((file) => isCsv(file.name));
  if (!firstCsv) {
    throw new Error("No CSV file found in first import batch.");
  }

  const fullScanStartedAt = performance.now();
  const supportedFiles = await walkSupportedFiles(folder);
  const fullScanMs = performance.now() - fullScanStartedAt;

  const assessPayload = {
    fileName: firstCsv.name,
    path: firstCsv.resource,
  };
  const openPayload = {
    fileId: "bench-preview",
    fileName: firstCsv.name,
    path: firstCsv.resource,
    seedRows: PREVIEW_SEED_ROWS,
  };

  const coldAssess = await timeColdCommand(exePath, "assessImport", assessPayload);
  const coldOpen = await timeColdCommand(exePath, "open", openPayload);

  const processWorker = createWorker(exePath);
  const previewWorker = createWorker(exePath);
  try {
    await processWorker.send("assessImport", assessPayload);
    await previewWorker.send("open", openPayload);
    const warmAssess = await timeWarmCommand(processWorker, "assessImport", assessPayload);
    const warmOpen = await timeWarmCommand(previewWorker, "open", {
      ...openPayload,
      fileId: "bench-preview-warm",
    });

    const openResult = coldOpen.result ?? {};
    console.log("[desktop-folder-preview]");
    console.log(`folder=${folder}`);
    console.log(`worker=${exePath}`);
    console.log(`firstFile=${firstCsv.resource}`);
    console.log(`firstBatchFiles=${firstBatch.files.length} firstBatchReadDirs=${firstBatch.readDirs} firstBatchScan=${formatMs(scanMs)}`);
    console.log(`supportedFiles=${supportedFiles.length} fullWalk=${formatMs(fullScanMs)}`);
    console.log(`coldAssess=${formatMs(coldAssess.durationMs)} coldOpen=${formatMs(coldOpen.durationMs)} coldTotalToPreview=${formatMs(scanMs + coldAssess.durationMs + coldOpen.durationMs)}`);
    console.log(`warmAssess=${formatMs(warmAssess.durationMs)} warmOpen=${formatMs(warmOpen.durationMs)} warmTotalToPreview=${formatMs(scanMs + warmAssess.durationMs + warmOpen.durationMs)}`);
    console.log(`previewRows=${Array.isArray(openResult.seedRows) ? openResult.seedRows.length : 0} rows=${Number(openResult.rowCount) || 0} columns=${Number(openResult.columnCount) || 0}`);
  } finally {
    processWorker.close();
    previewWorker.close();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
