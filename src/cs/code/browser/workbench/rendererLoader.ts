import { getBootNowMs } from "src/cs/code/browser/workbench/boot";
import { getWorkbenchEnvironment } from "src/cs/workbench/services/environment/browser/environmentService";

let legacyWorkbenchPromise:
  | Promise<typeof import("src/cs/workbench/browser/legacyReactWorkbench")>
  | null = null;

let legacyWorkbenchImportStartedAtMs = 0;

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

export const loadLegacyWorkbench = () => {
  if (legacyWorkbenchPromise) {
    logRendererBoot(
      "legacy-workbench:import-hit-cache",
      formatWaitSince(legacyWorkbenchImportStartedAtMs, "sinceFirstImport"),
    );
    return legacyWorkbenchPromise;
  }

  legacyWorkbenchImportStartedAtMs = getBootNowMs();
  logRendererBoot("legacy-workbench:import-started");
  legacyWorkbenchPromise = import("src/cs/workbench/browser/legacyReactWorkbench")
    .then((module) => {
      logRendererBoot(
        "legacy-workbench:import-resolved",
        formatWaitSince(legacyWorkbenchImportStartedAtMs),
      );
      return module;
    })
    .catch((error) => {
      logRendererBoot(
        "legacy-workbench:import-failed",
        `${formatWaitSince(legacyWorkbenchImportStartedAtMs)} (message=${error instanceof Error ? error.message : String(error)})`,
      );
      throw error;
    });
  return legacyWorkbenchPromise;
};
