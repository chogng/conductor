import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import {
  computeBaseCurrentMetrics,
  computeCentralDerivative,
  computeSubthresholdSwing,
  computeSubthresholdSwingFitAuto,
  isTransferLikeFile,
} from "../src/cs/workbench/contrib/calculation/common/firstCalculation.ts";
import {
  buildPoints,
  downsamplePointsForDisplay,
} from "../src/cs/workbench/contrib/plot/browser/plotViewModel.ts";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, ".build", "bench", "device-analysis-phase3");
const REQUESTS_PATH = path.join(OUTPUT_DIR, "requests.jsonl");
const RUST_RESULTS_PATH = path.join(OUTPUT_DIR, "rust-results.jsonl");
const REQUESTS_PATH = path.join(OUTPUT_DIR, "analysis-requests.jsonl");
const RUST_ANALYSIS_RESULTS_PATH = path.join(OUTPUT_DIR, "rust-analysis-results.jsonl");
const PROCESS_TIMING_PATH = path.join(OUTPUT_DIR, "rust-process-timing.json");
const TIMING_PATH = path.join(OUTPUT_DIR, "rust-analysis-timing.json");
const REPORT_PATH = path.join(OUTPUT_DIR, "report.json");
const SUPPORTED_EXTENSIONS = new Set([".csv", ".xls", ".xlsx"]);
const DEFAULT_RENDER_POINT_BUDGET = 12000;
const GM_RENDER_POINT_BUDGET = 9000;
const MAX_RENDER_SERIES_POINTS = 600;
const MIN_RENDER_SERIES_POINTS = 120;

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

const safeArray = (value) => (Array.isArray(value) ? value : []);

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

const measure = (totals, key, fn) => {
  const startedAt = now();
  const result = fn();
  totals[key] += now() - startedAt;
  return result;
};

