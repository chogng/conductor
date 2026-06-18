import { roundMetric } from "./common.mjs";

export const summarizeResourceSamples = (samples) => {
  const cpu = samples.map(sample => sample.process?.cpuPercent).filter(value => typeof value === "number");
  const rssMb = samples
    .map(sample => typeof sample.process?.rssKb === "number" ? sample.process.rssKb / 1024 : null)
    .filter(value => value != null);
  const usedHeapMb = samples
    .map(sample => typeof sample.renderer?.usedJSHeapSize === "number"
      ? sample.renderer.usedJSHeapSize / 1024 / 1024
      : null)
    .filter(value => value != null);
  const totalHeapMb = samples
    .map(sample => typeof sample.renderer?.totalJSHeapSize === "number"
      ? sample.renderer.totalJSHeapSize / 1024 / 1024
      : null)
    .filter(value => value != null);
  const avg = values => values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
  const max = values => values.length ? Math.max(...values) : null;
  const first = samples[0];
  const last = samples[samples.length - 1];

  return {
    avgCpuPercent: roundMetric(avg(cpu)),
    durationMs: first && last ? last.wallTime - first.wallTime : null,
    maxCpuPercent: roundMetric(max(cpu)),
    maxRssMb: roundMetric(max(rssMb)),
    maxTotalJsHeapMb: roundMetric(max(totalHeapMb)),
    maxUsedJsHeapMb: roundMetric(max(usedHeapMb)),
    sampleCount: samples.length,
  };
};

export const createResourcesReportBlock = ({ analysis, resourceSamples }) => ({
  resourceSamples,
  summary: analysis.resources,
});
