#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import Papa from "papaparse";
import { performance } from "node:perf_hooks";
import {
  buildOriginExportPlan,
  isRustOriginCsvEligiblePayload,
  resolveRustOriginCsvYTransformForPayload,
} from "../src/features/device-analysis/analysis/lib/originSelectionExport.ts";

const ROOT = process.cwd();
const DEFAULT_ROOT = "C:/Users/lanxi/Desktop/293K";
const OUTPUT_DIR = path.join(ROOT, ".tooling", "rust-origin-export-compat");
const RUST_CSV_DIR = path.join(OUTPUT_DIR, "rust-csv");
const EXPECTED_DIR = path.join(OUTPUT_DIR, "expected");
const FILES_PATH = path.join(OUTPUT_DIR, "files.json");
const MANIFEST_PATH = path.join(OUTPUT_DIR, "manifest.json");
const PROCESS_REQUESTS_PATH = path.join(OUTPUT_DIR, "process-requests.jsonl");
const PROCESS_RESULTS_PATH = path.join(OUTPUT_DIR, "process-results.jsonl");
const EXPORT_REQUESTS_PATH = path.join(OUTPUT_DIR, "export-requests.jsonl");
const EXPORT_RESULTS_PATH = path.join(OUTPUT_DIR, "export-results.jsonl");
const REPORT_PATH = path.join(OUTPUT_DIR, "report.json");
const CONTENT_KEYS = ["iv", "metrics", "gm", "gds", "ss", "vth"];
const MAX_POINTS = 600;
const ABS_TOLERANCE = 1e-12;
const REL_TOLERANCE = 1e-9;
const SUPPORTED_EXTENSIONS = new Set([".csv", ".xls", ".xlsx"]);

const sanitizeFilename = (value) =>
  String(value || "export")
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160) || "export";

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
      if (entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(fullPath);
      }
    }
  }
  files.sort((a, b) => a.localeCompare(b));
  return files;
};

