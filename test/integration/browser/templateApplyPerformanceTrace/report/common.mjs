export const formatMs = (value) => `${Math.round(value)}ms`;

export const readNumber = (value) => {
  if (value == null || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export const roundMetric = (value) => value == null ? null : Math.round(value * 10) / 10;

export const summarizeDurations = (values) => {
  const numbers = values
    .map(readNumber)
    .filter(value => value != null && value >= 0)
    .sort((a, b) => a - b);
  if (!numbers.length) {
    return {
      avgMs: null,
      count: 0,
      maxMs: null,
      minMs: null,
      p50Ms: null,
      p90Ms: null,
      p95Ms: null,
      totalMs: null,
    };
  }

  const percentile = (ratio) => {
    const index = Math.min(numbers.length - 1, Math.max(0, Math.ceil(numbers.length * ratio) - 1));
    return numbers[index];
  };
  const total = numbers.reduce((sum, value) => sum + value, 0);
  return {
    avgMs: roundMetric(total / numbers.length),
    count: numbers.length,
    maxMs: roundMetric(numbers[numbers.length - 1]),
    minMs: roundMetric(numbers[0]),
    p50Ms: roundMetric(percentile(0.5)),
    p90Ms: roundMetric(percentile(0.9)),
    p95Ms: roundMetric(percentile(0.95)),
    totalMs: roundMetric(total),
  };
};

export const summarizeStageDuration = (events, stage, key = "durationMs") =>
  summarizeDurations(events
    .filter(event => event.stage === stage)
    .map(event => event.meta?.[key]));

export const summarizeMatchedDurations = (events, startStage, endStages) => {
  const startsByKey = new Map();
  const durations = [];
  const getKey = event => [
    event.meta?.fileName ?? "",
    event.meta?.relativePath ?? "",
    event.meta?.index ?? "",
    event.meta?.sourceSizeBytes ?? "",
  ].join("|");

  for (const event of events) {
    if (event.stage === startStage) {
      const key = getKey(event);
      const starts = startsByKey.get(key) ?? [];
      starts.push(event);
      startsByKey.set(key, starts);
      continue;
    }

    if (!endStages.includes(event.stage)) {
      continue;
    }

    const key = getKey(event);
    const starts = startsByKey.get(key);
    const start = starts?.shift();
    if (!start) {
      continue;
    }
    durations.push(event.timestamp - start.timestamp);
  }

  return summarizeDurations(durations);
};

export const countBy = (values) => {
  const counts = {};
  for (const value of values) {
    const key = String(value ?? "unknown");
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
};

export const getAnalysisPerfEntries = (analysisPerfReport) =>
  Array.isArray(analysisPerfReport?.entries) ? analysisPerfReport.entries : [];

export const summaryCount = (summary) => readNumber(summary?.count) ?? 0;
export const summaryP95 = (summary) => readNumber(summary?.p95Ms);
