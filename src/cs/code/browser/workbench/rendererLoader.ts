import { getBootNowMs } from "src/cs/code/browser/workbench/boot";
import { getWorkbenchEnvironment } from "src/cs/workbench/services/environment/browser/environmentService";

let workbenchAppPromise: Promise<typeof import("src/cs/code/browser/workbench/app")> | null = null;
let appPromise:
  | Promise<typeof import("src/cs/workbench/browser/workbenchApp")>
  | null = null;

let workbenchImportStartedAtMs = 0;
let importStartedAtMs = 0;

const isBootProfileEnabled = () =>
  getWorkbenchEnvironment()?.isDesktop === true ||
  (import.meta.env.DEV && window.__CONDUCTOR_BOOT_PROFILE_ENABLED__ === true);

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
  workbenchAppPromise = import("src/cs/code/browser/workbench/app")
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

export const loadApp = () => {
  if (appPromise) {
    logRendererBoot(
      "analysis:import-hit-cache",
      formatWaitSince(importStartedAtMs, "sinceFirstImport"),
    );
    return appPromise;
  }

  importStartedAtMs = getBootNowMs();
  logRendererBoot("analysis:import-started");
  appPromise = import("src/cs/workbench/browser/workbenchApp")
    .then((module) => {
      logRendererBoot(
        "analysis:import-resolved",
        formatWaitSince(importStartedAtMs),
      );
      return module;
    })
    .catch((error) => {
      logRendererBoot(
        "analysis:import-failed",
        `${formatWaitSince(importStartedAtMs)} (message=${error instanceof Error ? error.message : String(error)})`,
      );
      throw error;
    });

  return appPromise;
};
