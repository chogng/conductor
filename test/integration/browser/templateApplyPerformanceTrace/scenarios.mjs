export const templateApplyPerformanceTraceScenarios = {
  "chart-targets-200": {
    description: "400 imported files, 200 expected chart targets, live + stable hover and file switch stress.",
    historyKey: "chart-targets-200.coordinated",
    defaults: {
      fileCount: 400,
      fileSwitch: true,
      fileSwitchCount: 200,
      fileSwitchIntervalMs: 16,
      fileSwitchLive: true,
      fileSwitchLiveMs: 12000,
      liveStressCoordinated: true,
      liveStressParallel: true,
      profile: "healthy",
      rowCount: 4000,
      thumbnailHover: true,
      thumbnailHoverCount: 200,
      thumbnailHoverLive: true,
      thumbnailHoverLiveMs: 12000,
      thumbnailHoverStormIntervalMs: 16,
      timeoutMs: 480000,
    },
  },
  "chart-targets-260-cache-lifecycle": {
    description: "520 imported files, 260 expected chart targets, cache-lifecycle pressure over the plot display cache limit.",
    historyKey: "chart-targets-260.cache-lifecycle",
    defaults: {
      fileCount: 520,
      fileSwitch: true,
      fileSwitchCount: 260,
      fileSwitchIntervalMs: 16,
      fileSwitchLive: true,
      fileSwitchLiveMs: 12000,
      liveStressCoordinated: true,
      liveStressParallel: true,
      profile: "healthy",
      rowCount: 4000,
      targetCollectionTimeoutMs: 30000,
      thumbnailHover: true,
      thumbnailHoverCount: 260,
      thumbnailHoverLive: true,
      thumbnailHoverLiveMs: 12000,
      thumbnailHoverStormIntervalMs: 16,
      timeoutMs: 600000,
    },
  },
};

export const resolveTemplateApplyPerformanceTraceScenario = (scenarioName) => {
  if (!scenarioName) {
    return null;
  }

  const scenario = templateApplyPerformanceTraceScenarios[scenarioName];
  if (!scenario) {
    const available = Object.keys(templateApplyPerformanceTraceScenarios).join(", ");
    throw new Error(`Unknown template apply performance trace scenario "${scenarioName}". Available scenarios: ${available}`);
  }

  return scenario;
};
