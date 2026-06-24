import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import {
  computeBaseCurrentMetrics,
  isTransferLikeFile,
} from "../src/cs/workbench/services/calculation/common/ionIoff.ts";
import {
  computeCentralDerivative,
} from "../src/cs/workbench/services/calculation/common/gm.ts";
import {
  computeSubthresholdSwing,
  computeSubthresholdSwingFitAuto,
} from "../src/cs/workbench/services/calculation/common/ss.ts";

const ROOT = process.cwd();
const PHASE3_DIR = path.join(ROOT, ".build", "bench", "device-analysis-phase3");
const PHASE3_RESULTS_PATH = path.join(PHASE3_DIR, "rust-results.jsonl");
const OUTPUT_DIR = path.join(ROOT, ".build", "verify", "rust-ss-auto");
const REQUESTS_PATH = path.join(OUTPUT_DIR, "requests.jsonl");
const BASELINE_PATH = path.join(OUTPUT_DIR, "ts-baseline.json");
const RUST_RESULTS_PATH = path.join(OUTPUT_DIR, "rust-results.jsonl");
const REPORT_PATH = path.join(OUTPUT_DIR, "report.json");

const now = () => performance.now();
const formatMs = (value) => `${Math.round(value)}ms`;
const safeArray = (value) => (Array.isArray(value) ? value : []);
const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

const buildPoints = (xArr, yArr) => {
  const xValues = Array.isArray(xArr) ? xArr : [];
  const yValues = Array.isArray(yArr) ? yArr : [];
  const count = Math.min(xValues.length, yValues.length);
  const points = [];
  for (let index = 0; index < count; index += 1) {
    const x = Number(xValues[index]);
    const y = Number(yValues[index]);
    points.push({
      x: Number.isFinite(x) ? x : null,
      y: Number.isFinite(y) ? y : null,
    });
  }
  return points;
};

