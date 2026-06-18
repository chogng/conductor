import {
  countBy,
  readNumber,
  summarizeMatchedDurations,
  summarizeStageDuration,
} from "./common.mjs";
import { pickPhaseWindows } from "./phase.mjs";
import { summarizeResourceSamples } from "./resources.mjs";

export const summarizeMilestones = (
  events,
  {
    expectedAssessmentBadgeCount,
    expectedPrepareCompletionCount,
  },
) => {
  const baseline = events[0]?.timestamp ?? 0;
  const relative = event => event ? event.timestamp - baseline : null;
  const findBadge = (stage, threshold) => events.find(event =>
    event.stage === stage &&
    Number(event.meta?.assessmentBadgeCount) >= threshold
  );
  const findProjection = threshold => findBadge("import.badge.projection", threshold);
  const findDom = threshold => findBadge("import.badge.dom", threshold);
  const prepareCompletions = events.filter(event =>
    event.stage === "import.prepare.file.complete" ||
    event.stage === "import.prepare.file.failed"
  );
  const findPrepare = threshold => prepareCompletions[threshold - 1];
  const prepareHalf = Math.max(1, Math.ceil(expectedPrepareCompletionCount / 2));
  const badgeHalf = Math.max(1, Math.ceil(expectedAssessmentBadgeCount / 2));
  const firstDom = expectedAssessmentBadgeCount > 0 ? findDom(1) : null;
  const halfDom = expectedAssessmentBadgeCount > 0 ? findDom(badgeHalf) : null;
  const allDom = expectedAssessmentBadgeCount > 0 ? findDom(expectedAssessmentBadgeCount) : null;
  const firstProjection = expectedAssessmentBadgeCount > 0 ? findProjection(1) : null;
  const halfProjection = expectedAssessmentBadgeCount > 0 ? findProjection(badgeHalf) : null;
  const allProjection = expectedAssessmentBadgeCount > 0 ? findProjection(expectedAssessmentBadgeCount) : null;
  return {
    firstAssessmentBadgeMs: relative(firstDom ?? firstProjection),
    halfAssessmentBadgeMs: relative(halfDom ?? halfProjection),
    allAssessmentBadgeMs: relative(allDom ?? allProjection),
    firstAssessmentBadgeDomMs: relative(firstDom),
    halfAssessmentBadgeDomMs: relative(halfDom),
    allAssessmentBadgeDomMs: relative(allDom),
    firstAssessmentBadgeProjectionMs: relative(firstProjection),
    halfAssessmentBadgeProjectionMs: relative(halfProjection),
    allAssessmentBadgeProjectionMs: relative(allProjection),
    firstPrepareCompleteMs: expectedPrepareCompletionCount > 0 ? relative(findPrepare(1)) : null,
    halfPrepareCompleteMs: expectedPrepareCompletionCount > 0 ? relative(findPrepare(prepareHalf)) : null,
    allPrepareCompleteMs: expectedPrepareCompletionCount > 0
      ? relative(findPrepare(expectedPrepareCompletionCount))
      : null,
    sessionCommitMs: relative(events.find(event => event.stage === "import.session.commit.complete")),
  };
};

export const summarizePrepareOutcomes = (events) => {
  const backendResults = events.filter(event => event.stage === "import.prepare.backend.result");
  const fileCompletes = events.filter(event => event.stage === "import.prepare.file.complete");
  const fileFailures = events.filter(event => event.stage === "import.prepare.file.failed");
  return {
    backend: {
      cacheHitCount: backendResults.filter(event => event.meta?.cacheHit === true).length,
      count: backendResults.length,
      healthStates: countBy(backendResults.map(event => event.meta?.healthState ?? "none")),
      okCount: backendResults.filter(event => event.meta?.ok === true).length,
      sourceCounts: countBy(backendResults.map(event => event.meta?.source ?? "unknown")),
      failureCodes: countBy(
        backendResults
          .filter(event => event.meta?.ok !== true)
          .map(event => event.meta?.code ?? "unknown"),
      ),
    },
    files: {
      completeCount: fileCompletes.length,
      failedCount: fileFailures.length,
      preparedAssessmentCount: fileCompletes.filter(event =>
        event.meta?.hasPreparedAssessment === true
      ).length,
      failureCodes: countBy(fileFailures.map(event => event.meta?.code ?? "unknown")),
      sourceKinds: countBy([
        ...fileCompletes.map(event => event.meta?.sourceKind ?? "unknown"),
        ...fileFailures.map(event => event.meta?.sourceKind ?? "unknown"),
      ]),
    },
  };
};

