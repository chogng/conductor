import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import Papa from "papaparse";
import * as xlsx from "xlsx";

const SUPPORTED_EXTENSIONS = new Set([".csv", ".xls", ".xlsx"]);
const PREVIEW_BYTES = 128 * 1024;
const PREVIEW_ROWS = 256;

const rootsFromEnv = () =>
  String(process.env.CONDUCTOR_BENCH_ROOTS ?? "")
    .split(path.delimiter)
    .map((value) => value.trim())
    .filter(Boolean);

const now = () => performance.now();
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
    } catch (error) {
      console.warn(`[bench] skip unreadable path: ${current} (${error.message})`);
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const extension = path.extname(entry.name).toLowerCase();
      if (SUPPORTED_EXTENSIONS.has(extension)) {
        files.push(fullPath);
      }
    }
  }

  return files;
};

const parseCsvText = (text) => {
  let rows = 0;
  let cells = 0;
  let numericCells = 0;
  let columnCount = 0;

  Papa.parse(text, {
    header: false,
    skipEmptyLines: true,
    step: (results) => {
      const row = Array.isArray(results?.data) ? results.data : [];
      rows += 1;
      cells += row.length;
      if (row.length > columnCount) columnCount = row.length;

      for (const cell of row) {
        if (cell === null || cell === undefined || cell === "") continue;
        const value = Number(cell);
        if (Number.isFinite(value)) numericCells += 1;
      }
    },
  });

  return { cells, columnCount, numericCells, rows };
};

const parsePreview = (text) => {
  const parsed = Papa.parse(text.slice(0, PREVIEW_BYTES), {
    preview: PREVIEW_ROWS,
    skipEmptyLines: false,
  });
  return Array.isArray(parsed?.data) ? parsed.data.length : 0;
};

const loadAsCsvText = async (filePath, extension) => {
  const ioStart = now();

  if (extension === ".csv") {
    const text = await fs.readFile(filePath, "utf8");
    return {
      convertMs: 0,
      ioMs: now() - ioStart,
      text,
      textBytes: Buffer.byteLength(text),
    };
  }

  const buffer = await fs.readFile(filePath);
  const ioMs = now() - ioStart;
  const convertStart = now();
  const workbook = xlsx.read(buffer, {
    type: "buffer",
    cellDates: false,
    cellNF: false,
    cellStyles: false,
    cellText: false,
    dense: true,
    raw: false,
  });
  const firstSheetName = String(workbook?.SheetNames?.[0] ?? "").trim();
  if (!firstSheetName) throw new Error("workbook has no sheet");
  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) throw new Error("failed to read first sheet");
  const text = xlsx.utils.sheet_to_csv(sheet, {
    blankrows: false,
    FS: ",",
    RS: "\n",
  });

  return {
    convertMs: now() - convertStart,
    ioMs,
    text,
    textBytes: Buffer.byteLength(text),
  };
};

const benchmarkFile = async (filePath, root) => {
  const extension = path.extname(filePath).toLowerCase();
  const stat = await fs.stat(filePath);
  const start = now();
  const loaded = await loadAsCsvText(filePath, extension);

  const previewStart = now();
  const previewRows = parsePreview(loaded.text);
  const previewMs = now() - previewStart;

  const parseStart = now();
  const parsed = parseCsvText(loaded.text);
  const parseMs = now() - parseStart;

  const totalMs = now() - start;
  return {
    cells: parsed.cells,
    columnCount: parsed.columnCount,
    convertMs: loaded.convertMs,
    extension,
    filePath,
    ioMs: loaded.ioMs,
    numericCells: parsed.numericCells,
    parseMs,
    previewMs,
    previewRows,
    root,
    rows: parsed.rows,
    sizeBytes: stat.size,
    textBytes: loaded.textBytes,
    totalMs,
  };
};

const summarize = (results) => {
  const total = results.reduce(
    (acc, result) => {
      acc.cells += result.cells;
      acc.convertMs += result.convertMs;
      acc.files += 1;
      acc.ioMs += result.ioMs;
      acc.numericCells += result.numericCells;
      acc.parseMs += result.parseMs;
      acc.previewMs += result.previewMs;
      acc.rows += result.rows;
      acc.sizeBytes += result.sizeBytes;
      acc.textBytes += result.textBytes;
      acc.totalMs += result.totalMs;
      return acc;
    },
    {
      cells: 0,
      convertMs: 0,
      files: 0,
      ioMs: 0,
      numericCells: 0,
      parseMs: 0,
      previewMs: 0,
      rows: 0,
      sizeBytes: 0,
      textBytes: 0,
      totalMs: 0,
    },
  );

  const parseSeconds = total.parseMs / 1000;
  total.parseMbPerSecond =
    parseSeconds > 0 ? total.textBytes / 1024 / 1024 / parseSeconds : 0;
  total.rowsPerSecond = parseSeconds > 0 ? total.rows / parseSeconds : 0;
  return total;
};