const readJsonLines = async (filePath) => {
  const text = await fs.readFile(filePath, "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
};

const readJsonIfExists = async (filePath) => {
  try {
    return JSON.parse((await fs.readFile(filePath, "utf8")).replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
};

const collectProcessedEntries = async () => {
  const entries = await readJsonLines(RUST_RESULTS_PATH);
  const successes = [];
  const failures = [];
  for (const entry of entries) {
    if (entry?.ok && entry?.result?.series?.length) {
      successes.push(entry.result);
    } else {
      failures.push({
        id: entry?.id ?? null,
        message: entry?.error?.message ?? entry?.result?.message ?? "no series",
      });
    }
  }
  return { entries, failures, successes };
};

const buildRenderSeries = ({ pointsBySeriesId, series, type }) => {
  const budget = type === "gm" ? GM_RENDER_POINT_BUDGET : DEFAULT_RENDER_POINT_BUDGET;
  const seriesCount = Math.max(1, series.length);
  const maxPointsPerSeries = Math.max(
    MIN_RENDER_SERIES_POINTS,
    Math.min(MAX_RENDER_SERIES_POINTS, Math.floor(budget / seriesCount)),
  );
  let inputPointCount = 0;
  let outputPointCount = 0;
  for (const item of series) {
    const data = pointsBySeriesId.get(item?.id) ?? [];
    inputPointCount += data.length;
    outputPointCount += downsamplePointsForDisplay(data, maxPointsPerSeries).length;
  }
  return {
    inputPointCount,
    maxPointsPerSeries,
    outputPointCount,
  };
};

const summarizeProcessedFile = (file) => {
  const series = safeArray(file?.series);
  const xGroups = safeArray(file?.xGroups);
  return {
    fileId: file?.fileId ?? null,
    fileName: file?.fileName ?? null,
    groups: xGroups.length,
    sampledPoints: Number(file?.x?.sampledPoints) || null,
    seriesCount: series.length,
  };
};

const analyzeProcessedFile = (file) => {
  const stageMs = {
    baseCurrent: 0,
    gm: 0,
    gmRender: 0,
    ivRender: 0,
    overviewCanvas: 0,
    points: 0,
    ss: 0,
    ssAuto: 0,
  };
  const series = safeArray(file?.series);
  const xGroups = safeArray(file?.xGroups);
  const pointsBySeriesId = new Map();
  const gmBySeriesId = new Map();
  const supportsSs = isTransferLikeFile(file);
  let sourcePointCount = 0;

  measure(stageMs, "points", () => {
    for (const item of series) {
      if (!item?.id) continue;
      const xArr = xGroups[item.groupIndex];
      const points = buildPoints(xArr, item.y);
      sourcePointCount += points.length;
      pointsBySeriesId.set(item.id, points);
    }
  });

  measure(stageMs, "gm", () => {
    for (const item of series) {
      if (!item?.id) continue;
      gmBySeriesId.set(item.id, computeCentralDerivative(pointsBySeriesId.get(item.id) ?? []));
    }
  });

  if (supportsSs) {
    measure(stageMs, "ss", () => {
      for (const item of series) {
        if (!item?.id) continue;
        computeSubthresholdSwing(pointsBySeriesId.get(item.id) ?? []);
      }
    });

    measure(stageMs, "ssAuto", () => {
      for (const item of series) {
        if (!item?.id) continue;
        computeSubthresholdSwingFitAuto(pointsBySeriesId.get(item.id) ?? []);
      }
    });
  }

  measure(stageMs, "baseCurrent", () => {
    for (const item of series) {
      if (!item?.id) continue;
      computeBaseCurrentMetrics({
        points: pointsBySeriesId.get(item.id) ?? [],
        sourceFile: file,
      });
    }
  });

  const ivRender = measure(stageMs, "ivRender", () =>
    buildRenderSeries({
      pointsBySeriesId,
      series,
      type: "iv",
    }),
  );
  const gmRender = measure(stageMs, "gmRender", () =>
    buildRenderSeries({
      pointsBySeriesId: gmBySeriesId,
      series,
      type: "gm",
    }),
  );

  let overviewPointCount = 0;
  measure(stageMs, "overviewCanvas", () => {
    for (const item of series) {
      const xArr = xGroups[item?.groupIndex];
      const yArr = item?.y;
      overviewPointCount += Math.min(Number(xArr?.length) || 0, Number(yArr?.length) || 0);
    }
  });

  const totalAnalysisMs =
    stageMs.points +
    stageMs.gm +
    stageMs.ss +
    stageMs.ssAuto +
    stageMs.baseCurrent;
  const totalRenderPrepMs = stageMs.ivRender + stageMs.gmRender + stageMs.overviewCanvas;

  return {
    ...summarizeProcessedFile(file),
    curveType: file?.curveType ?? null,
    sourcePointCount,
    overviewPointCount,
    render: {
      gm: gmRender,
      iv: ivRender,
    },
    stageMs,
    totalAnalysisMs,
    totalMs: totalAnalysisMs + totalRenderPrepMs,
    totalRenderPrepMs,
  };
};

const prepare = async (rootArg) => {
  const selectedRoot = rootArg || process.env.CONDUCTOR_BENCH_ROOT;
  if (!selectedRoot) {
    throw new Error(
      "Usage: node scripts/bench-device-analysis-phase3.mjs prepare <data-root> or set CONDUCTOR_BENCH_ROOT.",
    );
  }
  await fs.rm(OUTPUT_DIR, { force: true, recursive: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const files = await walkFiles(selectedRoot);
  const requests = files.map((filePath, index) =>
    JSON.stringify({
      command: "processFileAuto",
      fileId: `phase3-${index}`,
      fileName: path.basename(filePath),
      id: index + 1,
      maxPoints: 600,
      path: filePath,
    }),
  );
  await fs.writeFile(REQUESTS_PATH, `${requests.join("\n")}\n`, "utf8");
  await fs.writeFile(
    path.join(OUTPUT_DIR, "files.json"),
    `${JSON.stringify(files, null, 2)}\n`,
    "utf8",
  );
  console.log(`[phase3-bench] prepared files=${files.length} root=${selectedRoot}`);
};

const buildRustAnalysisSeries = (file) => {
  const xGroups = safeArray(file?.xGroups);
  const out = [];
  for (const item of safeArray(file?.series)) {
    if (!item?.id) continue;
    const points = buildPoints(xGroups[item.groupIndex], item.y);
    const x = [];
    const y = [];
    for (const point of points) {
      if (!isFiniteNumber(point.x) || !isFiniteNumber(point.y)) continue;
      x.push(point.x);
      y.push(point.y);
    }
    if (x.length >= 3) out.push({ id: item.id, x, y });
  }
  return out;
};

const prepareRustAnalysis = async () => {
  const { successes } = await collectProcessedEntries();
  const requests = [];
  let seriesCount = 0;
  for (const [index, file] of successes.entries()) {
    const series = buildRustAnalysisSeries(file);
    if (!series.length) continue;
    seriesCount += series.length;
    requests.push(
      JSON.stringify({
        command: "analyzeSeriesBatch",
        fileId: file.fileId ?? `phase3-analysis-${index}`,
        id: index + 1,
        series,
        sourceFile: {
          curveType: file.curveType ?? null,
          supportsSs: file.supportsSs ?? null,
          xAxisRole: file.xAxisRole ?? null,
          xLabel: file.xLabel ?? null,
        },
      }),
    );
  }
  await fs.writeFile(REQUESTS_PATH, `${requests.join("\n")}\n`, "utf8");
  console.log(
    `[phase3-bench] prepared rust analysis requests files=${requests.length} series=${seriesCount}`,
  );
};

const summarizeRustAnalysisResults = async () => {
  let responses = [];
  try {
    responses = await readJsonLines(RUST_ANALYSIS_RESULTS_PATH);
  } catch {
    return null;
  }

  let failedCount = 0;
  let files = 0;
  let seriesCount = 0;
  const failures = [];
  for (const response of responses) {
    if (!response?.ok) {
      failedCount += 1;
      failures.push({
        id: response?.id ?? null,
        message: response?.error?.message ?? "Rust analysis failed",
      });
      continue;
    }
    files += 1;
    const resultSeries = response?.result?.series;
    if (resultSeries && typeof resultSeries === "object") {
      seriesCount += Object.keys(resultSeries).length;
    }
  }

  return {
    failedCount,
    failures: failures.slice(0, 20),
    files,
    seriesCount,
    timing: await readJsonIfExists(TIMING_PATH),
  };
};

const analyze = async () => {
  const startedAt = now();
  const { failures, successes } = await collectProcessedEntries();

  const startRss = process.memoryUsage().rss;
  const results = successes.map(analyzeProcessedFile);
  const endRss = process.memoryUsage().rss;
  const rustAnalysis = await summarizeRustAnalysisResults();
  const processTiming = await readJsonIfExists(PROCESS_TIMING_PATH);

  const totals = results.reduce(
    (acc, result) => {
      acc.files += 1;
      acc.groups += result.groups;
      acc.overviewPointCount += result.overviewPointCount;
      acc.seriesCount += result.seriesCount;
      acc.sourcePointCount += result.sourcePointCount;
      acc.totalAnalysisMs += result.totalAnalysisMs;
      acc.totalMs += result.totalMs;
      acc.totalRenderPrepMs += result.totalRenderPrepMs;
      for (const key of Object.keys(acc.stageMs)) {
        acc.stageMs[key] += result.stageMs[key] ?? 0;
      }
      return acc;
    },
    {
      files: 0,
      groups: 0,
      overviewPointCount: 0,
      seriesCount: 0,
      sourcePointCount: 0,
      stageMs: {
        baseCurrent: 0,
        gm: 0,
        gmRender: 0,
        ivRender: 0,
        overviewCanvas: 0,
        points: 0,
        ss: 0,
        ssAuto: 0,
      },
      totalAnalysisMs: 0,
      totalMs: 0,
      totalRenderPrepMs: 0,
    },
  );

  const report = {
    failedCount: failures.length,
    failures: failures.slice(0, 40),
    processedCount: successes.length,
    processTiming,
    rssDeltaBytes: endRss - startRss,
    rustAnalysis,
    slowestAnalysis: [...results].sort((a, b) => b.totalAnalysisMs - a.totalAnalysisMs).slice(0, 15),
    slowestTotal: [...results].sort((a, b) => b.totalMs - a.totalMs).slice(0, 15),
    suiteMs: now() - startedAt,
    totals,
  };
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("\n[phase3-bench summary]");
  console.log(`processed=${report.processedCount} failed=${report.failedCount}`);
  console.log(
    `series=${totals.seriesCount.toLocaleString()} groups=${totals.groups.toLocaleString()} points=${totals.sourcePointCount.toLocaleString()}`,
  );
  console.log(
    `analysis=${formatMs(totals.totalAnalysisMs)} renderPrep=${formatMs(totals.totalRenderPrepMs)} total=${formatMs(totals.totalMs)}`,
  );
  console.log(
    `points=${formatMs(totals.stageMs.points)} gm=${formatMs(totals.stageMs.gm)} ss=${formatMs(totals.stageMs.ss)} ssAuto=${formatMs(totals.stageMs.ssAuto)} baseCurrent=${formatMs(totals.stageMs.baseCurrent)}`,
  );
  if (rustAnalysis?.timing?.durationMs) {
    const replacedTsMs =
      totals.stageMs.gm +
      totals.stageMs.ss +
      totals.stageMs.ssAuto +
      totals.stageMs.baseCurrent;
    const projectedAnalysisMs =
      totals.totalAnalysisMs - replacedTsMs + rustAnalysis.timing.durationMs;
    const savedMs = replacedTsMs - rustAnalysis.timing.durationMs;
    console.log(
      `rustAnalysis=${formatMs(rustAnalysis.timing.durationMs)} projectedAnalysis=${formatMs(projectedAnalysisMs)} saved=${formatMs(savedMs)}`,
    );
  }
  console.log(
    `ivRender=${formatMs(totals.stageMs.ivRender)} gmRender=${formatMs(totals.stageMs.gmRender)} overviewCanvas=${formatMs(totals.stageMs.overviewCanvas)}`,
  );
  console.log(`rssDelta=${formatBytes(report.rssDeltaBytes)} report=${REPORT_PATH}`);

  console.log("\n[phase3-bench slowest analysis]");
  for (const result of report.slowestAnalysis.slice(0, 10)) {
    console.log(
      `${formatMs(result.totalAnalysisMs).padStart(6)} series=${String(result.seriesCount).padStart(3)} points=${String(result.sourcePointCount).padStart(6)} ssAuto=${formatMs(result.stageMs.ssAuto).padStart(6)} ${result.fileName}`,
    );
  }
};

const mode = process.argv[2] || "prepare";
if (mode === "prepare") {
  await prepare(process.argv[3]);
} else if (mode === "prepare-rust-analysis") {
  await prepareRustAnalysis();
} else if (mode === "analyze") {
  await analyze();
} else {
  console.error("Usage: node --experimental-strip-types scripts/bench-device-analysis-phase3.mjs <prepare|prepare-rust-analysis|analyze> [root]");
  process.exitCode = 2;
}
