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
  },
  phaseWindows: pickPhaseWindows(analysis, ["applyClick", "applyProcessing"]),
  thumbnailApply,
});
