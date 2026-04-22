import type { LanguageCode } from "../../../context/language";
import type { ThemeMode } from "../../../context/theme";
import type { Feedback } from "../shared/lib/sharedTypes";
import type { LooseTranslateFn as TranslateFn } from "../shared/lib/translateTypes";
import type {
  IonIoffMethod,
  SsMethod,
} from "../session/device-analysis-session-context";

export type DeviceAnalysisSettings = {
  fileNameFieldSeparators?: string;
  language?: LanguageCode;
  theme?: ThemeMode;
  originExePath?: string;
  originExportModeDefault?:
    | "merged"
    | "workbookBooks"
    | "workbookSheets"
    | "separate";
  originPlotCommandDefault?: string;
  originPlotPostCommandsDefault?: string[];
  originPlotTypeDefault?: number;
  originPlotXyPairsDefault?: string;
  originPlotLineWidthDefault?: number;
  originRuntimeCleanupEnabled?: boolean;
  originRuntimeFailedRetentionDays?: number;
  originRuntimeKeepSuccessJobs?: number;
  ionIoffManualIoffX?: number | string;
  ionIoffManualIonX?: number | string;
  ionIoffMethodDefault?: IonIoffMethod;
  ssDiagnosticsEnabled?: boolean;
  ssIdHigh?: number | string;
  ssIdLow?: number | string;
  ssMethodDefault?: SsMethod;
  ssShowFitLine?: boolean;
  stopOnErrorDefault?: boolean;
  yUnitByFileId?: Record<string, "A" | "mA" | "uA" | "nA" | "pA">;
  yScaleByFileId?: Record<string, "linear" | "log">;
  [key: string]: unknown;
};

export type PersistencePathInfo = {
  cancelled?: boolean;
  currentPath?: string;
  isConfigurable?: boolean;
  [key: string]: unknown;
};

export type OriginHealthResult = {
  logPath?: string;
  originExePath?: string;
  [key: string]: unknown;
};

export type OriginCleanupResult = {
  removedTotal?: number;
  [key: string]: unknown;
};

export type OriginBridge = {
  checkOriginHealth?: (options: { path?: string }) => Promise<OriginHealthResult>;
  getOriginExePath: () => Promise<string>;
  pickOriginExePath: () => Promise<string>;
  runOriginRuntimeCleanup?: () => Promise<OriginCleanupResult>;
};

declare global {
  interface Window {
    __CONDUCTOR_INITIAL_DEVICE_ANALYSIS_SETTINGS__?: Record<string, unknown> | null;
    desktopOrigin?: OriginBridge;
  }
}

export const IDLE_FEEDBACK: Feedback = { type: "idle", message: "" };

export const ORIGIN_CLEANUP_DEFAULTS = {
  enabled: true,
  keepSuccessJobs: 1,
  failedRetentionDays: 7,
};

export const ORIGIN_EXE_PATH_LOAD_TIMEOUT_MS = 10000;

export const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "";

export const isObjectRecord = (
  value: unknown,
): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object";

export const toDeviceAnalysisSettings = (
  value: unknown,
): DeviceAnalysisSettings | null => (isObjectRecord(value) ? value : null);

export const toPersistencePathInfo = (
  value: unknown,
): PersistencePathInfo | null => (isObjectRecord(value) ? value : null);

export const getInitialDeviceAnalysisSettingsSnapshot =
  (): DeviceAnalysisSettings | null => {
    if (typeof window === "undefined") return null;

    const settings = window.__CONDUCTOR_INITIAL_DEVICE_ANALYSIS_SETTINGS__;
    return isObjectRecord(settings)
      ? (settings as DeviceAnalysisSettings)
      : null;
  };

export const normalizeTrimmedString = (value: unknown): string =>
  typeof value === "string" && value.trim() ? value.trim() : "";

export const normalizeBoundedInt = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const rounded = Math.floor(num);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
};

export const buildOriginLogMessage = (
  baseMessage: string,
  logPath: unknown,
  t: TranslateFn,
): string => {
  const normalizedLogPath = normalizeTrimmedString(logPath);
  return normalizedLogPath
    ? `${baseMessage} ${t("da_origin_error_log_path", {
        path: normalizedLogPath,
      })}`
    : baseMessage;
};

export const getOriginExePathWithTimeout = async (
  bridge: OriginBridge,
): Promise<string> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race<string>([
      bridge.getOriginExePath(),
      new Promise<string>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error("Origin executable path load timed out."));
        }, ORIGIN_EXE_PATH_LOAD_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export const getDesktopOriginBridge = (): OriginBridge | null => {
  if (typeof window === "undefined") return null;

  const bridge = window.desktopOrigin;
  if (!bridge || typeof bridge !== "object") return null;
  if (typeof bridge.getOriginExePath !== "function") return null;
  if (typeof bridge.pickOriginExePath !== "function") return null;

  return bridge;
};
