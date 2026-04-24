import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { computeSubthresholdSwingFitAuto } from "../src/features/device-analysis/analysis/lib/analysisMath.ts";
import { buildPoints } from "../src/features/device-analysis/analysis/lib/analysisChartsUtils.ts";

const ROOT = process.cwd();
const PHASE3_DIR = path.join(ROOT, ".tooling", "device-analysis-phase3-bench");
const PHASE3_RESULTS_PATH = path.join(PHASE3_DIR, "rust-results.jsonl");
const OUTPUT_DIR = path.join(ROOT, ".tooling", "rust-ss-auto-compat");
const REQUESTS_PATH = path.join(OUTPUT_DIR, "requests.jsonl");
const BASELINE_PATH = path.join(OUTPUT_DIR, "ts-baseline.json");
const RUST_RESULTS_PATH = path.join(OUTPUT_DIR, "rust-results.jsonl");
const REPORT_PATH = path.join(OUTPUT_DIR, "report.json");

const now = () => performance.now();
const formatMs = (value) => `${Math.round(value)}ms`;
const safeArray = (value) => (Array.isArray(value) ? value : []);
const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

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
  const rustSeries = [];
  const startedAt = now();

  for (const entry of entries) {
    if (!entry?.ok || !entry?.result) continue;
    const file = entry.result;
    const xGroups = safeArray(file.xGroups);
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
        ssFitAuto: computeSubthresholdSwingFitAuto(points),
      });
      rustSeries.push({
        id,
        x: points.map((point) => point.x),
        y: points.map((point) => point.y),
      });
    }
  }

  const request = {
    command: "analyzeSeriesBatch",
    fileId: "phase3-ss-auto-ab",
    id: 1,
    series: rustSeries,
  };

  await fs.writeFile(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
  await fs.writeFile(REQUESTS_PATH, `${JSON.stringify(request)}\n`, "utf8");
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

const compare = async () => {
  const baseline = JSON.parse(await fs.readFile(BASELINE_PATH, "utf8"));
  const responses = await readJsonLines(RUST_RESULTS_PATH);
  const response = responses.find((item) => item?.id === 1);
  const rustById = response?.ok && response?.result?.series
    ? response.result.series
    : {};
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
