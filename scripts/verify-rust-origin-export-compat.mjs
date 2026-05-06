#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import Papa from "papaparse";
import {
  buildDeviceAnalysisOriginExportPlan,
  isRustOriginCsvEligiblePayload,
  resolveRustOriginCsvYTransformForPayload,
} from "../src/features/device-analysis/analysis/lib/originSelectionExport.ts";

const ROOT = process.cwd();
const DEFAULT_ROOT = "C:/Users/lanxi/Desktop/293K";
const OUTPUT_DIR = path.join(ROOT, ".tooling", "rust-origin-export-compat");
const RUST_CSV_DIR = path.join(OUTPUT_DIR, "rust-csv");
const REPORT_PATH = path.join(OUTPUT_DIR, "report.json");
const CRATE_DIR = path.join(ROOT, "tools", "conductor-engine");
const ENGINE_CANDIDATES = [
  path.join(ROOT, "excel", "bin", "conductor-engine.exe"),
  path.join(CRATE_DIR, "target", "release", "conductor-engine.exe"),
  path.join(ROOT, "excel", "bin", "rust-xls-converter.exe"),
];
const SUPPORTED_EXTENSIONS = new Set([".csv", ".xls", ".xlsx"]);
const CONTENT_KEYS = ["iv", "metrics", "gm", "gds", "ss", "vth"];
const MAX_POINTS = 600;
const ABS_TOLERANCE = 1e-12;
const REL_TOLERANCE = 1e-9;

const now = () => performance.now();

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

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    encoding: "utf8",
    input: options.input,
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 512,
    windowsHide: true,
  });
  if (result.error) {
    throw result.error;
  }
  if ((result.status ?? 1) !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${command} ${args.join(" ")} failed${detail ? `:\n${detail}` : ""}`);
  }
  return result.stdout;
};

const fileExists = async (filePath) => {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
};

let engineExe = "";

const resolveEngineExe = async () => {
  for (const candidate of ENGINE_CANDIDATES) {
    if (await fileExists(candidate)) return candidate;
  }
  return "";
};

const ensureEngine = async () => {
  try {
    run("cargo", ["build", "--quiet", "--release"], { cwd: CRATE_DIR });
  } catch (error) {
    engineExe = await resolveEngineExe();
    if (engineExe) {
      console.warn(
        `[rust-origin-export-compat] cargo build skipped, using existing engine: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    throw error;
  }
  engineExe = await resolveEngineExe();
  if (!engineExe) {
    throw new Error(`Rust engine executable not found. Checked: ${ENGINE_CANDIDATES.join(", ")}`);
  }
};

const sendEngineRequests = (requests) => {
  if (!requests.length) return [];
  const input = `${requests.map((request) => JSON.stringify(request)).join("\n")}\n`;
  return run(engineExe, ["--stdio-engine"], { input })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
};

const processFiles = (files) => {
  const requests = files.map((filePath, index) => ({
    command: "processFileAuto",
    fileId: `origin-export-${index}`,
    fileName: path.basename(filePath),
    id: index + 1,
    maxPoints: MAX_POINTS,
    path: filePath,
  }));
  const responses = sendEngineRequests(requests);
  const processed = [];
  const failed = [];
  for (const [index, response] of responses.entries()) {
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

const augmentProcessedFileForOriginExport = (file, filePath) => {
  const x = file?.x ?? {};
  const y = file?.y ?? {};
  const xCol = Number(x.col);
  const startRow = Number(x.startRow) - 1;
  const endRow = Number(x.endRow) - 1;
  const groupSize = Number(x.points);
  const groups = Number(x.groups);
  const yCols = Array.isArray(y.columns) ? y.columns.map((item) => Number(item)) : [];
  return {
    ...file,
    originExportConfig: {
      endRow,
      groupSize,
      groups,
      startRow,
      xCol,
      xSegmentationMode: "points",
      yCols,
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

const parseCsv = (text) =>
  Papa.parse(String(text ?? "").replace(/^\uFEFF/, "").trimEnd(), {
    dynamicTyping: false,
    skipEmptyLines: false,
  }).data;

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

const verify = async (rootArg) => {
  const selectedRoot = rootArg || DEFAULT_ROOT;
  const startedAt = now();
  await fs.rm(OUTPUT_DIR, { force: true, recursive: true });
  await fs.mkdir(RUST_CSV_DIR, { recursive: true });
  await ensureEngine();

  const files = await walkFiles(selectedRoot);
  console.log(`[rust-origin-export-compat] files=${files.length} root=${selectedRoot}`);
  const { failed: processFailures, processed } = processFiles(files);

  let compared = 0;
  let skipped = 0;
  const failures = [];
  const byContent = {};

  for (const [fileIndex, item] of processed.entries()) {
    const file = item.file;
    const plan = buildDeviceAnalysisOriginExportPlan(
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

    for (const [payloadIndex, payload] of plan.payloads.entries()) {
      if (!isRustOriginCsvEligiblePayload(payload)) {
        skipped += 1;
        continue;
      }
      const outputPath = path.join(
        RUST_CSV_DIR,
        `${String(fileIndex).padStart(4, "0")}-${String(payloadIndex).padStart(2, "0")}-${sanitizeFilename(payload.csvName)}`,
      );
      const request = buildRustExportRequest({ file, outputPath, payload });
      if (!request) {
        skipped += 1;
        continue;
      }
      const [response] = sendEngineRequests([request]);
      if (!response?.ok) {
        failures.push({
          csvName: payload.csvName,
          file: item.path,
          message: response?.error?.message ?? "Rust export failed",
        });
        continue;
      }
      const actualText = await fs.readFile(outputPath, "utf8");
      const mismatches = compareCsv(payload.csvText, actualText);
      if (mismatches.length) {
        failures.push({
          csvName: payload.csvName,
          file: item.path,
          mismatches,
        });
        continue;
      }
      compared += 1;
      const key = resolveRustOriginCsvYTransformForPayload(payload, "none");
      byContent[key] = (byContent[key] ?? 0) + 1;
    }

    if ((fileIndex + 1) % 25 === 0) {
      console.log(`[rust-origin-export-compat] checked files=${fileIndex + 1}/${processed.length} payloads=${compared}`);
    }
  }

  const report = {
    byContent,
    compared,
    durationMs: Math.round(now() - startedAt),
    failures: failures.slice(0, 50),
    processedFiles: processed.length,
    processFailures: processFailures.slice(0, 50),
    processFailureCount: processFailures.length,
    root: selectedRoot,
    skipped,
    status: failures.length ? "failed" : "passed",
    totalFiles: files.length,
  };
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    `[rust-origin-export-compat] compared=${compared} skipped=${skipped} processFailed=${processFailures.length} duration=${report.durationMs}ms`,
  );
  console.log(`[rust-origin-export-compat] byContent=${JSON.stringify(byContent)} report=${REPORT_PATH}`);
  if (failures.length) {
    console.error(`[rust-origin-export-compat] failed=${failures.length}`);
    for (const failure of failures.slice(0, 10)) {
      console.error(`- ${failure.file} :: ${failure.csvName} :: ${(failure.mismatches ?? [failure.message]).join(" | ")}`);
    }
    process.exitCode = 1;
  }
};

await verify(process.argv[2]);
