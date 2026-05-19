import { useCallback, useEffect, useRef, useState } from "react";
import Card from "cs/base/browser/ui/Card/Card";
import Button from "cs/base/browser/ui/Button/Button";
import Input from "cs/base/browser/ui/Input/Input";
import DropdownField from "cs/base/browser/ui/DropdownField/DropdownField";
import Toast from "cs/base/browser/ui/Toast/Toast";
import type { LanguageCode } from "src/cs/platform/language/common/language";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import type { ThemeMode } from "src/cs/workbench/common/theme";
import type { Feedback, ToastState } from "../shared/lib/sharedTypes";
import { DEFAULT_FILE_NAME_FIELD_SEPARATORS } from "../shared/lib/fileNameFieldMatching";

type OriginSettings = {
  currentPath: string;
  cleanupEnabled: boolean;
  cleanupFailedRetentionDays: number;
  cleanupFeedback?: Feedback;
  cleanupKeepSuccessJobs: number;
  cleanupRunning: boolean;
  cleanupSaving: boolean;
  feedback: Feedback;
  isConfigurable: boolean;
  isHealthCheckAvailable: boolean;
  isCleanupAvailable: boolean;
  isHealthChecking: boolean;
  isLoading: boolean;
  plotCommand: string;
  plotFeedback?: Feedback;
  plotPostCommandsText: string;
  plotSaving: boolean;
  plotType: number;
  plotLineWidth: number;
  plotXyPairs: string;
  isSaving: boolean;
  onCheckHealth: () => Promise<void> | void;
  onChoosePath: () => Promise<void> | void;
  onCleanupEnabledChange: (enabled: boolean) => Promise<void> | void;
  onCleanupFailedRetentionDaysChange: (
    value: string | number,
  ) => Promise<void> | void;
  onCleanupKeepSuccessJobsChange: (
    value: string | number,
  ) => Promise<void> | void;
  onPlotCommandChange: (value: string) => Promise<void> | void;
  onPlotPostCommandsChange: (value: string) => Promise<void> | void;
  onPlotTypeChange: (value: string | number) => Promise<void> | void;
  onPlotLineWidthChange: (value: string | number) => Promise<void> | void;
  onPlotXyPairsChange: (value: string) => Promise<void> | void;
  onRunCleanupNow: () => Promise<void> | void;
};

type StorageSettings = {
  currentPath: string;
  feedback: Feedback;
  isLoading: boolean;
  isConfigurable: boolean;
  isSaving: boolean;
  onChoosePath: () => Promise<void> | void;
};

type AppUpdateSettings = {
  currentVersion?: string | null;
  isAvailable: boolean;
  onCheckForUpdates: () => boolean | Promise<boolean>;
};

type WindowCloseSettings = {
  behavior: "minimizeToTray" | "quit";
  isSaving: boolean;
  onBehaviorChange: (
    behavior: "minimizeToTray" | "quit",
  ) => Promise<void> | void;
};

type FileNameMatchingSettings = {
  feedback: Feedback;
  fieldSeparators: string;
  isSaving: boolean;
  onFieldSeparatorsChange: (value: string) => Promise<void> | void;
};

type AnalysisDefaultSettings = {
  defaultYScaleForCf: "linear" | "log";
  defaultYScaleForCv: "linear" | "log";
  defaultYScaleForOutput: "linear" | "log";
  defaultYScaleForPv: "linear" | "log";
  defaultYScaleForTransfer: "linear" | "log";
  tickLabelFontSize: number | "";
  axisTitleFontSize: number | "";
  legendFontSize: number | "";
  feedback: Feedback;
  isSaving: boolean;
  onDefaultYScaleForCfChange: (value: string) => Promise<void> | void;
  onDefaultYScaleForCvChange: (value: string) => Promise<void> | void;
  onDefaultYScaleForOutputChange: (value: string) => Promise<void> | void;
  onDefaultYScaleForPvChange: (value: string) => Promise<void> | void;
  onDefaultYScaleForTransferChange: (value: string) => Promise<void> | void;
  onTickLabelFontSizeChange: (value: string | number) => Promise<void> | void;
  onAxisTitleFontSizeChange: (value: string | number) => Promise<void> | void;
  onLegendFontSizeChange: (value: string | number) => Promise<void> | void;
};

