import {
  countBy,
  getAnalysisPerfEntries,
  summarizeDurations,
} from "./common.mjs";

export const summarizePerfEntriesBy = (entries, stage, predicate) =>
  summarizeDurations(entries
    .filter(entry => entry.stage === stage && predicate(entry))
    .map(entry => entry.meta?.durationMs));

export const summarizeCalculationBuildMetrics = (analysisPerfReport) => {
  const entries = getAnalysisPerfEntries(analysisPerfReport);
  const isWorker = entry => entry.meta?.worker === true;
  const isForeground = entry => entry.meta?.chunkMode === "foreground";
  const isBackground = entry => entry.meta?.chunkMode === "background";
  return {
    all: summarizePerfEntriesBy(entries, "calculationContribution.buildRecords", () => true),
    mainForeground: summarizePerfEntriesBy(entries, "calculationContribution.buildRecords", entry =>
      !isWorker(entry) && isForeground(entry)
    ),
    mainBackground: summarizePerfEntriesBy(entries, "calculationContribution.buildRecords", entry =>
      !isWorker(entry) && isBackground(entry)
    ),
    workerForeground: summarizePerfEntriesBy(entries, "calculationContribution.buildRecords", entry =>
      isWorker(entry) && isForeground(entry)
    ),
    workerBackground: summarizePerfEntriesBy(entries, "calculationContribution.buildRecords", entry =>
      isWorker(entry) && isBackground(entry)
    ),
  };
};

export const createCalculationReportBlock = ({
  analysis,
  analysisPerfReport,
  metricsRow,
}) => ({
  buildRecords: metricsRow.calculationBuild,
  flushInteractive: analysis.phaseAnalysis?.windowsByName?.applyProcessing?.perf?.stageDurationMs?.["calculationContribution.flushInteractivePriority"] ?? null,
  flushPending: analysis.phaseAnalysis?.windowsByName?.applyProcessing?.perf?.stageDurationMs?.["calculationContribution.flushPending"] ?? null,
  stageCounts: countBy(getAnalysisPerfEntries(analysisPerfReport)
    .filter(entry => String(entry.stage ?? "").startsWith("calculation"))
    .map(entry => entry.stage)),
});
