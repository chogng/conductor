let workbenchAppPromise: Promise<typeof import("./App")> | null = null;
let deviceAnalysisAppPromise:
  | Promise<typeof import("./features/device-analysis/DeviceAnalysisApp")>
  | null = null;

let workbenchImportStartedAtMs = 0;
let deviceAnalysisImportStartedAtMs = 0;

const isBootProfileEnabled = () =>
  import.meta.env.DEV && window.__CONDUCTOR_BOOT_PROFILE_ENABLED__ === true;

const getBootNowMs = () => {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }

  return Date.now();
};

const formatWaitSince = (startedAtMs: number, label = "wait") => {
  const elapsedMs = Math.max(0, Math.round(getBootNowMs() - startedAtMs));
  return `(${label}=${elapsedMs}ms)`;
};

const logRendererBoot = (stage: string, extra = "") => {
  if (!isBootProfileEnabled()) {
    return;
  }

  window.__CONDUCTOR_BOOT_LOG__?.(stage, extra);
};

export const loadWorkbenchApp = () => {
  if (workbenchAppPromise) {
    logRendererBoot(
      "app:import-hit-cache",
      formatWaitSince(workbenchImportStartedAtMs, "sinceFirstImport"),
    );
    return workbenchAppPromise;
  }

  workbenchImportStartedAtMs = getBootNowMs();
  logRendererBoot("app:import-started");
  workbenchAppPromise = import("./App")
    .then((module) => {
      logRendererBoot(
        "app:import-resolved",
        formatWaitSince(workbenchImportStartedAtMs),
      );
      return module;
    })
    .catch((error) => {
      logRendererBoot(
        "app:import-failed",
        `${formatWaitSince(workbenchImportStartedAtMs)} (message=${error instanceof Error ? error.message : String(error)})`,
      );
      throw error;
    });
  return workbenchAppPromise;
};

export const loadDeviceAnalysisApp = () => {
  if (deviceAnalysisAppPromise) {
    logRendererBoot(
      "device-analysis:import-hit-cache",
      formatWaitSince(deviceAnalysisImportStartedAtMs, "sinceFirstImport"),
    );
    return deviceAnalysisAppPromise;
  }

  deviceAnalysisImportStartedAtMs = getBootNowMs();
  logRendererBoot("device-analysis:import-started");
  deviceAnalysisAppPromise = import("./features/device-analysis/DeviceAnalysisApp")
    .then((module) => {
      logRendererBoot(
        "device-analysis:import-resolved",
        formatWaitSince(deviceAnalysisImportStartedAtMs),
      );
      return module;
    })
    .catch((error) => {
      logRendererBoot(
        "device-analysis:import-failed",
        `${formatWaitSince(deviceAnalysisImportStartedAtMs)} (message=${error instanceof Error ? error.message : String(error)})`,
      );
      throw error;
    });

  return deviceAnalysisAppPromise;
};
