import {
  readNumber,
  roundMetric,
  summarizeDurations,
} from "./common.mjs";

export const targetPerfMilestoneDefs = [
  {
    key: "templateOutputCommitted",
    match: (entry, fileId) =>
      entry.stage === "templateApplyController.commitTemplateOutput" &&
      entry.meta?.committed === true &&
      perfEntryIncludesFileId(entry, fileId),
  },
  {
    key: "templateOutputFlushed",
    match: (entry, fileId) =>
      entry.stage === "templateApplyController.flushTemplateOutputs" &&
      perfEntryIncludesFileId(entry, fileId),
  },
  {
    key: "sessionTemplateCommitted",
    match: (entry, fileId) =>
      entry.stage === "sessionService.commitTemplateOutput" &&
      entry.meta?.committed === true &&
      perfEntryIncludesFileId(entry, fileId),
  },
  {
    key: "calculationPrioritized",
    match: (entry, fileId) =>
      entry.stage === "calculationService.prioritizeCalculationFiles" &&
      perfEntryIncludesFileId(entry, fileId),
  },
  {
    key: "calculationEnqueued",
    match: (entry, fileId) =>
      entry.stage === "calculationContribution.update" &&
      perfEntryMetaIds(entry.meta, ["enqueuedFileIds", "fileIds"]).includes(fileId),
  },
  {
    key: "calculationBuilt",
    match: (entry, fileId) =>
      entry.stage === "calculationContribution.buildRecords" &&
      perfEntryIncludesFileId(entry, fileId),
  },
  {
    key: "sessionCalculationCommitted",
    match: (entry, fileId) =>
      entry.stage === "sessionService.commitCalculatedRecordsBatch" &&
      entry.meta?.committed === true &&
      perfEntryIncludesFileId(entry, fileId),
  },
  {
    key: "plotDisplayRequested",
    match: (entry, fileId) =>
      entry.stage === "plotService.prefetchPlotDisplayModel" &&
      perfEntryIncludesFileId(entry, fileId),
  },
  {
    key: "plotChartCached",
    match: (entry, fileId) =>
      perfEntryIncludesFileId(entry, fileId) &&
      (
        (
          entry.stage === "plotService.prefetchPlotDisplayModel" &&
          entry.meta?.result === "chartCached"
        ) ||
        (
          entry.stage === "plotService.cachePlotDisplayModel" &&
          entry.meta?.hasInspector === false
        )
      ),
  },
  {
    key: "plotFullCached",
    match: (entry, fileId) =>
      perfEntryIncludesFileId(entry, fileId) &&
      (
        (
          entry.stage === "plotService.prefetchPlotDisplayModel" &&
          entry.meta?.result === "fullCacheHit"
        ) ||
        (
          entry.stage === "plotService.cachePlotDisplayModel" &&
          entry.meta?.hasInspector === true
        )
      ),
  },
  {
    key: "plotFullQueued",
    match: (entry, fileId) =>
      entry.stage === "plotService.queueFullPlotDisplayModel" &&
      perfEntryIncludesFileId(entry, fileId),
  },
  {
    key: "plotMainDrawn",
    match: (entry, fileId) =>
      entry.stage === "plotMainChart.draw" &&
      perfEntryRenderSignatureFileId(entry) === fileId,
  },
  {
    key: "thumbnailReady",
    match: (entry, fileId) =>
      perfEntryIncludesFileId(entry, fileId) &&
      (
        (
          entry.stage === "thumbnailPreview.update" &&
          ["fastReady", "rawReady", "ready"].includes(String(entry.meta?.resolvedState ?? ""))
        ) ||
        (
          entry.stage === "thumbnailHover.render" &&
          ["fastReady", "rawReady", "ready"].includes(String(entry.meta?.previewState ?? ""))
        )
      ),
  },
  {
    key: "thumbnailWarmed",
    match: (entry, fileId) =>
      entry.stage === "thumbnailHover.warm" &&
      perfEntryIncludesFileId(entry, fileId),
  },
];

