import { useCallback, useEffect, useMemo, useState } from "react";
import { formatOriginBridgeError } from "../lib/originBridgeError";
import { apiService } from "../services/apiService";
import {
  DEFAULT_ORIGIN_PLOT_OPTIONS,
  normalizeOriginPlotOptions,
  normalizeOriginPostCommands,
  originPostCommandsToMultiline,
  type OriginPlotOptions,
} from "../lib/originPlotOptions";

type TranslateFn = (key: string, vars?: Record<string, unknown>) => string;

type LanguageCode = "zh" | "en";
type SsMethod = "auto" | "manual" | "idWindow" | "legacy";

type DeviceAnalysisSettings = {
  language?: LanguageCode;
  originExePath?: string;
  originPlotCommandDefault?: string;
  originPlotPostCommandsDefault?: string[];
  originPlotTypeDefault?: number;
  originPlotXyPairsDefault?: string;
  originPlotLineWidthDefault?: number;
  originRuntimeCleanupEnabled?: boolean;
  originRuntimeFailedRetentionDays?: number;
  originRuntimeKeepSuccessJobs?: number;
  ssDiagnosticsEnabled?: boolean;
  ssIdHigh?: number | string;
  ssIdLow?: number | string;
  ssMethodDefault?: SsMethod;
  ssShowFitLine?: boolean;
  stopOnErrorDefault?: boolean;
  [key: string]: unknown;
};

type Feedback = {
  message: string;
  type: "idle" | "success" | "error";
};

type PersistencePathInfo = {
  cancelled?: boolean;
  currentPath?: string;
  isConfigurable?: boolean;
  [key: string]: unknown;
};

type OriginHealthResult = {
  logPath?: string;
  originExePath?: string;
  [key: string]: unknown;
};

type OriginBatchResult = {
  logPath?: string;
  summary?: {
    failed?: number;
    succeeded?: number;
    total?: number;
  };
  [key: string]: unknown;
};

type OriginCleanupResult = {
  removedTotal?: number;
  [key: string]: unknown;
};

type OriginBridge = {
  checkOriginHealth?: (options: { path?: string }) => Promise<OriginHealthResult>;
  getOriginExePath: () => Promise<string>;
  pickOriginExePath: () => Promise<string>;
  runOriginBatch?: (options: {
    allowPickInputDir: boolean;
    plot?: Partial<OriginPlotOptions>;
  }) => Promise<OriginBatchResult>;
  runOriginRuntimeCleanup?: () => Promise<OriginCleanupResult>;
};

type UseDeviceAnalysisSettingsOptions = {
  activePage: string;
  isWindowsDesktopShell: boolean;
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  setSsDiagnosticsEnabled: (enabled: boolean) => void;
  setSsIdWindow: (window: { high: string; low: string }) => void;
  setSsMethod: (method: SsMethod) => void;
  setSsShowFitLine: (enabled: boolean) => void;
  t: TranslateFn;
};

declare global {
  interface Window {
    desktopOrigin?: OriginBridge;
  }
}

const IDLE_FEEDBACK: Feedback = { type: "idle", message: "" };

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "";

const normalizeTrimmedString = (value: unknown): string =>
  typeof value === "string" && value.trim() ? value.trim() : "";

