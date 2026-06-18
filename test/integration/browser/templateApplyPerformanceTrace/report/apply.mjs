import { pickPhaseWindows } from "./phase.mjs";

export const createApplyReportBlock = ({
  analysis,
  metricsRow,
  thumbnailApply,
}) => ({
  metrics: {
    applyEventLoopLagCount: metricsRow.metrics.applyEventLoopLagCount,
    applyEventLoopLagP95Ms: metricsRow.metrics.applyEventLoopLagP95Ms,
    applyLongTaskCount: metricsRow.metrics.applyLongTaskCount,
    applyLongTaskP95Ms: metricsRow.metrics.applyLongTaskP95Ms,
    applyProcessingMs: metricsRow.metrics.applyProcessingMs,
    sessionCalculatedCommitP95Ms: metricsRow.metrics.sessionCalculatedCommitP95Ms,
    sessionTemplateCommitP95Ms: metricsRow.metrics.sessionTemplateCommitP95Ms,
  },
  phaseWindows: pickPhaseWindows(analysis, ["applyClick", "applyProcessing"]),
  thumbnailApply,
});
