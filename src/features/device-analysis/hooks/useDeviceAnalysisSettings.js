import { useCallback, useEffect, useMemo, useState } from "react";
import { formatOriginBridgeError } from "../lib/originBridgeError";
import { apiService } from "../services/apiService";

const IDLE_FEEDBACK = { type: "idle", message: "" };

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
}) => {
  const [deviceAnalysisSettings, setDeviceAnalysisSettings] = useState(null);
  const [persistencePathInfo, setPersistencePathInfo] = useState(null);
  const [persistencePathRequested, setPersistencePathRequested] = useState(false);
  const [persistencePathSaving, setPersistencePathSaving] = useState(false);
  const [persistencePathFeedback, setPersistencePathFeedback] =
    useState(IDLE_FEEDBACK);

  const [originExePath, setOriginExePath] = useState("");
  const [originPathRequested, setOriginPathRequested] = useState(false);
  const [originPathLoading, setOriginPathLoading] = useState(true);
  const [originPathSaving, setOriginPathSaving] = useState(false);
  const [originHealthChecking, setOriginHealthChecking] = useState(false);
  const [originBatchRunning, setOriginBatchRunning] = useState(false);
  const [originPathFeedback, setOriginPathFeedback] = useState(IDLE_FEEDBACK);

  const handleUpdateDeviceAnalysisSettings = useCallback(
    async (updates) => {
      const patch = updates && typeof updates === "object" ? updates : null;
      if (!patch) return null;

      const updated = await apiService.updateDeviceAnalysisSettings(patch);
      setDeviceAnalysisSettings((prev) => ({
        ...(prev || {}),
        ...(updated || {}),
      }));

      return updated;
    },
    [],
  );

  const handleLanguageChange = useCallback(
    async (nextLanguage) => {
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

  const getDesktopOriginBridge = useCallback(() => {
    if (typeof window === "undefined") return null;

    const bridge = window.desktopOrigin;
    if (!bridge || typeof bridge !== "object") return null;
    if (typeof bridge.getOriginExePath !== "function") return null;
    if (typeof bridge.pickOriginExePath !== "function") return null;

    return bridge;
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const settings = await apiService.getDeviceAnalysisSettings();
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
    if (activePage !== "settings" || persistencePathRequested) return;

    setPersistencePathRequested(true);
    let cancelled = false;

    (async () => {
      try {
        const info = await apiService.getDeviceAnalysisPersistencePath();
        if (cancelled) return;

        const normalizedInfo = info && typeof info === "object" ? info : null;
        setPersistencePathInfo(normalizedInfo);
      } catch {
        if (cancelled) return;
        setPersistencePathInfo(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activePage, persistencePathRequested]);

  const handleChoosePersistencePath = useCallback(async () => {
    setPersistencePathSaving(true);
    setPersistencePathFeedback(IDLE_FEEDBACK);

    try {
      const updatedInfo = await apiService.chooseDeviceAnalysisPersistencePath();
      const normalizedInfo =
        updatedInfo && typeof updatedInfo === "object" ? updatedInfo : null;

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
          error: error?.message || t("unknownError"),
        }),
      });
    } finally {
      setPersistencePathSaving(false);
    }
  }, [t]);

  useEffect(() => {
    if (activePage !== "settings" || originPathRequested) return;

    setOriginPathRequested(true);
    let cancelled = false;

    (async () => {
      setOriginPathLoading(true);

      const bridge = getDesktopOriginBridge();
      if (!isWindowsDesktopShell || !bridge) {
        if (cancelled) return;
        setOriginExePath("");
        setOriginPathLoading(false);
        return;
      }

      try {
        const configuredPath = await bridge.getOriginExePath();
        if (cancelled) return;

        setOriginExePath(
          typeof configuredPath === "string" && configuredPath.trim()
            ? configuredPath.trim()
            : "",
        );
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
    getDesktopOriginBridge,
    isWindowsDesktopShell,
    originPathRequested,
  ]);

  const handleChooseOriginExePath = useCallback(async () => {
    const bridge = getDesktopOriginBridge();
    if (!bridge) return;

    setOriginPathSaving(true);
    setOriginPathFeedback(IDLE_FEEDBACK);

    try {
      const pickedPath = await bridge.pickOriginExePath();
      if (typeof pickedPath === "string" && pickedPath.trim()) {
        setOriginExePath(pickedPath.trim());
        setOriginPathFeedback({
          type: "success",
          message: t("da_settings_origin_choose_saved"),
        });
      }
    } catch (error) {
      setOriginPathFeedback({
        type: "error",
        message: t("da_settings_origin_choose_failed", {
          error: error?.message || t("unknownError"),
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

      const nextPath =
        health && typeof health.originExePath === "string"
          ? health.originExePath.trim()
          : "";
      if (nextPath) {
        setOriginExePath(nextPath);
      }

      const successMessage = health?.logPath
        ? `${t("da_settings_origin_check_success")} ${t(
            "da_origin_error_log_path",
            { path: health.logPath },
          )}`
        : t("da_settings_origin_check_success");

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
      const result = await bridge.runOriginBatch({ allowPickInputDir: true });
      const summary =
        result?.summary && typeof result.summary === "object"
          ? result.summary
          : null;

      const total = Number(summary?.total);
      const succeeded = Number(summary?.succeeded);
      const failed = Number(summary?.failed);

      const totalSafe = Number.isFinite(total) && total >= 0 ? total : 0;
      const succeededSafe =
        Number.isFinite(succeeded) && succeeded >= 0 ? succeeded : 0;
      const failedSafe =
        Number.isFinite(failed) && failed >= 0
          ? failed
          : Math.max(0, totalSafe - succeededSafe);

      const baseMessage = t("da_settings_origin_batch_success", {
        failed: failedSafe,
        success: succeededSafe,
        total: totalSafe,
      });
      const resultMessage = result?.logPath
        ? `${baseMessage} ${t("da_origin_error_log_path", {
            path: result.logPath,
          })}`
        : baseMessage;

      setOriginPathFeedback({
        type: failedSafe > 0 ? "error" : "success",
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
  }, [getDesktopOriginBridge, t]);

  const storageSettings = useMemo(
    () => ({
      currentPath: String(persistencePathInfo?.currentPath ?? ""),
      feedback: persistencePathFeedback,
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
      persistencePathSaving,
    ],
  );

  const originBridge = getDesktopOriginBridge();

  const originSettings = useMemo(
    () => ({
      currentPath: String(originExePath ?? ""),
      feedback: originPathFeedback,
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
      isHealthChecking: originHealthChecking,
      isLoading: originPathLoading,
      isSaving: originPathSaving,
      onCheckHealth: handleCheckOriginHealth,
      onChoosePath: handleChooseOriginExePath,
      onRunBatch: handleRunOriginBatch,
    }),
    [
      handleCheckOriginHealth,
      handleChooseOriginExePath,
      handleRunOriginBatch,
      isWindowsDesktopShell,
      originBatchRunning,
      originBridge,
      originExePath,
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
    originSettings,
    storageSettings,
  };
};
