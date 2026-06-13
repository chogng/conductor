import { cleanSharedProcessLogs } from "./contrib/logsDataCleaner.js";
import { cleanLegacyStoreData } from "./contrib/legacyStoreDataCleaner.js";
import { updateLocalizations } from "./contrib/localizationsUpdater.js";
import { cleanOriginRuntimeStorage } from "./contrib/originRuntimeStorageCleaner.js";
import { cleanRustProcessingCaches } from "./contrib/rustCacheCleaner.js";
import { cleanRustExcelJobs } from "./contrib/rustExcelJobCleaner.js";
import { cleanUnusedWorkspaceStorageData } from "./contrib/storageDataCleaner.js";

export interface SharedProcessContributionContext {
  readonly analysisHomeDir: string;
  readonly desktopDiagnosticLogDir: string;
  readonly analysisTempRootDir: string;
  readonly conductorUserDataHomeDir: string;
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
		id: "storageDataCleaner",
		startup: cleanUnusedWorkspaceStorageData,
	},
	{
		id: "legacyStoreDataCleaner",
		startup: cleanLegacyStoreData,
	},
  {
    id: "originRuntimeStorageCleaner",
    startup: cleanOriginRuntimeStorage,
    shutdown: cleanOriginRuntimeStorage,
  },
  {
    id: "rustExcelJobCleaner",
    startup: cleanRustExcelJobs,
    shutdown: cleanRustExcelJobs,
  },
  {
    id: "rustCacheCleaner",
    startup: cleanRustProcessingCaches,
    shutdown: cleanRustProcessingCaches,
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