export const buildBottleneckHints = ({ milestones, stages, resources }) => {
  const hints = [];
  const allPrepareMs = readNumber(milestones.allPrepareCompleteMs);
  const allBadgeDomMs = readNumber(milestones.allAssessmentBadgeDomMs);
  const backendWallMs = readNumber(stages.backendInvokeMs.maxMs);
  const folderReadDirMs = readNumber(stages.folderReadDirMs.totalMs) ?? 0;
  const folderStatMs = readNumber(stages.folderStatBatchMs.totalMs) ?? 0;
  const folderIoMs = folderReadDirMs + folderStatMs;
  const folderOnBatchMs = readNumber(stages.folderOnBatchMs.totalMs);
  const materializeTotalMs = readNumber(stages.materializeMs.totalMs);
  const appendTotalMs = readNumber(stages.appendMs.totalMs);
  const longTaskMaxMs = readNumber(stages.longTaskMs.maxMs);
  const maxHeapMb = readNumber(resources.maxUsedJsHeapMb);

  if (allPrepareMs != null && allBadgeDomMs != null && allBadgeDomMs - allPrepareMs > 100) {
    hints.push("Badge DOM display trails prepare completion by >100ms; inspect Explorer projection/render batching.");
  }
  if (allPrepareMs != null && backendWallMs != null && backendWallMs > allPrepareMs * 0.65) {
    hints.push("Backend invoke wall time dominates prepare; inspect IPC/main/Rust scheduling or native IO.");
  }
  if (allPrepareMs != null && folderIoMs > allPrepareMs * 0.35) {
    hints.push("Folder scan is a large share of import time; inspect readDir/stat batching and native metadata IO.");
  }
  if (allPrepareMs != null && folderOnBatchMs != null && folderOnBatchMs > allPrepareMs * 0.25) {
    hints.push("Folder walk is gated by onBatch preparation; inspect first-file prepare and scan/prepare overlap.");
  }
  if (allPrepareMs != null && materializeTotalMs != null && materializeTotalMs > allPrepareMs * 0.25) {
    hints.push("Renderer materialization is significant; inspect validation, File construction, and record shaping.");
  }
  if (allPrepareMs != null && appendTotalMs != null && appendTotalMs > allPrepareMs * 0.15) {
    hints.push("Append/projection callback cost is visible; inspect Explorer pending source updates and batching.");
  }
  if (longTaskMaxMs != null && longTaskMaxMs > 80) {
    hints.push("Renderer long tasks exceed 80ms; inspect synchronous parse/render/record shaping on the UI thread.");
  }
  if (maxHeapMb != null && maxHeapMb > 512) {
    hints.push("Renderer JS heap exceeds 512MB; inspect duplicated row/text retention and large File objects.");
  }

  return hints;
};

export const summarizeTraceAnalysis = ({ events, fixture, milestones, resourceSamples }) => {
  const stages = {
    appendMs: summarizeStageDuration(events, "import.prepare.append"),
    backendInvokeMs: summarizeStageDuration(events, "import.prepare.backend.invoke.complete"),
    backendResultRustMs: summarizeStageDuration(events, "import.prepare.backend.result", "resultDurationMs"),
    convertFileMs: summarizeMatchedDurations(events, "import.prepare.convert.start", ["import.prepare.convert.complete"]),
    dropCollectionMs: summarizeStageDuration(events, "import.drop.collected"),
    eventLoopLagMs: summarizeStageDuration(events, "import.runtime.eventLoopLag"),
    folderOnBatchMs: summarizeStageDuration(events, "import.folder.onBatch.complete"),
    folderReadDirMs: summarizeStageDuration(events, "import.folder.readDir.complete"),
    folderScanMs: summarizeStageDuration(events, "import.folder.scan.complete"),
    folderStatBatchMs: summarizeStageDuration(events, "import.folder.statBatch.complete"),
    longTaskMs: summarizeStageDuration(events, "import.runtime.longTask"),
    materializeMs: summarizeMatchedDurations(events, "import.prepare.result.materialize.start", ["import.prepare.result.materialize.complete"]),
    prepareFileMs: summarizeMatchedDurations(events, "import.prepare.file.start", [
      "import.prepare.file.complete",
      "import.prepare.file.failed",
    ]),
  };
  const resources = summarizeResourceSamples(resourceSamples);
  return {
    bottleneckHints: buildBottleneckHints({ milestones, resources, stages }),
    fixture: {
      composition: fixture.composition,
      expectedAssessmentBadgeCount: fixture.expectedAssessmentBadgeCount,
      expectedPrepareCompletionCount: fixture.expectedPrepareCompletionCount,
      expectedPrepareFailureCount: fixture.expectedPrepareFailureCount,
      profile: fixture.profile,
    },
    outcomes: summarizePrepareOutcomes(events),
    resources,
    stages,
  };
};

export const createImportReportBlock = ({ analysis, milestones }) => ({
  bottleneckHints: analysis.bottleneckHints,
  fixture: analysis.fixture,
  milestones,
  outcomes: analysis.outcomes,
  phaseWindows: pickPhaseWindows(analysis, ["importDispatch", "importUntilReady"]),
  stages: analysis.stages,
});
