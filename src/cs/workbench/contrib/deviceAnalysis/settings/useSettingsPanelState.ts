import { useCallback, useEffect, useMemo, useState } from "react";
import type { ToastState } from "src/cs/workbench/contrib/deviceAnalysis/shared/lib/sharedTypes";
import type {
  AnalysisDefaultSettings,
  AppUpdateSettings,
  FileNameMatchingSettings,
  OriginSettings,
  SettingsSectionId,
} from "src/cs/workbench/contrib/deviceAnalysis/settings/settingsPanelTypes";
import type { TranslateFn } from "src/cs/platform/language/common/language";

type UseSettingsPanelStateParams = {
  analysisDefaultSettings: AnalysisDefaultSettings;
  appUpdateSettings: AppUpdateSettings;
  fileNameMatchingSettings: FileNameMatchingSettings;
  originSettings: OriginSettings;
  t: TranslateFn;
};

export const useSettingsPanelState = ({
  analysisDefaultSettings,
  appUpdateSettings,
  fileNameMatchingSettings,
  originSettings,
  t,
}: UseSettingsPanelStateParams) => {
  const cleanupEnabledOptions = useMemo(
    () => [
      { value: "true", label: t("da_settings_origin_cleanup_enable_on") },
      { value: "false", label: t("da_settings_origin_cleanup_enable_off") },
    ],
    [t],
  );
  const cleanupKeepSuccessOptions = useMemo(
    () => [
      { value: "0", label: `0 (${t("common_clear")})` },
      { value: "1", label: "1" },
      { value: "3", label: "3" },
      { value: "5", label: "5" },
      { value: "10", label: "10" },
    ],
    [t],
  );
  const cleanupFailedDaysOptions = useMemo(
    () => [
      { value: "1", label: "1" },
      { value: "3", label: "3" },
      { value: "7", label: "7" },
      { value: "14", label: "14" },
      { value: "30", label: "30" },
    ],
    [],
  );
  const themeModeOptions = useMemo(
    () => [
      { value: "system", label: t("da_settings_theme_system") },
      { value: "light", label: t("da_settings_theme_light") },
      { value: "dark", label: t("da_settings_theme_dark") },
    ],
    [t],
  );
  const windowCloseBehaviorOptions = useMemo(
    () => [
      {
        value: "minimizeToTray",
        label: t("da_settings_close_behavior_minimize_to_tray"),
      },
      { value: "quit", label: t("da_settings_close_behavior_quit") },
    ],
    [t],
  );
  const yScaleOptions = useMemo(
    () => [
      { value: "linear", label: t("da_settings_y_scale_linear") },
      { value: "log", label: t("da_settings_y_scale_log") },
    ],
    [t],
  );
  const settingsSections = useMemo(
    () => [
      { id: "general" as const, label: t("da_settings_nav_general") },
      { id: "origin" as const, label: t("da_settings_nav_origin") },
      { id: "about" as const, label: t("da_settings_nav_about") },
    ],
    [t],
  );

  const [xyPairsDraft, setXyPairsDraft] = useState(originSettings.plotXyPairs ?? "");
  const [plotCommandDraft, setPlotCommandDraft] = useState(
    originSettings.plotCommand ?? "",
  );
  const [postCommandsDraft, setPostCommandsDraft] = useState(
    originSettings.plotPostCommandsText ?? "",
  );
  const [fileNameFieldSeparatorsDraft, setFileNameFieldSeparatorsDraft] =
    useState(fileNameMatchingSettings.fieldSeparators ?? "");
  const [tickLabelFontSizeDraft, setTickLabelFontSizeDraft] = useState(
    String(analysisDefaultSettings.tickLabelFontSize ?? ""),
  );
  const [axisTitleFontSizeDraft, setAxisTitleFontSizeDraft] = useState(
    String(analysisDefaultSettings.axisTitleFontSize ?? ""),
  );
  const [legendFontSizeDraft, setLegendFontSizeDraft] = useState(
    String(analysisDefaultSettings.legendFontSize ?? ""),
  );
  const [appUpdateChecking, setAppUpdateChecking] = useState(false);
  const [activeSettingsSection, setActiveSettingsSection] =
    useState<SettingsSectionId>("general");
  const [originHealthToast, setOriginHealthToast] = useState<ToastState>({
    isVisible: false,
    message: "",
    type: "success",
  });
  const [cleanupToast, setCleanupToast] = useState<ToastState>({
    isVisible: false,
    message: "",
    type: "success",
  });

  useEffect(() => {
    setXyPairsDraft(originSettings.plotXyPairs ?? "");
  }, [originSettings.plotXyPairs]);

  useEffect(() => {
    setPlotCommandDraft(originSettings.plotCommand ?? "");
  }, [originSettings.plotCommand]);

  useEffect(() => {
    setPostCommandsDraft(originSettings.plotPostCommandsText ?? "");
  }, [originSettings.plotPostCommandsText]);

  useEffect(() => {
    setFileNameFieldSeparatorsDraft(fileNameMatchingSettings.fieldSeparators ?? "");
  }, [fileNameMatchingSettings.fieldSeparators]);

  useEffect(() => {
    setTickLabelFontSizeDraft(String(analysisDefaultSettings.tickLabelFontSize ?? ""));
  }, [analysisDefaultSettings.tickLabelFontSize]);

  useEffect(() => {
    setAxisTitleFontSizeDraft(String(analysisDefaultSettings.axisTitleFontSize ?? ""));
  }, [analysisDefaultSettings.axisTitleFontSize]);

  useEffect(() => {
    setLegendFontSizeDraft(String(analysisDefaultSettings.legendFontSize ?? ""));
  }, [analysisDefaultSettings.legendFontSize]);

  useEffect(() => {
    const feedback = originSettings.feedback;
    if (!feedback?.message || feedback.type === "idle") {
      return;
    }

    setOriginHealthToast({
      isVisible: true,
      message: feedback.message,
      type: feedback.type === "error" ? "error" : "success",
    });
  }, [originSettings.feedback?.message, originSettings.feedback?.type]);

  useEffect(() => {
    const feedback = originSettings.cleanupFeedback;
    if (!feedback?.message || feedback.type === "idle") {
      return;
    }

    setCleanupToast({
      isVisible: true,
      message: feedback.message,
      type: feedback.type === "error" ? "error" : "success",
    });
  }, [
    originSettings.cleanupFeedback?.message,
    originSettings.cleanupFeedback?.type,
  ]);

  const closeOriginHealthToast = useCallback(() => {
    setOriginHealthToast((prev) => ({ ...prev, isVisible: false }));
  }, []);

  const closeCleanupToast = useCallback(() => {
    setCleanupToast((prev) => ({ ...prev, isVisible: false }));
  }, []);

  const handleCheckForUpdates = useCallback(() => {
    void (async () => {
      setAppUpdateChecking(true);
      try {
        await appUpdateSettings.onCheckForUpdates();
      } catch {
        // Update check result is shown by desktop shell dialogs.
      } finally {
        setAppUpdateChecking(false);
      }
    })();
  }, [appUpdateSettings]);

  return {
    activeSettingsSection,
    appUpdateChecking,
    axisTitleFontSizeDraft,
    cleanupEnabledOptions,
    cleanupFailedDaysOptions,
    cleanupKeepSuccessOptions,
    cleanupToast,
    closeCleanupToast,
    closeOriginHealthToast,
    fileNameFieldSeparatorsDraft,
    handleCheckForUpdates,
    legendFontSizeDraft,
    originHealthToast,
    plotCommandDraft,
    postCommandsDraft,
    setActiveSettingsSection,
    setAxisTitleFontSizeDraft,
    setFileNameFieldSeparatorsDraft,
    setLegendFontSizeDraft,
    setPlotCommandDraft,
    setPostCommandsDraft,
    setTickLabelFontSizeDraft,
    setXyPairsDraft,
    settingsSections,
    themeModeOptions,
    tickLabelFontSizeDraft,
    windowCloseBehaviorOptions,
    xyPairsDraft,
    yScaleOptions,
  };
};