const readJsonLines = async (filePath) => {
  const text = await fs.readFile(filePath, "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
};

const writeJsonLines = async (filePath, values) => {
  await fs.writeFile(
    filePath,
    `${values.map((value) => JSON.stringify(value)).join("\n")}\n`,
    "utf8",
  );
};

const compareCell = (expectedRaw, actualRaw) => {
  const expected = String(expectedRaw ?? "").trim();
  const actual = String(actualRaw ?? "").trim();
  if (!expected && !actual) return null;
  const expectedNumber = Number(expected);
  const actualNumber = Number(actual);
  if (Number.isFinite(expectedNumber) && Number.isFinite(actualNumber)) {
    const diff = Math.abs(expectedNumber - actualNumber);
    const scale = Math.max(1, Math.abs(expectedNumber), Math.abs(actualNumber));
    if (diff <= ABS_TOLERANCE || diff / scale <= REL_TOLERANCE) return null;
    return `numeric mismatch expected=${expected} actual=${actual} diff=${diff}`;
  }
  return expected === actual ? null : `text mismatch expected=${expected} actual=${actual}`;
};

const parseCsv = (text) =>
  Papa.parse(String(text ?? "").replace(/^\uFEFF/, "").trimEnd(), {
    dynamicTyping: false,
    skipEmptyLines: false,
  }).data;

const compareCsv = (expectedText, actualText) => {
  const expected = parseCsv(expectedText);
  const actual = parseCsv(actualText);
  if (expected.length !== actual.length) {
    return [`row count expected=${expected.length} actual=${actual.length}`];
  }
  const failures = [];
  for (let row = 0; row < expected.length; row += 1) {
    const expectedRow = expected[row] ?? [];
    const actualRow = actual[row] ?? [];
    if (expectedRow.length !== actualRow.length) {
      failures.push(`row ${row + 1} column count expected=${expectedRow.length} actual=${actualRow.length}`);
      if (failures.length >= 5) return failures;
      continue;
    }
    for (let col = 0; col < expectedRow.length; col += 1) {
      const mismatch = compareCell(expectedRow[col], actualRow[col]);
      if (mismatch) {
        failures.push(`R${row + 1}C${col + 1}: ${mismatch}`);
        if (failures.length >= 5) return failures;
      }
    }
  }
  return failures;
};

const augmentProcessedFileForOriginExport = (file, filePath) => {
  const x = file?.x ?? {};
  const y = file?.y ?? {};
  return {
    ...file,
    originExportConfig: {
      endRow: Number(x.endRow) - 1,
      groupSize: Number(x.points),
      groups: Number(x.groups),
      startRow: Number(x.startRow) - 1,
      xCol: Number(x.col),
      xSegmentationMode: "points",
      yCols: Array.isArray(y.columns) ? y.columns.map((item) => Number(item)) : [],
    },
    originExportSourcePath: filePath,
  };
};

const buildColumns = (payload, file) => {
  const series = Array.isArray(file?.series) ? file.series : [];
  const entries = series
    .filter((item) => Number.isInteger(Number(item?.groupIndex)) && Number.isInteger(Number(item?.yCol)))
    .map((item) => ({ series: item, sourceIndex: 0 }));
  if (!entries.length || entries.length !== series.length) return null;

  const columns = [];
  const pushX = (entry) => {
    columns.push({
      groupIndex: Number(entry.series.groupIndex),
      kind: "x",
      sourceIndex: entry.sourceIndex,
    });
  };
  const pushY = (entry) => {
    columns.push({
      groupIndex: Number(entry.series.groupIndex),
      kind: "y",
      sourceIndex: entry.sourceIndex,
      yCol: Number(entry.series.yCol),
    });
  };

  if (payload.columnLayout === "shared-x") {
    pushX(entries[0]);
    entries.forEach(pushY);
  } else if (payload.columnLayout === "grouped-x") {
    const grouped = new Map();
    for (const entry of entries) {
      const xGroup = file?.xGroups?.[Number(entry.series.groupIndex)];
      const key = Array.isArray(xGroup) ? xGroup.map((value) => String(Number(value))).join(",") : "";
      const list = grouped.get(key) ?? [];
      list.push(entry);
      grouped.set(key, list);
    }
    for (const list of grouped.values()) {
      if (!list.length) continue;
      pushX(list[0]);
      list.forEach(pushY);
    }
  } else {
    for (const entry of entries) {
      pushX(entry);
      pushY(entry);
    }
  }
  return columns.length ? columns : null;
};

const buildRustExportRequest = ({ file, outputPath, payload }) => {
  if (!isRustOriginCsvEligiblePayload(payload)) return null;
  const columns = buildColumns(payload, file);
  if (!columns) return null;
  if (/__metrics\.csv$/i.test(String(payload?.csvName ?? ""))) {
    const metricKind = Array.isArray(payload?.xColumnLongNames) && payload.xColumnLongNames.length === 14
      ? "transfer"
      : "output";
    return {
      columns: [],
      command: "exportOriginCsv",
      config: file.originExportConfig,
      csvName: payload.csvName,
      fileId: file.fileId,
      fileName: file.fileName,
      id: 1,
      maxPoints: MAX_POINTS,
      metricKind,
      metricSeries: columns
        .filter((column) => column.kind === "y")
        .map((column, index) => ({
          groupIndex: column.groupIndex,
          label: String(payload?.curveLabels?.[index] ?? ""),
          sourceIndex: column.sourceIndex,
          yCol: column.yCol,
        })),
      outputPath,
      path: file.originExportSourcePath,
      sourceFile: {
        curveType: file.curveType ?? null,
        supportsSs: file.supportsSs ?? null,
        xAxisRole: file.xAxisRole ?? null,
        xLabel: file.xLabel ?? null,
      },
      sources: [
        {
          config: file.originExportConfig,
          fileId: file.fileId,
          fileName: file.fileName,
          maxPoints: MAX_POINTS,
          path: file.originExportSourcePath,
          xScaleFactor: 1,
          yScaleFactor: 1,
          yTransform: "none",
        },
      ],
    };
  }
  const yTransform = resolveRustOriginCsvYTransformForPayload(payload, "none");
  return {
    columns,
    command: "exportOriginCsv",
    config: file.originExportConfig,
    csvName: payload.csvName,
    fileId: file.fileId,
    fileName: file.fileName,
    id: 1,
    maxPoints: MAX_POINTS,
    outputPath,
    path: file.originExportSourcePath,
    sources: [
      {
        config: file.originExportConfig,
        fileId: file.fileId,
        fileName: file.fileName,
        maxPoints: MAX_POINTS,
        path: file.originExportSourcePath,
        xScaleFactor: 1,
        yScaleFactor: yTransform === "none" ? 1 : 1,
        yTransform,
      },
    ],
    xScaleFactor: 1,
    yScaleFactor: 1,
    yTransform,
  };
};

const buildProcessedFiles = (files, processResponses) => {
  const processed = [];
  const failed = [];
  for (const [index, response] of processResponses.entries()) {
    if (response?.ok && response?.result?.series?.length) {
      processed.push({
        file: augmentProcessedFileForOriginExport(response.result, files[index]),
        path: files[index],
      });
    } else {
      failed.push({
        file: files[index],
        message: response?.error?.message ?? response?.result?.message ?? "no series",
      });
    }
  }
  return { failed, processed };
};

const prepare = async (selectedRoot) => {
  const files = await walkFiles(selectedRoot);
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(FILES_PATH, `${JSON.stringify({ root: selectedRoot, files }, null, 2)}\n`, "utf8");
  console.log(`[rust-origin-export-compat] prepared files=${files.length} root=${selectedRoot}`);
};

const plan = async () => {
  const { files } = JSON.parse(await fs.readFile(FILES_PATH, "utf8"));
  const processResponses = await readJsonLines(PROCESS_RESULTS_PATH);
  const { failed: processFailures, processed } = buildProcessedFiles(files, processResponses);

  await fs.rm(RUST_CSV_DIR, { force: true, recursive: true });
  await fs.rm(EXPECTED_DIR, { force: true, recursive: true });
  await fs.mkdir(RUST_CSV_DIR, { recursive: true });
  await fs.mkdir(EXPECTED_DIR, { recursive: true });

  const manifest = [];
  const exportRequests = [];
  let skipped = 0;

  for (const [fileIndex, item] of processed.entries()) {
    const file = item.file;
    const planResult = buildOriginExportPlan(
      [file],
      undefined,
      "merged",
      () => "linear",
      () => 1,
      () => 1,
      (source) => String(source?.yUnit ?? "").trim(),
      undefined,
      undefined,
      (_source, y) => y,
      CONTENT_KEYS,
    );

    for (const [payloadIndex, payload] of planResult.payloads.entries()) {
      if (!isRustOriginCsvEligiblePayload(payload)) {
        skipped += 1;
        continue;
      }
      const outputPath = path.join(
        RUST_CSV_DIR,
        `${String(fileIndex).padStart(4, "0")}-${String(payloadIndex).padStart(2, "0")}-${sanitizeFilename(payload.csvName)}`,
      );
      const expectedPath = path.join(
        EXPECTED_DIR,
        `${String(fileIndex).padStart(4, "0")}-${String(payloadIndex).padStart(2, "0")}-${sanitizeFilename(payload.csvName)}`,
      );
      const request = buildRustExportRequest({ file, outputPath, payload });
      if (!request) {
        skipped += 1;
        continue;
      }
      manifest.push({
        csvName: payload.csvName,
        expectedPath,
        file: item.path,
        outputPath,
      });
      exportRequests.push(request);
      await fs.writeFile(expectedPath, payload.csvText, "utf8");
    }
  }

  await fs.writeFile(
    MANIFEST_PATH,
    `${JSON.stringify({ manifest, processFailures, processedFiles: processed.length, skipped }, null, 2)}\n`,
    "utf8",
  );
  await writeJsonLines(EXPORT_REQUESTS_PATH, exportRequests);
  console.log(`[rust-origin-export-compat] planned exportRequests=${exportRequests.length} skipped=${skipped} processFailed=${processFailures.length}`);
};

const compare = async () => {
  const { manifest, processFailures, processedFiles, skipped } = JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));
  const exportResponses = await readJsonLines(EXPORT_RESULTS_PATH);
  const failures = [];
  const byContent = {};
  let compared = 0;

  for (const [index, item] of manifest.entries()) {
    const response = exportResponses[index];
    if (!response?.ok) {
      failures.push({
        csvName: item.csvName,
        file: item.file,
        message: response?.error?.message ?? "Rust export failed",
      });
      continue;
    }
    const actualText = await fs.readFile(item.outputPath, "utf8");
    const expectedText = await fs.readFile(item.expectedPath, "utf8");
    const mismatches = compareCsv(expectedText, actualText);
    if (mismatches.length) {
      failures.push({
        csvName: item.csvName,
        file: item.file,
        mismatches,
      });
      continue;
    }
    compared += 1;
    const key = resolveRustOriginCsvYTransformForPayload({ yTransform: "none" }, "none");
    byContent[key] = (byContent[key] ?? 0) + 1;
  }

  const report = {
    byContent,
    compared,
    durationMs: 0,
    failures: failures.slice(0, 50),
    manifestCount: manifest.length,
    processFailureCount: processFailures.length,
    processFailures: processFailures.slice(0, 50),
    processedFiles,
    root: DEFAULT_ROOT,
    skipped,
    status: failures.length ? "failed" : "passed",
  };
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`[rust-origin-export-compat] compared=${compared} skipped=${skipped} processFailed=${processFailures.length}`);
  console.log(`[rust-origin-export-compat] report=${REPORT_PATH}`);
  if (failures.length) {
    console.error(`[rust-origin-export-compat] failed=${failures.length}`);
    for (const failure of failures.slice(0, 10)) {
      console.error(`- ${failure.file} :: ${failure.csvName} :: ${(failure.mismatches ?? [failure.message]).join(" | ")}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`[rust-origin-export-compat] all ${compared} exports matched`);
  }
};

const command = process.argv[2] ?? "prepare";
if (command === "prepare") {
  await prepare(process.argv[3] ?? DEFAULT_ROOT);
} else if (command === "plan") {
  await plan();
} else if (command === "compare") {
  await compare();
} else {
  throw new Error(`unknown command: ${command}`);
}
