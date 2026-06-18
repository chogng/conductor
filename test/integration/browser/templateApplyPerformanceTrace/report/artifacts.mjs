import {
  appendFileSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { createApplyReportBlock } from "./apply.mjs";
import { createCalculationReportBlock } from "./calculation.mjs";
import { createFileSwitchReportBlock } from "./fileSwitch.mjs";
import {
  compareMetricRows,
  createPerformanceMetricRow,
  readHistoryRows,
  sanitizeFileName,
  writeHistoryCsv,
  writeHistorySvg,
} from "./history.mjs";
import { createImportReportBlock } from "./import.mjs";
import { createResourcesReportBlock } from "./resources.mjs";
import { createThumbnailHoverReportBlock } from "./thumbnailHover.mjs";

export const createReportBlocks = ({
  analysis,
  analysisPerfReport,
  milestones,
  metricsRow,
  options,
  phaseAnchors,
  rawReportPath,
  resourceSamples,
  runId,
  runtime,
  thumbnailApply,
}) => ({
  apply: createApplyReportBlock({
    analysis,
    metricsRow,
    thumbnailApply,
  }),
  calculation: createCalculationReportBlock({
    analysis,
    analysisPerfReport,
    metricsRow,
  }),
  fileSwitch: createFileSwitchReportBlock({ analysis }),
  import: createImportReportBlock({
    analysis,
    milestones,
  }),
  resources: createResourcesReportBlock({
    analysis,
    resourceSamples,
  }),
  summary: {
    generatedAt: metricsRow.generatedAt,
    metrics: metricsRow.metrics,
    options,
    phaseAnchorCount: phaseAnchors.length,
    rawReportPath,
    runId,
    runtime,
    scenarioKey: metricsRow.scenarioKey,
    variant: metricsRow.variant,
  },
  thumbnailHover: createThumbnailHoverReportBlock({ analysis }),
});

export const writePerformanceArtifacts = ({
  analysis,
  analysisPerfReport,
  fixture,
  generatedAt,
  milestones,
  options,
  phaseAnchors,
  rawReportPath,
  resourceSamples,
  runId,
  runtime,
  thumbnailApply,
}) => {
  const metricsRow = createPerformanceMetricRow({
    analysis,
    analysisPerfReport,
    generatedAt,
    milestones,
    options,
    runId,
    runtime,
    thumbnailApply,
  });
  const historyPath = path.join(options.outputRoot, "history.jsonl");
  const previousRows = readHistoryRows(historyPath);
  const previousSameScenario = [...previousRows].reverse()
    .find(row => row.scenarioKey === metricsRow.scenarioKey);
  const comparison = compareMetricRows(metricsRow, previousSameScenario);
  const runDir = path.join(options.outputRoot, "runs", `${runId}-${runtime}`);
  const blockDir = path.join(runDir, "blocks");
  mkdirSync(blockDir, { recursive: true });

  const blocks = createReportBlocks({
    analysis,
    analysisPerfReport,
    fixture,
    milestones,
    metricsRow,
    options,
    phaseAnchors,
    rawReportPath,
    resourceSamples,
    runId,
    runtime,
    thumbnailApply,
  });
  const blockPaths = {};
  for (const [name, block] of Object.entries(blocks)) {
    if (name === "summary") {
      continue;
    }
    const blockPath = path.join(blockDir, `${name}.json`);
    writeFileSync(blockPath, `${JSON.stringify(block, null, 2)}\n`);
    blockPaths[name] = blockPath;
  }

  const summaryPath = path.join(runDir, "summary.json");
  writeFileSync(summaryPath, `${JSON.stringify({
    ...blocks.summary,
    blockPaths,
    comparison,
  }, null, 2)}\n`);
  appendFileSync(historyPath, `${JSON.stringify(metricsRow)}\n`);
  const historyRows = [...previousRows, metricsRow];
  const historyCsvPath = path.join(options.outputRoot, "history.csv");
  writeHistoryCsv(historyCsvPath, historyRows);
  const historyDir = path.join(options.outputRoot, "history");
  mkdirSync(historyDir, { recursive: true });
  const historySvgPath = path.join(historyDir, `${sanitizeFileName(metricsRow.scenarioKey)}.svg`);
  writeHistorySvg(historySvgPath, historyRows, metricsRow.scenarioKey);

  return {
    blockPaths,
    comparison,
    historyCsvPath,
    historyPath,
    historySvgPath,
    metricsRow,
    runDir,
    summaryPath,
  };
};