const normalizeBoundedInt = (
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

const ORIGIN_CLEANUP_DEFAULTS = {
  enabled: true,
  keepSuccessJobs: 1,
  failedRetentionDays: 7,
};

const buildOriginLogMessage = (
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

const normalizeOriginBatchSummary = (summary: unknown) => {
  const safeSummary =
    summary && typeof summary === "object"
      ? (summary as { failed?: unknown; succeeded?: unknown; total?: unknown })
      : {};

  const total = Number(safeSummary.total);
  const succeeded = Number(safeSummary.succeeded);
  const failed = Number(safeSummary.failed);

  const totalSafe = Number.isFinite(total) && total >= 0 ? total : 0;
  const succeededSafe =
    Number.isFinite(succeeded) && succeeded >= 0 ? succeeded : 0;
  const failedSafe =
    Number.isFinite(failed) && failed >= 0
      ? failed
      : Math.max(0, totalSafe - succeededSafe);

  return {
    failed: failedSafe,
    succeeded: succeededSafe,
    total: totalSafe,
  };
};

const ORIGIN_EXE_PATH_LOAD_TIMEOUT_MS = 10000;

const getOriginExePathWithTimeout = async (
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

export const useDeviceAnalysisSettings = ({
  activePage,
  isWindowsDesktopShell,
  language,
  setLanguage,
  setSsDiagnosticsEnabled,
  setSsIdWindow,
  setSsMethod,
  setSsShowFitLine,
  t,
}: UseDeviceAnalysisSettingsOptions) => {
  const [deviceAnalysisSettings, setDeviceAnalysisSettings] =
    useState<DeviceAnalysisSettings | null>(null);
  const [deviceAnalysisSettingsLoaded, setDeviceAnalysisSettingsLoaded] =
    useState(false);
  const [persistencePathInfo, setPersistencePathInfo] =
    useState<PersistencePathInfo | null>(null);
  const [persistencePathLoading, setPersistencePathLoading] = useState(false);
  const [persistencePathSaving, setPersistencePathSaving] = useState(false);
  const [persistencePathFeedback, setPersistencePathFeedback] =
    useState<Feedback>(IDLE_FEEDBACK);

  const [originExePath, setOriginExePath] = useState("");
  const [originPathRequested, setOriginPathRequested] = useState(false);
  const [originPathLoading, setOriginPathLoading] = useState(true);
  const [originPathSaving, setOriginPathSaving] = useState(false);
  const [originHealthChecking, setOriginHealthChecking] = useState(false);
  const [originBatchRunning, setOriginBatchRunning] = useState(false);
  const [originPathFeedback, setOriginPathFeedback] = useState<Feedback>(IDLE_FEEDBACK);
  const [originCleanupSaving, setOriginCleanupSaving] = useState(false);
  const [originCleanupRunning, setOriginCleanupRunning] = useState(false);
  const [originCleanupFeedback, setOriginCleanupFeedback] =
    useState<Feedback>(IDLE_FEEDBACK);
  const [originPlotSaving, setOriginPlotSaving] = useState(false);
  const [originPlotFeedback, setOriginPlotFeedback] = useState<Feedback>(IDLE_FEEDBACK);

  const handleUpdateDeviceAnalysisSettings = useCallback(
    async (updates: unknown) => {
      const patch = updates && typeof updates === "object" ? updates : null;
      if (!patch) return null;

      const updated = (await apiService.updateDeviceAnalysisSettings(
        patch,
      )) as DeviceAnalysisSettings | null;
      setDeviceAnalysisSettings((prev) => ({
        ...(prev || {}),
        ...(updated || {}),
      }));

      return updated;
    },
    [],
  );

  const handleLanguageChange = useCallback(
    async (nextLanguage: LanguageCode) => {
      if (nextLanguage !== "zh" && nextLanguage !== "en") return;
      if (language === nextLanguage) return;

      setLanguage(nextLanguage);

      try {
        await handleUpdateDeviceAnalysisSettings({ language: nextLanguage });
      } catch {
        // keep UI responsive even if persistence fails
      }
    },
    [handleUpdateDeviceAnalysisSettings, language, setLanguage],
  );

  const getDesktopOriginBridge = useCallback((): OriginBridge | null => {
    if (typeof window === "undefined") return null;

    const bridge = window.desktopOrigin;
    if (!bridge || typeof bridge !== "object") return null;
    if (typeof bridge.getOriginExePath !== "function") return null;
    if (typeof bridge.pickOriginExePath !== "function") return null;

    return bridge;
  }, []);

  const originCleanupConfig = useMemo(() => {
    const settings = deviceAnalysisSettings || {};
    const enabled =
      typeof settings.originRuntimeCleanupEnabled === "boolean"
        ? settings.originRuntimeCleanupEnabled
        : ORIGIN_CLEANUP_DEFAULTS.enabled;

    const keepSuccessJobs = normalizeBoundedInt(
      settings.originRuntimeKeepSuccessJobs,
      ORIGIN_CLEANUP_DEFAULTS.keepSuccessJobs,
      0,
      100,
    );

    const failedRetentionDays = normalizeBoundedInt(
      settings.originRuntimeFailedRetentionDays,
      ORIGIN_CLEANUP_DEFAULTS.failedRetentionDays,
      1,
      365,
    );

    return {
      enabled,
      keepSuccessJobs,
      failedRetentionDays,
    };
  }, [deviceAnalysisSettings]);

  const originPlotConfig = useMemo(() => {
    const settings = deviceAnalysisSettings || {};
    return normalizeOriginPlotOptions(
      {
        command: settings.originPlotCommandDefault,
        postCommands: settings.originPlotPostCommandsDefault,
        type: settings.originPlotTypeDefault,
        lineWidth: settings.originPlotLineWidthDefault,
        xyPairs: settings.originPlotXyPairsDefault,
      },
      DEFAULT_ORIGIN_PLOT_OPTIONS,
    );
  }, [deviceAnalysisSettings]);

  const settingsOriginExePath = normalizeTrimmedString(
    deviceAnalysisSettings?.originExePath,
  );

  useEffect(() => {
    let cancelled = false;
    setDeviceAnalysisSettingsLoaded(false);

    (async () => {
      try {
        const settings = (await apiService.getDeviceAnalysisSettings()) as
          | DeviceAnalysisSettings
          | null;
        if (cancelled) return;

        setDeviceAnalysisSettings(settings ?? null);

        const nextLanguage = settings?.language;
        if (nextLanguage === "zh" || nextLanguage === "en") {
          setLanguage(nextLanguage);
        }

        const ssMethodDefault = settings?.ssMethodDefault;
        if (
          ssMethodDefault === "auto" ||
          ssMethodDefault === "manual" ||
          ssMethodDefault === "idWindow" ||
          ssMethodDefault === "legacy"
        ) {
          setSsMethod(ssMethodDefault);
        }

        if (typeof settings?.ssDiagnosticsEnabled === "boolean") {
          setSsDiagnosticsEnabled(settings.ssDiagnosticsEnabled);
        }

        if (typeof settings?.ssShowFitLine === "boolean") {
          setSsShowFitLine(settings.ssShowFitLine);
        }

        const low = Number(settings?.ssIdLow);
        const high = Number(settings?.ssIdHigh);
        if (
          Number.isFinite(low) &&
          Number.isFinite(high) &&
          low > 0 &&
          high > 0
        ) {
          setSsIdWindow({ low: String(low), high: String(high) });
        }
      } catch {
        // ignore settings load failures
      } finally {
        if (!cancelled) {
          setDeviceAnalysisSettingsLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    setLanguage,
    setSsDiagnosticsEnabled,
    setSsIdWindow,
    setSsMethod,
    setSsShowFitLine,
  ]);

  useEffect(() => {
    if (activePage !== "settings") return;

    let cancelled = false;

    (async () => {
      setPersistencePathLoading(true);
      try {
        const info = await apiService.getDeviceAnalysisPersistencePath();
        if (cancelled) return;

        const normalizedInfo =
          info && typeof info === "object"
            ? (info as PersistencePathInfo)
            : null;
        setPersistencePathInfo(normalizedInfo);
        setPersistencePathFeedback(IDLE_FEEDBACK);
      } catch (error) {
        if (cancelled) return;
        setPersistencePathInfo(null);
        setPersistencePathFeedback({
          type: "error",
          message: t("da_settings_storage_load_failed", {
            error: getErrorMessage(error) || t("unknownError"),
          }),
        });
      } finally {
        if (!cancelled) {
          setPersistencePathLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activePage, t]);

  const handleChoosePersistencePath = useCallback(async () => {
    setPersistencePathSaving(true);
    setPersistencePathFeedback(IDLE_FEEDBACK);

    try {
      const updatedInfo =
        (await apiService.chooseDeviceAnalysisPersistencePath()) as
          | PersistencePathInfo
          | null;
      const normalizedInfo =
        updatedInfo && typeof updatedInfo === "object"
          ? (updatedInfo as PersistencePathInfo)
          : null;

      setPersistencePathInfo(normalizedInfo);
      if (normalizedInfo?.cancelled) return;

      setPersistencePathFeedback({
        type: "success",
        message: t("da_settings_storage_choose_saved"),
      });
    } catch (error) {
      setPersistencePathFeedback({
        type: "error",
        message: t("da_settings_storage_choose_failed", {
          error: getErrorMessage(error) || t("unknownError"),
        }),
      });
    } finally {
      setPersistencePathSaving(false);
    }
  }, [t]);

  useEffect(() => {
    if (activePage !== "settings") return;

    if (!deviceAnalysisSettingsLoaded) {
      setOriginPathLoading(true);
      return;
    }

    if (settingsOriginExePath) {
      setOriginExePath(settingsOriginExePath);
      setOriginPathLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      const bridge = getDesktopOriginBridge();
      if (!isWindowsDesktopShell || !bridge) {
        if (cancelled) return;
        setOriginExePath("");
        setOriginPathLoading(false);
        return;
      }

      if (originPathRequested) {
        setOriginPathLoading(false);
        return;
      }

      setOriginPathRequested(true);
      setOriginPathLoading(true);

      try {
        const configuredPath = await getOriginExePathWithTimeout(bridge);
        if (cancelled) return;

        const normalizedPath = normalizeTrimmedString(configuredPath);
        setOriginExePath(normalizedPath);
        if (normalizedPath) {
          setDeviceAnalysisSettings((prev) => ({
            ...(prev || {}),
            originExePath: normalizedPath,
          }));
        }
      } catch {
        if (cancelled) return;
        setOriginExePath("");
      } finally {
        if (!cancelled) {
          setOriginPathLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activePage,
    deviceAnalysisSettingsLoaded,
    getDesktopOriginBridge,
    isWindowsDesktopShell,
    originPathRequested,
    settingsOriginExePath,
  ]);

  const handleChooseOriginExePath = useCallback(async () => {
    const bridge = getDesktopOriginBridge();
    if (!bridge) return;

    setOriginPathSaving(true);
    setOriginPathFeedback(IDLE_FEEDBACK);

    try {
      const pickedPath = await bridge.pickOriginExePath();
      const nextPath = normalizeTrimmedString(pickedPath);
      if (nextPath) {
        setOriginExePath(nextPath);
        setDeviceAnalysisSettings((prev) => ({
          ...(prev || {}),
          originExePath: nextPath,
        }));
        setOriginPathFeedback({
          type: "success",
          message: t("da_settings_origin_choose_saved"),
        });
      }
    } catch (error) {
      setOriginPathFeedback({
        type: "error",
        message: t("da_settings_origin_choose_failed", {
          error: getErrorMessage(error) || t("unknownError"),
        }),
      });
    } finally {
      setOriginPathSaving(false);
    }
  }, [getDesktopOriginBridge, t]);

  const handleCheckOriginHealth = useCallback(async () => {
    const bridge = getDesktopOriginBridge();
    if (!bridge || typeof bridge.checkOriginHealth !== "function") return;

    setOriginHealthChecking(true);
    setOriginPathFeedback(IDLE_FEEDBACK);

    try {
      const health = await bridge.checkOriginHealth({
        path: originExePath || undefined,
      });

      const nextPath = normalizeTrimmedString(health?.originExePath);
      if (nextPath) {
        setOriginExePath(nextPath);
        setDeviceAnalysisSettings((prev) => ({
          ...(prev || {}),
          originExePath: nextPath,
        }));
      }

      const successMessage = buildOriginLogMessage(
        t("da_settings_origin_check_success"),
        health?.logPath,
        t,
      );

      setOriginPathFeedback({
        type: "success",
        message: successMessage,
      });
    } catch (error) {
      const detail = formatOriginBridgeError(t, error);

      if (detail.code === "ORIGIN_EXE_REQUIRED") {
        setOriginPathFeedback({
          type: "error",
          message: t("da_origin_pick_exe_required"),
        });
      } else {
        setOriginPathFeedback({
          type: "error",
          message: t("da_settings_origin_check_failed", {
            error: detail.messageText,
          }),
        });
      }
    } finally {
      setOriginHealthChecking(false);
    }
  }, [getDesktopOriginBridge, originExePath, t]);

  const handleRunOriginBatch = useCallback(async () => {
    const bridge = getDesktopOriginBridge();
    if (!bridge || typeof bridge.runOriginBatch !== "function") return;

    setOriginBatchRunning(true);
    setOriginPathFeedback(IDLE_FEEDBACK);

    try {
      const result = await bridge.runOriginBatch({
        allowPickInputDir: true,
        plot: originPlotConfig,
      });
      const summary = normalizeOriginBatchSummary(result?.summary);

      const baseMessage = t("da_settings_origin_batch_success", {
        failed: summary.failed,
        success: summary.succeeded,
        total: summary.total,
      });
      const resultMessage = buildOriginLogMessage(baseMessage, result?.logPath, t);

      setOriginPathFeedback({
        type: summary.failed > 0 ? "error" : "success",
        message: resultMessage,
      });
    } catch (error) {
      const detail = formatOriginBridgeError(t, error);

      if (detail.code === "ORIGIN_BATCH_INPUT_DIR_REQUIRED") {
        setOriginPathFeedback({
          type: "error",
          message: t("da_origin_batch_pick_dir_required"),
        });
      } else if (detail.code === "ORIGIN_EXE_REQUIRED") {
        setOriginPathFeedback({
          type: "error",
          message: t("da_origin_pick_exe_required"),
        });
      } else {
        setOriginPathFeedback({
          type: "error",
          message: t("da_settings_origin_batch_failed", {
            error: detail.messageText,
          }),
        });
      }
    } finally {
      setOriginBatchRunning(false);
    }
  }, [getDesktopOriginBridge, originPlotConfig, t]);

  const updateOriginCleanupSetting = useCallback(
    async (updates: unknown) => {
      const patch = updates && typeof updates === "object" ? updates : null;
      if (!patch) return;

      setOriginCleanupSaving(true);
      setOriginCleanupFeedback(IDLE_FEEDBACK);
      try {
        await handleUpdateDeviceAnalysisSettings(patch);
        setOriginCleanupFeedback({
          type: "success",
          message: t("da_settings_origin_cleanup_saved"),
        });
      } catch (error) {
        setOriginCleanupFeedback({
          type: "error",
          message: t("da_settings_origin_cleanup_save_failed", {
            error: getErrorMessage(error) || t("unknownError"),
          }),
        });
      } finally {
        setOriginCleanupSaving(false);
      }
    },
    [handleUpdateDeviceAnalysisSettings, t],
  );

  const handleSetOriginCleanupEnabled = useCallback(
    async (nextEnabled: unknown) => {
      await updateOriginCleanupSetting({
        originRuntimeCleanupEnabled: Boolean(nextEnabled),
      });
    },
    [updateOriginCleanupSetting],
  );

  const handleSetOriginKeepSuccessJobs = useCallback(
    async (nextValue: unknown) => {
      const normalized = normalizeBoundedInt(
        nextValue,
        ORIGIN_CLEANUP_DEFAULTS.keepSuccessJobs,
        0,
        100,
      );
      await updateOriginCleanupSetting({
        originRuntimeKeepSuccessJobs: normalized,
      });
    },
    [updateOriginCleanupSetting],
  );

  const handleSetOriginFailedRetentionDays = useCallback(
    async (nextValue: unknown) => {
      const normalized = normalizeBoundedInt(
        nextValue,
        ORIGIN_CLEANUP_DEFAULTS.failedRetentionDays,
        1,
        365,
      );
      await updateOriginCleanupSetting({
        originRuntimeFailedRetentionDays: normalized,
      });
    },
    [updateOriginCleanupSetting],
  );

  const updateOriginPlotSetting = useCallback(
    async (updates: unknown) => {
      const patch = updates && typeof updates === "object" ? updates : null;
      if (!patch) return;

      setOriginPlotSaving(true);
      setOriginPlotFeedback(IDLE_FEEDBACK);
      try {
        await handleUpdateDeviceAnalysisSettings(patch);
        setOriginPlotFeedback({
          type: "success",
          message: t("da_settings_origin_plot_saved"),
        });
      } catch (error) {
        setOriginPlotFeedback({
          type: "error",
          message: t("da_settings_origin_plot_save_failed", {
            error: getErrorMessage(error) || t("unknownError"),
          }),
        });
      } finally {
        setOriginPlotSaving(false);
      }
    },
    [handleUpdateDeviceAnalysisSettings, t],
  );

  const handleSetOriginPlotType = useCallback(
    async (nextValue: unknown) => {
      const normalized = normalizeOriginPlotOptions(
        { type: nextValue },
        DEFAULT_ORIGIN_PLOT_OPTIONS,
      );
      await updateOriginPlotSetting({
        originPlotTypeDefault: normalized.type,
      });
    },
    [updateOriginPlotSetting],
  );

  const handleSetOriginPlotXyPairs = useCallback(
    async (nextValue: unknown) => {
      const normalized = normalizeOriginPlotOptions(
        { xyPairs: nextValue },
        DEFAULT_ORIGIN_PLOT_OPTIONS,
      );
      await updateOriginPlotSetting({
        originPlotXyPairsDefault: normalized.xyPairs,
      });
    },
    [updateOriginPlotSetting],
  );

  const handleSetOriginPlotLineWidth = useCallback(
    async (nextValue: unknown) => {
      const normalized = normalizeOriginPlotOptions(
        { lineWidth: nextValue },
        DEFAULT_ORIGIN_PLOT_OPTIONS,
      );
      await updateOriginPlotSetting({
        originPlotLineWidthDefault: normalized.lineWidth,
      });
    },
    [updateOriginPlotSetting],
  );

  const handleSetOriginPlotCommand = useCallback(
    async (nextValue: unknown) => {
      const normalized = normalizeOriginPlotOptions({
        command: typeof nextValue === "string" ? nextValue.trim() : "",
      });
      await updateOriginPlotSetting({
        originPlotCommandDefault: normalized.command,
      });
    },
    [updateOriginPlotSetting],
  );

  const handleSetOriginPostPlotCommands = useCallback(
    async (nextValue: unknown) => {
      const commands = normalizeOriginPostCommands(nextValue);
      await updateOriginPlotSetting({
        originPlotPostCommandsDefault: commands,
      });
    },
    [updateOriginPlotSetting],
  );

  const handleRunOriginCleanupNow = useCallback(async () => {
    const bridge = getDesktopOriginBridge();
    if (!bridge || typeof bridge.runOriginRuntimeCleanup !== "function") return;

    setOriginCleanupRunning(true);
    setOriginCleanupFeedback(IDLE_FEEDBACK);

    try {
      const result = await bridge.runOriginRuntimeCleanup();
      const removedTotal = Number(result?.removedTotal);
      const removedSafe =
        Number.isFinite(removedTotal) && removedTotal >= 0 ? removedTotal : 0;

      setOriginCleanupFeedback({
        type: "success",
        message: t("da_settings_origin_cleanup_run_success", {
          count: removedSafe,
        }),
      });
    } catch (error) {
      setOriginCleanupFeedback({
        type: "error",
        message: t("da_settings_origin_cleanup_run_failed", {
          error: getErrorMessage(error) || t("unknownError"),
        }),
      });
    } finally {
      setOriginCleanupRunning(false);
    }
  }, [getDesktopOriginBridge, t]);

  const storageSettings = useMemo(
    () => ({
      currentPath: String(persistencePathInfo?.currentPath ?? ""),
      feedback: persistencePathFeedback,
      isLoading: persistencePathLoading,
      isConfigurable:
        Boolean(persistencePathInfo) &&
        persistencePathInfo?.isConfigurable !== false,
      isSaving: persistencePathSaving,
      onChoosePath: handleChoosePersistencePath,
    }),
    [
      handleChoosePersistencePath,
      persistencePathFeedback,
      persistencePathInfo,
      persistencePathLoading,
      persistencePathSaving,
    ],
  );

  const originBridge = getDesktopOriginBridge();

  const originSettings = useMemo(
    () => ({
      currentPath: String(originExePath ?? ""),
      cleanupEnabled: originCleanupConfig.enabled,
      cleanupFailedRetentionDays: originCleanupConfig.failedRetentionDays,
      cleanupFeedback: originCleanupFeedback,
      cleanupKeepSuccessJobs: originCleanupConfig.keepSuccessJobs,
      cleanupRunning: originCleanupRunning,
      cleanupSaving: originCleanupSaving,
      feedback: originPathFeedback,
      openPlotOptions: originPlotConfig,
      plotCommand: originPlotConfig.command,
      plotFeedback: originPlotFeedback,
      plotPostCommandsText: originPostCommandsToMultiline(
        originPlotConfig.postCommands,
      ),
      plotSaving: originPlotSaving,
      plotType: originPlotConfig.type,
      plotLineWidth: originPlotConfig.lineWidth,
      plotXyPairs: originPlotConfig.xyPairs,
      isBatchAvailable:
        isWindowsDesktopShell &&
        Boolean(originBridge) &&
        typeof originBridge?.runOriginBatch === "function",
      isBatchRunning: originBatchRunning,
      isConfigurable: isWindowsDesktopShell && Boolean(originBridge),
      isHealthCheckAvailable:
        isWindowsDesktopShell &&
        Boolean(originBridge) &&
        typeof originBridge?.checkOriginHealth === "function",
      isCleanupAvailable:
        isWindowsDesktopShell &&
        Boolean(originBridge) &&
        typeof originBridge?.runOriginRuntimeCleanup === "function",
      isHealthChecking: originHealthChecking,
      isLoading: originPathLoading,
      isSaving: originPathSaving,
      onCheckHealth: handleCheckOriginHealth,
      onChoosePath: handleChooseOriginExePath,
      onCleanupEnabledChange: handleSetOriginCleanupEnabled,
      onCleanupFailedRetentionDaysChange: handleSetOriginFailedRetentionDays,
      onCleanupKeepSuccessJobsChange: handleSetOriginKeepSuccessJobs,
      onPlotCommandChange: handleSetOriginPlotCommand,
      onPlotPostCommandsChange: handleSetOriginPostPlotCommands,
      onPlotTypeChange: handleSetOriginPlotType,
      onPlotLineWidthChange: handleSetOriginPlotLineWidth,
      onPlotXyPairsChange: handleSetOriginPlotXyPairs,
      onRunCleanupNow: handleRunOriginCleanupNow,
      onRunBatch: handleRunOriginBatch,
    }),
    [
      handleRunOriginCleanupNow,
      handleCheckOriginHealth,
      handleChooseOriginExePath,
      handleSetOriginCleanupEnabled,
      handleSetOriginFailedRetentionDays,
      handleSetOriginKeepSuccessJobs,
      handleSetOriginPlotCommand,
      handleSetOriginPostPlotCommands,
      handleSetOriginPlotType,
      handleSetOriginPlotLineWidth,
      handleSetOriginPlotXyPairs,
      handleRunOriginBatch,
      isWindowsDesktopShell,
      originCleanupConfig.enabled,
      originCleanupConfig.failedRetentionDays,
      originCleanupConfig.keepSuccessJobs,
      originCleanupFeedback,
      originCleanupRunning,
      originCleanupSaving,
      originBatchRunning,
      originBridge,
      originExePath,
      originPlotConfig,
      originPlotFeedback,
      originPlotSaving,
      originHealthChecking,
      originPathFeedback,
      originPathLoading,
      originPathSaving,
    ],
  );

  return {
    deviceAnalysisSettings,
    handleLanguageChange,
    handleUpdateDeviceAnalysisSettings,
    originOpenPlotOptions: originPlotConfig,
    originSettings,
    storageSettings,
  };
};