const readJsonLines = async (filePath) => {
  const text = await fs.readFile(filePath, "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
};

const finitePairs = (xArr, yArr) =>
  buildPoints(xArr, yArr)
    .filter((point) => isFiniteNumber(point.x) && isFiniteNumber(point.y))
    .map((point) => ({
      x: point.x,
      y: point.y,
      yAbsPositive: Math.abs(point.y) > 0 ? Math.abs(point.y) : null,
      yPositive: point.y > 0 ? point.y : null,
    }));

const makeSeriesKey = (fileId, seriesId) => `${fileId}::${seriesId}`;

const prepare = async () => {
  await fs.rm(OUTPUT_DIR, { force: true, recursive: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  let entries;
  try {
    entries = await readJsonLines(PHASE3_RESULTS_PATH);
  } catch (error) {
    throw new Error(
      `Phase 3 processed results are required before SS AB verification: ${PHASE3_RESULTS_PATH}. Run npm run bench:phase3 first. ${error.message}`,
    );
  }

  const baseline = [];
  const requests = [];
  const startedAt = now();
  let requestId = 0;

  for (const entry of entries) {
    if (!entry?.ok || !entry?.result) continue;
    const file = entry.result;
    if (!isTransferLikeFile(file)) continue;
    const xGroups = safeArray(file.xGroups);
    const rustSeries = [];
    for (const item of safeArray(file.series)) {
      if (!item?.id) continue;
      const points = finitePairs(xGroups[item.groupIndex], item.y);
      if (points.length < 3) continue;

      const id = makeSeriesKey(file.fileId ?? `response-${entry.id}`, item.id);
      baseline.push({
        fileId: file.fileId ?? null,
        fileName: file.fileName ?? null,
        id,
        pointCount: points.length,
        seriesId: item.id,
        baseCurrent: computeBaseCurrentMetrics({
          points,
          sourceFile: file,
        }),
        gm: computeCentralDerivative(points),
        ss: computeSubthresholdSwing(points),
        ssFitAuto: computeSubthresholdSwingFitAuto(points),
      });
      rustSeries.push({
        id,
        x: points.map((point) => point.x),
        y: points.map((point) => point.y),
      });
    }
    if (rustSeries.length) {
      requestId += 1;
      requests.push(JSON.stringify({
        command: "analyzeSeriesBatch",
        fileId: file.fileId ?? `phase3-ss-auto-ab-${requestId}`,
        id: requestId,
        series: rustSeries,
        sourceFile: {
          curveType: file.curveType ?? null,
          supportsSs: file.supportsSs ?? null,
          xAxisRole: file.xAxisRole ?? null,
          xLabel: file.xLabel ?? null,
        },
      }));
    }
  }

  await fs.writeFile(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
  await fs.writeFile(REQUESTS_PATH, `${requests.join("\n")}\n`, "utf8");
  console.log(
    `[rust-ss-auto-compat] prepared series=${baseline.length} tsBaselineMs=${formatMs(now() - startedAt)}`,
  );
};

const getPath = (value, pathParts) => {
  let current = value;
  for (const part of pathParts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
};

const numericClose = (a, b) => {
  if (a == null && b == null) return true;
  if (!isFiniteNumber(a) || !isFiniteNumber(b)) return false;
  const abs = Math.abs(a - b);
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return abs <= 1e-8 || abs / scale <= 1e-8;
};

const compareFit = (expected, actual, prefix) => {
  const failures = [];
  for (const key of ["ok", "reason", "n"]) {
    if (expected?.[key] !== actual?.[key]) {
      failures.push({
        path: `${prefix}.${key}`,
        rust: actual?.[key],
        ts: expected?.[key],
      });
    }
  }

  for (const key of ["ss", "x1", "x2", "a", "b", "r2", "decadeSpan"]) {
    if (!numericClose(expected?.[key], actual?.[key])) {
      failures.push({
        path: `${prefix}.${key}`,
        rust: actual?.[key],
        ts: expected?.[key],
      });
    }
  }

  for (const pathParts of [
    ["detail", "yFloor"],
    ["detail", "floorMarginDec"],
    ["detail", "stab"],
    ["detail", "score"],
    ["detail", "bestAttempt", "x1"],
    ["detail", "bestAttempt", "x2"],
    ["detail", "bestAttempt", "r2"],
    ["detail", "bestAttempt", "decadeSpan"],
    ["detail", "bestAttempt", "n"],
    ["detail", "bestAttempt", "yFloor"],
    ["detail", "bestAttempt", "floorMarginDec"],
    ["detail", "bestAttempt", "stab"],
  ]) {
    const expectedValue = getPath(expected, pathParts);
    const actualValue = getPath(actual, pathParts);
    if (expectedValue == null && actualValue == null) continue;
    const same = typeof expectedValue === "number" || typeof actualValue === "number"
      ? numericClose(expectedValue, actualValue)
      : expectedValue === actualValue;
    if (!same) {
      failures.push({
        path: `${prefix}.${pathParts.join(".")}`,
        rust: actualValue,
        ts: expectedValue,
      });
    }
  }

  return failures;
};

const comparePointArray = (expected, actual, prefix) => {
  const failures = [];
  if (!Array.isArray(expected) || !Array.isArray(actual)) {
    return [{
      path: prefix,
      rust: Array.isArray(actual) ? "array" : typeof actual,
      ts: Array.isArray(expected) ? "array" : typeof expected,
    }];
  }
  if (expected.length !== actual.length) {
    failures.push({
      path: `${prefix}.length`,
      rust: actual.length,
      ts: expected.length,
    });
  }
  const n = Math.min(expected.length, actual.length);
  for (let index = 0; index < n; index += 1) {
    for (const key of ["x", "y", "yPositive", "yAbsPositive"]) {
      if (!numericClose(expected[index]?.[key], actual[index]?.[key])) {
        failures.push({
          path: `${prefix}[${index}].${key}`,
          rust: actual[index]?.[key],
          ts: expected[index]?.[key],
        });
        if (failures.length >= 20) return failures;
      }
    }
  }
  return failures;
};

const compareWindow = (expected, actual, prefix) => {
  const failures = [];
  if (expected == null || actual == null) {
    if (expected !== actual) failures.push({ path: prefix, rust: actual, ts: expected });
    return failures;
  }
  for (const key of ["key", "label", "pointCount"]) {
    if (expected?.[key] !== actual?.[key]) {
      failures.push({ path: `${prefix}.${key}`, rust: actual?.[key], ts: expected?.[key] });
    }
  }
  for (const key of ["current", "targetX", "x", "x1", "x2"]) {
    if (!numericClose(expected?.[key], actual?.[key])) {
      failures.push({ path: `${prefix}.${key}`, rust: actual?.[key], ts: expected?.[key] });
    }
  }
  return failures;
};

const compareBaseCurrent = (expected, actual) => {
  const failures = [];
  for (const key of ["method"]) {
    if (expected?.[key] !== actual?.[key]) {
      failures.push({ path: `baseCurrent.${key}`, rust: actual?.[key], ts: expected?.[key] });
    }
  }
  for (const key of ["ion", "ioff", "ionIoff", "xAtIon", "xAtIoff"]) {
    if (!numericClose(expected?.[key], actual?.[key])) {
      failures.push({ path: `baseCurrent.${key}`, rust: actual?.[key], ts: expected?.[key] });
    }
  }
  failures.push(...compareWindow(expected?.ionWindow, actual?.ionWindow, "baseCurrent.ionWindow"));
  failures.push(...compareWindow(expected?.ioffWindow, actual?.ioffWindow, "baseCurrent.ioffWindow"));
  const expectedWindows = safeArray(expected?.candidateWindows);
  const actualWindows = safeArray(actual?.candidateWindows);
  if (expectedWindows.length !== actualWindows.length) {
    failures.push({
      path: "baseCurrent.candidateWindows.length",
      rust: actualWindows.length,
      ts: expectedWindows.length,
    });
  }
  const n = Math.min(expectedWindows.length, actualWindows.length);
  for (let index = 0; index < n; index += 1) {
    failures.push(
      ...compareWindow(
        expectedWindows[index],
        actualWindows[index],
        `baseCurrent.candidateWindows[${index}]`,
      ),
    );
    if (failures.length >= 20) break;
  }
  return failures;
};

const compare = async () => {
  const baseline = JSON.parse(await fs.readFile(BASELINE_PATH, "utf8"));
  const responses = await readJsonLines(RUST_RESULTS_PATH);
  const rustById = {};
  for (const response of responses) {
    if (!response?.ok || !response?.result?.series) continue;
    Object.assign(rustById, response.result.series);
  }
  const failures = [];

  for (const expected of baseline) {
    const actual = rustById[expected.id]?.ssFitAuto;
    if (!actual) {
      failures.push({
        fileName: expected.fileName,
        id: expected.id,
        reason: "missing Rust result",
      });
      continue;
    }
    const fitFailures = [
      ...compareBaseCurrent(expected.baseCurrent, rustById[expected.id]?.baseCurrent),
      ...comparePointArray(expected.gm, rustById[expected.id]?.gm, "gm"),
      ...comparePointArray(expected.ss, rustById[expected.id]?.ss, "ss"),
      ...compareFit(expected.ssFitAuto.strict, actual.strict, "strict"),
      ...compareFit(expected.ssFitAuto.suggested, actual.suggested, "suggested"),
    ];
    if (fitFailures.length) {
      failures.push({
        fileName: expected.fileName,
        id: expected.id,
        pointCount: expected.pointCount,
        seriesId: expected.seriesId,
        differences: fitFailures.slice(0, 20),
      });
    }
  }

  const report = {
    checked: baseline.length,
    failures: failures.slice(0, 40),
    failed: failures.length,
    passed: baseline.length - failures.length,
  };
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  if (failures.length) {
    console.error(`[rust-ss-auto-compat] failed ${failures.length}/${baseline.length}`);
    console.error(JSON.stringify(report.failures.slice(0, 5), null, 2));
    process.exitCode = 1;
  } else {
    console.log(`[rust-ss-auto-compat] all ${baseline.length} series matched`);
  }
};

const mode = process.argv[2] || "prepare";
if (mode === "prepare") {
  await prepare();
} else if (mode === "compare") {
  await compare();
} else {
  console.error("Usage: node --experimental-strip-types scripts/verify-rust-ss-auto-compat.mjs <prepare|compare>");
  process.exitCode = 2;
}
