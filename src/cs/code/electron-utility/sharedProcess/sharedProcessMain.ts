import { cleanSharedProcessLogs } from "./contrib/logsDataCleaner.js";
import { updateLocalizations } from "./contrib/localizationsUpdater.js";
import { cleanOriginRuntimeStorage, cleanRustExcelJobs } from "./contrib/runtimeDataCleaner.js";

export interface SharedProcessContributionContext {
  readonly analysisHomeDir: string;
  readonly originRuntimeStorageDir: string;
  readonly rustExcelJobRootDir: string;
  readonly log: (message: string) => void;
  readonly warn: (message: string, error?: unknown) => void;
}

export interface SharedProcessContribution {
  readonly id: string;
  readonly startup?: (context: SharedProcessContributionContext) => void;
  readonly shutdown?: (context: SharedProcessContributionContext) => void;
}

const contributions: readonly SharedProcessContribution[] = [
  {
    id: "localizationsUpdater",
    startup: updateLocalizations,
  },
  {
    id: "logsDataCleaner",
    startup: cleanSharedProcessLogs,
  },
  {
    id: "runtimeDataCleaner",
    startup: (context) => {
      cleanOriginRuntimeStorage(context);
      cleanRustExcelJobs(context);
    },
    shutdown: (context) => {
      cleanOriginRuntimeStorage(context);
      cleanRustExcelJobs(context);
    },
  },
];

const runContributionPhase = (
  phase: "startup" | "shutdown",
  context: SharedProcessContributionContext,
) => {
  for (const contribution of contributions) {
    try {
      contribution[phase]?.(context);
    } catch (error) {
      context.warn(
        `[shared-process] Contribution '${contribution.id}' failed during ${phase}.`,
        error,
      );
    }
  }
};

// Shared-process contribution host, following the upstream code/electron-utility shape.
// Today it runs in the main process as a thin host; the file boundary keeps background
// maintenance work ready to move into a real Electron utility process later.
export const runSharedProcessStartupContributions = (
  context: SharedProcessContributionContext,
) => {
  runContributionPhase("startup", context);
};

export const runSharedProcessShutdownContributions = (
  context: SharedProcessContributionContext,
) => {
  runContributionPhase("shutdown", context);
};