export const perfEntryIncludesFileId = (entry, fileId) =>
  perfEntryFileIds(entry).includes(fileId);

export const perfEntryRenderSignatureFileId = (entry) => {
  const signature = String(entry?.meta?.renderSignature ?? "");
  return signature.split("|")[0] || null;
};

export const perfEntryFileIds = (entry) =>
  perfEntryMetaIds(entry?.meta, [
    "candidateFileIds",
    "committedFileIds",
    "enqueuedFileIds",
    "fileId",
    "fileIds",
    "foregroundFileIds",
    "interactiveCommittedFileIds",
    "interactivePriorityFileIds",
    "pendingFileIds",
    "remainingFileIds",
  ]);

export const perfEntryMetaIds = (meta, keys) => {
  const ids = [];
  for (const key of keys) {
    const value = meta?.[key];
    if (Array.isArray(value)) {
      ids.push(...value);
    } else if (value != null) {
      ids.push(value);
    }
  }
  return [...new Set(ids.map(value => String(value ?? "").trim()).filter(Boolean))];
};

export const createTargetPerfMilestoneSamples = (perfReport, targetSamples) => {
  const entries = Array.isArray(perfReport?.entries)
    ? perfReport.entries.filter(entry => readNumber(entry?.timestamp) != null)
    : [];
  if (!entries.length || !Array.isArray(targetSamples) || !targetSamples.length) {
    return [];
  }

  return targetSamples.map((sample) => {
    const fileId = String(sample?.fileId ?? "").trim();
    const dispatchWallTime = readNumber(sample?.dispatchWallTime);
    const milestones = {};
    if (fileId && dispatchWallTime != null) {
      for (const def of targetPerfMilestoneDefs) {
        const entry = findTargetPerfEntry(entries, fileId, dispatchWallTime, def);
        if (!entry) {
          milestones[def.key] = null;
          continue;
        }

        const timestamp = readNumber(entry.timestamp);
        milestones[def.key] = {
          durationMs: roundMetric(readNumber(entry.meta?.durationMs)),
          offsetMs: timestamp != null ? roundMetric(timestamp - dispatchWallTime) : null,
          result: entry.meta?.result ?? null,
          stage: entry.stage,
          timestamp: roundMetric(timestamp),
        };
      }
    }

    return {
      dispatchWallTime,
      fileId,
      milestones,
    };
  });
};

export const findTargetPerfEntry = (entries, fileId, dispatchWallTime, def) => {
  const afterDispatch = entries.find(entry =>
    readNumber(entry.timestamp) >= dispatchWallTime &&
    def.match(entry, fileId)
  );
  if (afterDispatch) {
    return afterDispatch;
  }

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (
      readNumber(entry.timestamp) < dispatchWallTime &&
      def.match(entry, fileId)
    ) {
      return entry;
    }
  }
  return null;
};

export const summarizeTargetPerfMilestoneSamples = (samples) => {
  if (!Array.isArray(samples) || !samples.length) {
    return null;
  }

  return Object.fromEntries(targetPerfMilestoneDefs.map((def) => {
    const milestoneSamples = samples
      .map(sample => sample.milestones?.[def.key])
      .filter(Boolean);
    const offsets = milestoneSamples
      .map(milestone => readNumber(milestone.offsetMs))
      .filter(value => value != null && value >= 0);
    return [def.key, {
      afterDispatchCount: offsets.length,
      beforeDispatchCount: milestoneSamples.filter(
        milestone => readNumber(milestone.offsetMs) != null && readNumber(milestone.offsetMs) < 0,
      ).length,
      durationMs: summarizeDurations(milestoneSamples.map(milestone => milestone.durationMs)),
      missingCount: samples.length - milestoneSamples.length,
      offsetMs: summarizeDurations(offsets),
      reachedCount: milestoneSamples.length,
    }];
  }));
};

export const summarizeTargetPerfMilestoneOffset = (samples, key) => summarizeDurations(
  (Array.isArray(samples) ? samples : [])
    .map(sample => readNumber(sample?.milestones?.[key]?.offsetMs))
    .filter(value => value != null && value >= 0),
);