const printSummary = (label, summary) => {
  console.log(`\n[${label}]`);
  console.log(`files=${summary.files}`);
  console.log(`source=${formatBytes(summary.sizeBytes)} csvText=${formatBytes(summary.textBytes)}`);
  console.log(`rows=${summary.rows.toLocaleString()} cells=${summary.cells.toLocaleString()} numeric=${summary.numericCells.toLocaleString()}`);
  console.log(`io=${formatMs(summary.ioMs)} convert=${formatMs(summary.convertMs)} preview=${formatMs(summary.previewMs)} parse=${formatMs(summary.parseMs)} total=${formatMs(summary.totalMs)}`);
  console.log(`parseThroughput=${summary.parseMbPerSecond.toFixed(1)}MB/s rowsPerSecond=${Math.round(summary.rowsPerSecond).toLocaleString()}`);
};

const main = async () => {
  const roots = process.argv.slice(2);
  const selectedRoots = roots.length ? roots : rootsFromEnv();
  if (!selectedRoots.length) {
    throw new Error(
      "Usage: node scripts/bench-device-analysis-import.mjs <data-root...> or set CONDUCTOR_BENCH_ROOTS.",
    );
  }
  const allFiles = [];

  for (const root of selectedRoots) {
    const files = await walkFiles(root);
    allFiles.push(...files.map((filePath) => ({ filePath, root })));
  }

  allFiles.sort((a, b) => a.filePath.localeCompare(b.filePath));
  console.log(`[bench] files=${allFiles.length}`);
  console.log(`[bench] roots=${selectedRoots.join(" | ")}`);

  const startRss = process.memoryUsage().rss;
  const results = [];
  const failed = [];
  const suiteStart = now();

  for (let index = 0; index < allFiles.length; index += 1) {
    const entry = allFiles[index];
    try {
      const result = await benchmarkFile(entry.filePath, entry.root);
      results.push(result);
      if ((index + 1) % 25 === 0 || index === allFiles.length - 1) {
        console.log(`[bench] processed ${index + 1}/${allFiles.length}`);
      }
    } catch (error) {
      failed.push({
        error: error instanceof Error ? error.message : String(error),
        filePath: entry.filePath,
      });
      console.warn(`[bench] failed: ${entry.filePath} (${failed.at(-1).error})`);
    }
  }

  const suiteMs = now() - suiteStart;
  const endRss = process.memoryUsage().rss;
  const byRoot = new Map();
  const byExt = new Map();

  for (const result of results) {
    if (!byRoot.has(result.root)) byRoot.set(result.root, []);
    byRoot.get(result.root).push(result);
    if (!byExt.has(result.extension)) byExt.set(result.extension, []);
    byExt.get(result.extension).push(result);
  }

  printSummary("all", summarize(results));

  for (const [root, rootResults] of byRoot.entries()) {
    printSummary(root, summarize(rootResults));
  }

  for (const [extension, extResults] of [...byExt.entries()].sort()) {
    printSummary(extension, summarize(extResults));
  }

  console.log("\n[slowest total]");
  for (const result of [...results].sort((a, b) => b.totalMs - a.totalMs).slice(0, 12)) {
    console.log(
      `${formatMs(result.totalMs).padStart(7)} parse=${formatMs(result.parseMs).padStart(7)} convert=${formatMs(result.convertMs).padStart(7)} rows=${String(result.rows).padStart(8)} size=${formatBytes(result.sizeBytes).padStart(8)} ${result.filePath}`,
    );
  }

  console.log("\n[slowest parse]");
  for (const result of [...results].sort((a, b) => b.parseMs - a.parseMs).slice(0, 12)) {
    console.log(
      `${formatMs(result.parseMs).padStart(7)} rows=${String(result.rows).padStart(8)} cells=${String(result.cells).padStart(9)} csvText=${formatBytes(result.textBytes).padStart(8)} ${result.filePath}`,
    );
  }

  if (failed.length) {
    console.log("\n[failed]");
    for (const entry of failed) {
      console.log(`${entry.filePath}: ${entry.error}`);
    }
  }

  console.log("\n[process]");
  console.log(`suite=${formatMs(suiteMs)} rssStart=${formatBytes(startRss)} rssEnd=${formatBytes(endRss)} rssDelta=${formatBytes(endRss - startRss)}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