type OnboardingSettings = {
  onOpenGuide: () => void;
};

type SettingsPanelProps = {
  appUpdateSettings: AppUpdateSettings;
  analysisDefaultSettings: AnalysisDefaultSettings;
  fileNameMatchingSettings: FileNameMatchingSettings;
  language: LanguageCode;
  onLanguageChange: (language: LanguageCode) => Promise<void> | void;
  onboardingSettings: OnboardingSettings;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => Promise<void> | void;
  originSettings: OriginSettings;
  storageSettings: StorageSettings;
  windowCloseSettings: WindowCloseSettings;
  t: TranslateFn;
};

const feedbackClassName = (type: Feedback["type"]): string =>
  `text-sm ${type === "error" ? "text-red-500" : "text-emerald-600"}`;

type SettingsSectionId = "general" | "origin" | "about";

const SettingsPanel = ({
  appUpdateSettings,
  analysisDefaultSettings,
  fileNameMatchingSettings,
  language,
  onLanguageChange,
  onboardingSettings,
  theme,
  onThemeChange,
  originSettings,
  storageSettings,
  windowCloseSettings,
  t,
}: SettingsPanelProps) => {
  const settingsSectionRef = useRef<HTMLElement | null>(null);
  const cleanupEnabledOptions = [
    { value: "true", label: t("da_settings_origin_cleanup_enable_on") },
    { value: "false", label: t("da_settings_origin_cleanup_enable_off") },
  ];
  const cleanupKeepSuccessOptions = [
    { value: "0", label: `0 (${t("common_clear")})` },
    { value: "1", label: "1" },
    { value: "3", label: "3" },
    { value: "5", label: "5" },
    { value: "10", label: "10" },
  ];
  const cleanupFailedDaysOptions = [
    { value: "1", label: "1" },
    { value: "3", label: "3" },
    { value: "7", label: "7" },
    { value: "14", label: "14" },
    { value: "30", label: "30" },
  ];
  const themeModeOptions = [
    { value: "system", label: t("da_settings_theme_system") },
    { value: "light", label: t("da_settings_theme_light") },
    { value: "dark", label: t("da_settings_theme_dark") },
  ];
  const windowCloseBehaviorOptions = [
    {
      value: "minimizeToTray",
      label: t("da_settings_close_behavior_minimize_to_tray"),
    },
    { value: "quit", label: t("da_settings_close_behavior_quit") },
  ];
  const yScaleOptions = [
    { value: "linear", label: t("da_settings_y_scale_linear") },
    { value: "log", label: t("da_settings_y_scale_log") },
  ];
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

  const closeOriginHealthToast = useCallback(() => {
    setOriginHealthToast((prev) => ({ ...prev, isVisible: false }));
  }, []);

  const closeCleanupToast = useCallback(() => {
    setCleanupToast((prev) => ({ ...prev, isVisible: false }));
  }, []);

  const settingsSections: Array<{ id: SettingsSectionId; label: string }> = [
    { id: "general", label: t("da_settings_nav_general") },
    { id: "origin", label: t("da_settings_nav_origin") },
    { id: "about", label: t("da_settings_nav_about") },
  ];

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
    if (!feedback?.message || feedback.type === "idle") return;

    setOriginHealthToast({
      isVisible: true,
      message: feedback.message,
      type: feedback.type === "error" ? "error" : "success",
    });
  }, [originSettings.feedback?.message, originSettings.feedback?.type]);

  useEffect(() => {
    const feedback = originSettings.cleanupFeedback;
    if (!feedback?.message || feedback.type === "idle") return;

    setCleanupToast({
      isVisible: true,
      message: feedback.message,
      type: feedback.type === "error" ? "error" : "success",
    });
  }, [
    originSettings.cleanupFeedback?.message,
    originSettings.cleanupFeedback?.type,
  ]);

  return (
    <section
      ref={settingsSectionRef}
      aria-label={t("da_settings_section_aria_label")}
      className="relative"
    >
      <div className="grid min-h-0 grid-cols-[220px_minmax(0,1fr)] items-start gap-4">
        <aside
          aria-label={t("da_settings_nav_aria_label")}
          className="h-fit w-full min-w-0 rounded-lg border border-border bg-bg-surface p-2"
        >
          <nav className="grid grid-cols-1 gap-2">
            {settingsSections.map((section) => {
              const isActive = activeSettingsSection === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  className={`h-12 w-full min-w-0 overflow-hidden rounded-md px-3 py-2 text-left text-sm font-medium leading-5 transition-colors ${
                    isActive
                      ? "bg-text-primary text-bg-surface"
                      : "text-text-secondary hover:bg-bg-page hover:text-text-primary"
                  }`}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setActiveSettingsSection(section.id)}
                >
                  {section.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <Card id="analysis-settings-card" variant="panel" className="mb-4 overflow-hidden p-0">
          <div className="divide-y divide-border/60">
            {activeSettingsSection === "general" ? (
              <>
          <div id="analysis-settings-language-card" className="p-4">
            <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-text-primary">
              {t("da_settings_language_title")}
            </h3>
          </div>

              <div className="w-fit">
                <DropdownField
                  id="analysis-settings-language-dropdown"
                  menuId="analysis-settings-language-dropdown-menu"
                  value={language}
                  onChange={(value) => {
                    if (value === "zh" || value === "en") {
                      void onLanguageChange(value);
                    }
                  }}
                  options={[
                    { value: "zh", label: t("da_settings_language_zh") },
                    { value: "en", label: t("da_settings_language_en") },
                  ]}
                  className="w-fit da-neutral-select"
                  stableWidth
                />
              </div>
            </div>
          </div>

          <div id="analysis-settings-theme-card" className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-text-primary">
                  {t("da_settings_theme_title")}
                </h3>
              </div>

              <div className="w-fit">
                <DropdownField
                  id="analysis-settings-theme-dropdown"
                  menuId="analysis-settings-theme-dropdown-menu"
                  value={theme}
                  onChange={(value) => {
                    if (value === "system" || value === "light" || value === "dark") {
                      void onThemeChange(value);
                    }
                  }}
                  options={themeModeOptions}
                  className="w-fit da-neutral-select"
                  stableWidth
                />
              </div>
            </div>
          </div>

          <div id="analysis-settings-close-behavior-card" className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-text-primary">
                  {t("da_settings_close_behavior_title")}
                </h3>
              </div>

              <div className="w-fit">
                <DropdownField
                  id="analysis-settings-close-behavior-dropdown"
                  menuId="analysis-settings-close-behavior-dropdown-menu"
                  value={windowCloseSettings.behavior}
                  onChange={(value) => {
                    if (value === "minimizeToTray" || value === "quit") {
                      void windowCloseSettings.onBehaviorChange(value);
                    }
                  }}
                  options={windowCloseBehaviorOptions}
                  className="w-fit da-neutral-select"
                  stableWidth
                  disabled={windowCloseSettings.isSaving}
                />
              </div>
            </div>
          </div>

          <div id="analysis-settings-onboarding-card" className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-text-primary">
                  {t("da_settings_onboarding_title")}
                </h3>
              </div>

              <div className="flex w-fit justify-end">
                <Button
                  id="analysis-settings-onboarding-open-btn"
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-[38px] whitespace-nowrap"
                  onClick={onboardingSettings.onOpenGuide}
                >
                  {t("da_settings_onboarding_open_btn")}
                </Button>
              </div>
            </div>
          </div>

          <div id="analysis-settings-analysis-defaults-card" className="p-4 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-text-primary">
                {t("da_settings_analysis_defaults_title")}
              </h3>
            </div>

            <div className="grid grid-cols-5 gap-3">
              <div className="space-y-1">
                <p className="text-xs text-text-secondary">
                  {t("da_settings_analysis_defaults_transfer_curve")}
                </p>
                <DropdownField
                  id="analysis-settings-default-transfer-y-scale-select"
                  value={analysisDefaultSettings.defaultYScaleForTransfer}
                  onChange={(value) => {
                    void analysisDefaultSettings.onDefaultYScaleForTransferChange(String(value));
                  }}
                  options={yScaleOptions}
                  disabled={analysisDefaultSettings.isSaving}
                />
              </div>

              <div className="space-y-1">
                <p className="text-xs text-text-secondary">
                  {t("da_settings_analysis_defaults_output_curve")}
                </p>
                <DropdownField
                  id="analysis-settings-default-output-y-scale-select"
                  value={analysisDefaultSettings.defaultYScaleForOutput}
                  onChange={(value) => {
                    void analysisDefaultSettings.onDefaultYScaleForOutputChange(String(value));
                  }}
                  options={yScaleOptions}
                  disabled={analysisDefaultSettings.isSaving}
                />
              </div>

              <div className="space-y-1">
                <p className="text-xs text-text-secondary">
                  {t("da_settings_analysis_defaults_cv_curve")}
                </p>
                <DropdownField
                  id="analysis-settings-default-cv-y-scale-select"
                  value={analysisDefaultSettings.defaultYScaleForCv}
                  onChange={(value) => {
                    void analysisDefaultSettings.onDefaultYScaleForCvChange(String(value));
                  }}
                  options={yScaleOptions}
                  disabled={analysisDefaultSettings.isSaving}
                />
              </div>

              <div className="space-y-1">
                <p className="text-xs text-text-secondary">
                  {t("da_settings_analysis_defaults_cf_curve")}
                </p>
                <DropdownField
                  id="analysis-settings-default-cf-y-scale-select"
                  value={analysisDefaultSettings.defaultYScaleForCf}
                  onChange={(value) => {
                    void analysisDefaultSettings.onDefaultYScaleForCfChange(String(value));
                  }}
                  options={yScaleOptions}
                  disabled={analysisDefaultSettings.isSaving}
                />
              </div>

              <div className="space-y-1">
                <p className="text-xs text-text-secondary">
                  {t("da_settings_analysis_defaults_pv_curve")}
                </p>
                <DropdownField
                  id="analysis-settings-default-pv-y-scale-select"
                  value={analysisDefaultSettings.defaultYScaleForPv}
                  onChange={(value) => {
                    void analysisDefaultSettings.onDefaultYScaleForPvChange(String(value));
                  }}
                  options={yScaleOptions}
                  disabled={analysisDefaultSettings.isSaving}
                />
              </div>
            </div>

            {analysisDefaultSettings.feedback.message ? (
              <p className={feedbackClassName(analysisDefaultSettings.feedback.type)}>
                {analysisDefaultSettings.feedback.message}
              </p>
            ) : null}
          </div>

          <div id="analysis-settings-chart-defaults-card" className="p-4 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-text-primary">
                {t("da_settings_chart_defaults_title")}
              </h3>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <p className="text-xs text-text-secondary">
                  {t("da_settings_chart_defaults_legend")}
                </p>
                <Input
                  id="analysis-settings-default-legend-font-size-input"
                  value={legendFontSizeDraft}
                  onChange={setLegendFontSizeDraft}
                  onBlur={() => {
                    if (legendFontSizeDraft === String(analysisDefaultSettings.legendFontSize ?? "")) return;
                    void analysisDefaultSettings.onLegendFontSizeChange(legendFontSizeDraft.trim());
                  }}
                  placeholder="18"
                  disabled={analysisDefaultSettings.isSaving}
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-text-secondary">
                  {t("da_settings_chart_defaults_title_size")}
                </p>
                <Input
                  id="analysis-settings-default-title-font-size-input"
                  value={axisTitleFontSizeDraft}
                  onChange={setAxisTitleFontSizeDraft}
                  onBlur={() => {
                    if (axisTitleFontSizeDraft === String(analysisDefaultSettings.axisTitleFontSize ?? "")) return;
                    void analysisDefaultSettings.onAxisTitleFontSizeChange(axisTitleFontSizeDraft.trim());
                  }}
                  placeholder="22"
                  disabled={analysisDefaultSettings.isSaving}
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-text-secondary">
                  {t("da_settings_chart_defaults_tick_label")}
                </p>
                <Input
                  id="analysis-settings-default-tick-label-font-size-input"
                  value={tickLabelFontSizeDraft}
                  onChange={setTickLabelFontSizeDraft}
                  onBlur={() => {
                    if (tickLabelFontSizeDraft === String(analysisDefaultSettings.tickLabelFontSize ?? "")) return;
                    void analysisDefaultSettings.onTickLabelFontSizeChange(tickLabelFontSizeDraft.trim());
                  }}
                  placeholder="18"
                  disabled={analysisDefaultSettings.isSaving}
                />
              </div>
            </div>
          </div>

          <div id="analysis-settings-storage-card" className="p-4 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-text-primary">
                {t("da_settings_storage_title")}
              </h3>
              <p className="text-sm text-text-secondary mt-1">
                {t("da_settings_storage_desc")}
              </p>
            </div>

            <div
              id="analysis-settings-origin-path-controls"
              className="flex items-center gap-2"
            >
              <div className="flex-1 min-w-0 rounded-lg border border-border bg-bg-page px-3 py-2 flex items-center h-[38px]">
                <p className="font-mono text-xs text-text-primary truncate">
                  {storageSettings.currentPath ||
                    (storageSettings.isLoading
                      ? t("da_settings_storage_loading")
                      : storageSettings.isConfigurable
                        ? t("da_settings_storage_unavailable")
                        : t("da_settings_storage_not_configurable_hint"))}
                </p>
              </div>

              <Button
                id="analysis-settings-persistence-path-choose-btn"
                type="button"
                variant="primary"
                size="sm"
                className="h-[38px] whitespace-nowrap"
                onClick={storageSettings.onChoosePath}
                disabled={!storageSettings.isConfigurable || storageSettings.isSaving}
              >
                {t("da_settings_storage_choose_path_btn")}
              </Button>
            </div>

            {storageSettings.feedback.message ? (
              <p className={feedbackClassName(storageSettings.feedback.type)}>
                {storageSettings.feedback.message}
              </p>
            ) : null}
          </div>

          <div id="analysis-settings-filename-matching-card" className="p-4 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-text-primary">
                {t("da_settings_filename_matching_title")}
              </h3>
              <p className="text-sm text-text-secondary mt-1">
                {t("da_settings_filename_matching_desc")}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-text-secondary">
                {t("da_settings_filename_matching_label")}
              </p>
              <Input
                id="analysis-settings-filename-separators-input"
                value={fileNameFieldSeparatorsDraft}
                onChange={setFileNameFieldSeparatorsDraft}
                onBlur={() => {
                  const nextValue = fileNameFieldSeparatorsDraft;
                  if (nextValue === fileNameMatchingSettings.fieldSeparators) return;
                  void fileNameMatchingSettings.onFieldSeparatorsChange(nextValue);
                }}
                disabled={fileNameMatchingSettings.isSaving}
                inputClassName="font-mono"
              />
              <p className="text-xs text-text-secondary">
                {t("da_settings_filename_matching_hint", {
                  value: DEFAULT_FILE_NAME_FIELD_SEPARATORS,
                })}
              </p>
            </div>

            {fileNameMatchingSettings.feedback.message ? (
              <p className={feedbackClassName(fileNameMatchingSettings.feedback.type)}>
                {fileNameMatchingSettings.feedback.message}
              </p>
            ) : null}
          </div>
              </>
            ) : null}

            {activeSettingsSection === "origin" ? (
              <>
          <div id="analysis-settings-origin-path-card" className="p-4 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-text-primary">
                {t("da_settings_origin_title")}
              </h3>
              <p className="text-sm text-text-secondary mt-1">
                {t("da_settings_origin_desc")}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 rounded-lg border border-border bg-bg-page px-3 py-2 flex items-center h-[38px]">
                <p className="font-mono text-xs text-text-primary truncate">
                  {originSettings.currentPath ||
                    (originSettings.isLoading
                      ? t("da_settings_origin_loading")
                      : t("da_settings_origin_not_configurable_hint"))}
                </p>
              </div>

              <Button
                id="analysis-settings-origin-path-choose-btn"
                type="button"
                variant="primary"
                size="sm"
                className="h-[38px] whitespace-nowrap"
                onClick={() => {
                  void originSettings.onChoosePath();
                }}
                disabled={!originSettings.isConfigurable || originSettings.isSaving}
              >
                {t("da_settings_origin_choose_path_btn")}
              </Button>

              <Button
                id="analysis-settings-origin-health-check-btn"
                type="button"
                variant="secondary"
                size="sm"
                className="h-[38px] whitespace-nowrap"
                onClick={() => {
                  void originSettings.onCheckHealth();
                }}
                disabled={
                  !originSettings.isHealthCheckAvailable ||
                  originSettings.isLoading ||
                  originSettings.isSaving ||
                  originSettings.isHealthChecking
                }
              >
                {originSettings.isHealthChecking
                  ? t("da_settings_origin_checking")
                  : t("da_settings_origin_check_btn")}
              </Button>
            </div>

            {!originSettings.isConfigurable ? (
              <p className="text-sm text-text-secondary">
                {t("da_settings_origin_not_configurable_hint")}
              </p>
            ) : null}
          </div>

          <div id="analysis-settings-origin-cleanup-card" className="p-4 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-text-primary">
                {t("da_settings_origin_cleanup_title")}
              </h3>
              <p className="text-sm text-text-secondary mt-1">
                {t("da_settings_origin_cleanup_desc")}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <p className="text-xs text-text-secondary">
                  {t("da_settings_origin_cleanup_enable_label")}
                </p>
                <DropdownField
                  id="analysis-settings-origin-cleanup-enabled-select"
                  menuId="analysis-settings-origin-cleanup-enabled-menu"
                  value={String(Boolean(originSettings.cleanupEnabled))}
                  onChange={(value) => {
                    void originSettings.onCleanupEnabledChange(value === "true");
                  }}
                  options={cleanupEnabledOptions}
                  disabled={originSettings.cleanupSaving}
                />
              </div>

              <div className="space-y-1">
                <p className="text-xs text-text-secondary">
                  {t("da_settings_origin_cleanup_keep_success_label")}
                </p>
                <DropdownField
                  id="analysis-settings-origin-cleanup-keep-success-select"
                  menuId="analysis-settings-origin-cleanup-keep-success-menu"
                  value={String(originSettings.cleanupKeepSuccessJobs ?? 0)}
                  onChange={(value) => {
                    void originSettings.onCleanupKeepSuccessJobsChange(value);
                  }}
                  options={cleanupKeepSuccessOptions}
                  disabled={originSettings.cleanupSaving}
                />
              </div>

              <div className="space-y-1">
                <p className="text-xs text-text-secondary">
                  {t("da_settings_origin_cleanup_failed_days_label")}
                </p>
                <DropdownField
                  id="analysis-settings-origin-cleanup-failed-days-select"
                  menuId="analysis-settings-origin-cleanup-failed-days-menu"
                  value={String(originSettings.cleanupFailedRetentionDays ?? 7)}
                  onChange={(value) => {
                    void originSettings.onCleanupFailedRetentionDaysChange(value);
                  }}
                  options={cleanupFailedDaysOptions}
                  disabled={originSettings.cleanupSaving}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                id="analysis-settings-origin-cleanup-run-btn"
                type="button"
                variant="secondary"
                size="sm"
                className="h-[38px] whitespace-nowrap"
                onClick={() => {
                  void originSettings.onRunCleanupNow();
                }}
                disabled={
                  !originSettings.isCleanupAvailable ||
                  originSettings.cleanupRunning ||
                  originSettings.cleanupSaving
                }
              >
                {originSettings.cleanupRunning
                  ? t("da_settings_origin_cleanup_running")
                  : t("da_settings_origin_cleanup_run_btn")}
              </Button>
            </div>
          </div>

          <div id="analysis-settings-origin-plot-card" className="p-4 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-text-primary">
                {t("da_settings_origin_plot_title")}
              </h3>
              <p className="text-sm text-text-secondary mt-1">
                {t("da_settings_origin_plot_desc")}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1 min-w-0">
                <p className="text-xs text-text-secondary">
                  {t("da_settings_origin_plot_xy_pairs_label")}
                </p>
                <Input
                  id="analysis-settings-origin-plot-xy-pairs-input"
                  value={xyPairsDraft}
                  onChange={setXyPairsDraft}
                  onBlur={() => {
                    const nextValue = xyPairsDraft.trim();
                    if (nextValue === (originSettings.plotXyPairs ?? "")) return;
                    void originSettings.onPlotXyPairsChange(nextValue);
                  }}
                  disabled={originSettings.plotSaving || !originSettings.isConfigurable}
                />
                <p className="text-xs text-text-secondary">
                  {t("da_settings_origin_plot_xy_pairs_hint")}
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-text-secondary">
                {t("da_settings_origin_plot_command_label")}
              </p>
              <Input
                id="analysis-settings-origin-plot-command-input"
                value={plotCommandDraft}
                onChange={setPlotCommandDraft}
                onBlur={() => {
                  const nextValue = plotCommandDraft.trim();
                  if (nextValue === (originSettings.plotCommand ?? "")) return;
                  void originSettings.onPlotCommandChange(nextValue);
                }}
                disabled={originSettings.plotSaving || !originSettings.isConfigurable}
              />
              <p className="text-xs text-text-secondary">
                {t("da_settings_origin_plot_command_hint")}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-text-secondary">
                {t("da_settings_origin_plot_post_commands_label")}
              </p>
              <textarea
                id="analysis-settings-origin-plot-post-commands-input"
                className="w-full min-h-[96px] rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm text-text-primary font-mono resize-y"
                value={postCommandsDraft}
                onChange={(event) => {
                  setPostCommandsDraft(event.target.value);
                }}
                onBlur={() => {
                  const nextValue = postCommandsDraft.trim();
                  const currentValue = (originSettings.plotPostCommandsText ?? "").trim();
                  if (nextValue === currentValue) return;
                  void originSettings.onPlotPostCommandsChange(nextValue);
                }}
                disabled={originSettings.plotSaving || !originSettings.isConfigurable}
              />
              <p className="text-xs text-text-secondary">
                {t("da_settings_origin_plot_post_commands_hint")}
              </p>
            </div>

            {originSettings.plotFeedback?.message ? (
              <p className={feedbackClassName(originSettings.plotFeedback.type)}>
                {originSettings.plotFeedback.message}
              </p>
            ) : null}
          </div>
              </>
            ) : null}

            {activeSettingsSection === "about" ? (
              <>
                <div id="analysis-settings-about-version-card" className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-text-primary">
                        {t("da_settings_about_version_title")}
                      </h3>
                    </div>

                    <p className="font-mono text-sm text-text-primary">
                      {appUpdateSettings.currentVersion || t("da_settings_about_version_unknown")}
                    </p>
                  </div>
                </div>

                <div id="analysis-settings-app-update-card" className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-text-primary">
                        {t("da_settings_app_update_title")}
                      </h3>
                    </div>

                    <div className="flex w-fit justify-end">
                      <Button
                        id="analysis-settings-app-update-check-btn"
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-[38px] whitespace-nowrap"
                        onClick={() => {
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
                        }}
                        disabled={!appUpdateSettings.isAvailable || appUpdateChecking}
                      >
                        {appUpdateChecking
                          ? t("da_settings_app_update_checking")
                          : t("da_settings_app_update_check_btn")}
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </Card>
      </div>

      <Toast
        message={originHealthToast.message}
        isVisible={originHealthToast.isVisible}
        onClose={closeOriginHealthToast}
        type={originHealthToast.type}
        containerRef={settingsSectionRef}
        position="absolute"
        dataUi="analysis-settings-origin-health-toast"
      />

      <Toast
        message={cleanupToast.message}
        isVisible={cleanupToast.isVisible}
        onClose={closeCleanupToast}
        type={cleanupToast.type}
        containerRef={settingsSectionRef}
        position="absolute"
        dataUi="analysis-settings-origin-cleanup-toast"
      />
    </section>
  );
};

export default SettingsPanel;
