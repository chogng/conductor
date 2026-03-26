import { useCallback, useEffect, useMemo, useState } from "react";
import { formatOriginBridgeError } from "../analysis/lib/originBridgeError";
import { apiService } from "../analysis/services/apiService";
import {
  DEFAULT_ORIGIN_PLOT_OPTIONS,
  normalizeOriginPlotOptions,
  normalizeOriginPostCommands,
  originPostCommandsToMultiline,
} from "../analysis/lib/originPlotOptions";
import type { Feedback } from "../shared/lib/sharedTypes";
import type { LooseTranslateFn as TranslateFn } from "../shared/lib/translateTypes";
import {
  getDesktopOriginBridge,
  getErrorMessage,
  getOriginExePathWithTimeout,
  IDLE_FEEDBACK,
  normalizeBoundedInt,
  normalizeTrimmedString,
  ORIGIN_CLEANUP_DEFAULTS,
  toPersistencePathInfo,
  type DeviceAnalysisSettings,
} from "./deviceAnalysisSettingsShared";

type UseDeviceAnalysisSettingsOptions = {
  deviceAnalysisSettings: DeviceAnalysisSettings | null;
  deviceAnalysisSettingsLoaded: boolean;
  handleUpdateDeviceAnalysisSettings: (
    updates: unknown,
  ) => Promise<DeviceAnalysisSettings | null>;
  isWindowsDesktopShell: boolean;
  mergeDeviceAnalysisSettings: (
    nextSettings: DeviceAnalysisSettings | null,
  ) => void;
  t: TranslateFn;
};

export const useDeviceAnalysisSettings = ({
  deviceAnalysisSettings,
  deviceAnalysisSettingsLoaded,
  handleUpdateDeviceAnalysisSettings,
  isWindowsDesktopShell,
  mergeDeviceAnalysisSettings,
  t,
}: UseDeviceAnalysisSettingsOptions) => {
  const [persistencePathInfo, setPersistencePathInfo] = useState<{
    cancelled?: boolean;
    currentPath?: string;
    isConfigurable?: boolean;
    [key: string]: unknown;
  } | null>(null);
  const [persistencePathLoading, setPersistencePathLoading] = useState(false);
  const [persistencePathSaving, setPersistencePathSaving] = useState(false);
  const [persistencePathFeedback, setPersistencePathFeedback] =
    useState<Feedback>(IDLE_FEEDBACK);

  const [originExePath, setOriginExePath] = useState("");
  const [originPathRequested, setOriginPathRequested] = useState(false);
  const [originPathLoading, setOriginPathLoading] = useState(true);
  const [originPathSaving, setOriginPathSaving] = useState(false);
  const [originHealthChecking, setOriginHealthChecking] = useState(false);
  const [originPathFeedback, setOriginPathFeedback] =
    useState<Feedback>(IDLE_FEEDBACK);
  const [originCleanupSaving, setOriginCleanupSaving] = useState(false);
  const [originCleanupRunning, setOriginCleanupRunning] = useState(false);
  const [originCleanupFeedback, setOriginCleanupFeedback] =
    useState<Feedback>(IDLE_FEEDBACK);
  const [originPlotSaving, setOriginPlotSaving] = useState(false);
  const [originPlotFeedback, setOriginPlotFeedback] =
    useState<Feedback>(IDLE_FEEDBACK);

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

    (async () => {
      setPersistencePathLoading(true);
      try {
        const info = await apiService.getDeviceAnalysisPersistencePath();
        if (cancelled) return;

        const normalizedInfo = toPersistencePathInfo(info);
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
  }, [t]);

  useEffect(() => {
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
          mergeDeviceAnalysisSettings({
            originExePath: normalizedPath,
          });
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
    deviceAnalysisSettingsLoaded,
    isWindowsDesktopShell,
    mergeDeviceAnalysisSettings,
    originPathRequested,
    settingsOriginExePath,
  ]);

  const handleChoosePersistencePath = useCallback(async () => {
    setPersistencePathSaving(true);
    setPersistencePathFeedback(IDLE_FEEDBACK);

    try {
      const normalizedInfo = toPersistencePathInfo(
        await apiService.chooseDeviceAnalysisPersistencePath(),
      );

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
        mergeDeviceAnalysisSettings({
          originExePath: nextPath,
        });
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
  }, [mergeDeviceAnalysisSettings, t]);

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
        mergeDeviceAnalysisSettings({
          originExePath: nextPath,
        });
      }

      setOriginPathFeedback({
        type: "success",
        message: t("da_settings_origin_check_success"),
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
  }, [mergeDeviceAnalysisSettings, originExePath, t]);

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
  }, [t]);

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
    }),
    [
      handleCheckOriginHealth,
      handleChooseOriginExePath,
      handleRunOriginCleanupNow,
      handleSetOriginCleanupEnabled,
      handleSetOriginFailedRetentionDays,
      handleSetOriginKeepSuccessJobs,
      handleSetOriginPlotCommand,
      handleSetOriginPlotLineWidth,
      handleSetOriginPlotType,
      handleSetOriginPlotXyPairs,
      handleSetOriginPostPlotCommands,
      isWindowsDesktopShell,
      originBridge,
      originCleanupConfig.enabled,
      originCleanupConfig.failedRetentionDays,
      originCleanupConfig.keepSuccessJobs,
      originCleanupFeedback,
      originCleanupRunning,
      originCleanupSaving,
      originExePath,
      originHealthChecking,
      originPathFeedback,
      originPathLoading,
      originPathSaving,
      originPlotConfig,
      originPlotFeedback,
      originPlotSaving,
    ],
  );

  return {
    originSettings,
    storageSettings,
  };
};
