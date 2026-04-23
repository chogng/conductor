import { useCallback, useEffect, useRef, useState } from "react";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import DropdownField from "../../../components/ui/DropdownField";
import Toast from "../../../components/ui/Toast";
import type { LanguageCode, TranslateFn } from "../../../context/language";
import type { ThemeMode } from "../../../context/theme";
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
  isAvailable: boolean;
  onCheckForUpdates: () => boolean | Promise<boolean>;
};

type FileNameMatchingSettings = {
  feedback: Feedback;
  fieldSeparators: string;
  isSaving: boolean;
  onFieldSeparatorsChange: (value: string) => Promise<void> | void;
};

type AnalysisDefaultSettings = {
  defaultYScaleForOutput: "linear" | "log";
  defaultYScaleForTransfer: "linear" | "log";
  feedback: Feedback;
  isSaving: boolean;
  onDefaultYScaleForOutputChange: (value: string) => Promise<void> | void;
  onDefaultYScaleForTransferChange: (value: string) => Promise<void> | void;
};

type OnboardingSettings = {
  onOpenGuide: () => void;
};

type DeviceAnalysisSettingsPanelProps = {
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
  t: TranslateFn;
};

const feedbackClassName = (type: Feedback["type"]): string =>
  `text-sm ${type === "error" ? "text-red-500" : "text-emerald-600"}`;

const DeviceAnalysisSettingsPanel = ({
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
  t,
}: DeviceAnalysisSettingsPanelProps) => {
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
  const originPlotTypeOptions = [
    { value: "200", label: t("da_settings_origin_plot_type_200") },
    { value: "201", label: t("da_settings_origin_plot_type_201") },
    { value: "202", label: t("da_settings_origin_plot_type_202") },
  ];
  const yScaleOptions = [
    { value: "linear", label: "Linear" },
    { value: "log", label: "Log" },
  ];
  const [lineWidthDraft, setLineWidthDraft] = useState(
    String(originSettings.plotLineWidth ?? 2),
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
  const [appUpdateChecking, setAppUpdateChecking] = useState(false);
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

  useEffect(() => {
    setLineWidthDraft(String(originSettings.plotLineWidth ?? 2));
  }, [originSettings.plotLineWidth]);

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
      <h2 className="section_title">{t("da_settings_title")}</h2>

      <Card
        id="device-analysis-settings-language-card"
        variant="panel"
        className="p-4 space-y-4 mb-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-text-primary">
              {t("da_settings_language_title")}
            </h3>
            <p className="text-sm text-text-secondary mt-1">
              {t("da_settings_language_desc")}
            </p>
          </div>

          <div className="w-full sm:w-fit">
            <DropdownField
              id="device-analysis-settings-language-dropdown"
              menuId="device-analysis-settings-language-dropdown-menu"
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
              className="w-full sm:w-fit da-neutral-select"
              stableWidth
            />
          </div>
        </div>
      </Card>

      <Card
        id="device-analysis-settings-theme-card"
        variant="panel"
        className="p-4 space-y-4 mb-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-text-primary">
              {t("da_settings_theme_title")}
            </h3>
            <p className="text-sm text-text-secondary mt-1">
              {t("da_settings_theme_desc")}
            </p>
          </div>

          <div className="w-full sm:w-fit">
            <DropdownField
              id="device-analysis-settings-theme-dropdown"
              menuId="device-analysis-settings-theme-dropdown-menu"
              value={theme}
              onChange={(value) => {
                if (value === "system" || value === "light" || value === "dark") {
                  void onThemeChange(value);
                }
              }}
              options={themeModeOptions}
              className="w-full sm:w-fit da-neutral-select"
              stableWidth
            />
          </div>
        </div>
      </Card>

      <Card
        id="device-analysis-settings-app-update-card"
        variant="panel"
        className="p-4 space-y-4 mb-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-text-primary">
              {t("da_settings_app_update_title")}
            </h3>
            <p className="text-sm text-text-secondary mt-1">
              {t("da_settings_app_update_desc")}
            </p>
          </div>

          <div className="w-full sm:w-fit flex justify-end">
            <Button
              id="device-analysis-settings-app-update-check-btn"
              type="button"
              variant="secondary"
              size="sm"
              className="h-[38px] w-full sm:w-auto whitespace-nowrap sm:shrink-0"
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

        {!appUpdateSettings.isAvailable ? (
          <p className="text-sm text-text-secondary">
            {t("da_settings_app_update_unavailable")}
          </p>
        ) : null}
      </Card>

      <Card
        id="device-analysis-settings-onboarding-card"
        variant="panel"
        className="p-4 space-y-4 mb-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-text-primary">
              {t("da_settings_onboarding_title")}
            </h3>
            <p className="text-sm text-text-secondary mt-1">
              {t("da_settings_onboarding_desc")}
            </p>
          </div>

          <div className="w-full sm:w-fit flex justify-end">
            <Button
              id="device-analysis-settings-onboarding-open-btn"
              type="button"
              variant="secondary"
              size="sm"
              className="h-[38px] w-full sm:w-auto whitespace-nowrap sm:shrink-0"
              onClick={onboardingSettings.onOpenGuide}
            >
              {t("da_settings_onboarding_open_btn")}
            </Button>
          </div>
        </div>
      </Card>

      <Card
        id="device-analysis-settings-analysis-defaults-card"
        variant="panel"
        className="p-4 space-y-4 mb-4"
      >
        <div>
          <h3 className="text-base font-semibold text-text-primary">
            Analysis Defaults
          </h3>
          <p className="text-sm text-text-secondary mt-1">
            Choose the default Y scale used when a file has no per-file override yet.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <p className="text-xs text-text-secondary">Transfer Curve Default</p>
            <DropdownField
              id="device-analysis-settings-default-transfer-y-scale-select"
              value={analysisDefaultSettings.defaultYScaleForTransfer}
              onChange={(value) => {
                void analysisDefaultSettings.onDefaultYScaleForTransferChange(String(value));
              }}
              options={yScaleOptions}
              disabled={analysisDefaultSettings.isSaving}
            />
          </div>

          <div className="space-y-1">
            <p className="text-xs text-text-secondary">Output Curve Default</p>
            <DropdownField
              id="device-analysis-settings-default-output-y-scale-select"
              value={analysisDefaultSettings.defaultYScaleForOutput}
              onChange={(value) => {
                void analysisDefaultSettings.onDefaultYScaleForOutputChange(String(value));
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
      </Card>

      <Card
        id="device-analysis-settings-storage-card"
        variant="panel"
        className="p-4 space-y-4"
      >
        <div>
          <h3 className="text-base font-semibold text-text-primary">
            {t("da_settings_storage_title")}
          </h3>
          <p className="text-sm text-text-secondary mt-1">
            {t("da_settings_storage_desc")}
          </p>
        </div>

        <div
          id="device-analysis-settings-origin-path-controls"
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
            id="device-analysis-settings-persistence-path-choose-btn"
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
      </Card>

      <Card
        id="device-analysis-settings-filename-matching-card"
        variant="panel"
        className="p-4 space-y-4 mt-4"
      >
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
            id="device-analysis-settings-filename-separators-input"
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
      </Card>

      <Card
        id="device-analysis-settings-origin-path-card"
        variant="panel"
        className="p-4 space-y-4 mt-4"
      >
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
            id="device-analysis-settings-origin-path-choose-btn"
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
            id="device-analysis-settings-origin-health-check-btn"
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

      </Card>

      <Card
        id="device-analysis-settings-origin-cleanup-card"
        variant="panel"
        className="p-4 space-y-4 mt-4"
      >
        <div>
          <h3 className="text-base font-semibold text-text-primary">
            {t("da_settings_origin_cleanup_title")}
          </h3>
          <p className="text-sm text-text-secondary mt-1">
            {t("da_settings_origin_cleanup_desc")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <p className="text-xs text-text-secondary">
              {t("da_settings_origin_cleanup_enable_label")}
            </p>
            <DropdownField
              id="device-analysis-settings-origin-cleanup-enabled-select"
              menuId="device-analysis-settings-origin-cleanup-enabled-menu"
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
              id="device-analysis-settings-origin-cleanup-keep-success-select"
              menuId="device-analysis-settings-origin-cleanup-keep-success-menu"
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
              id="device-analysis-settings-origin-cleanup-failed-days-select"
              menuId="device-analysis-settings-origin-cleanup-failed-days-menu"
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
            id="device-analysis-settings-origin-cleanup-run-btn"
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

      </Card>

      <Card
        id="device-analysis-settings-origin-plot-card"
        variant="panel"
        className="p-4 space-y-4 mt-4"
      >
        <div>
          <h3 className="text-base font-semibold text-text-primary">
            {t("da_settings_origin_plot_title")}
          </h3>
          <p className="text-sm text-text-secondary mt-1">
            {t("da_settings_origin_plot_desc")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1 min-w-0">
            <p className="text-xs text-text-secondary">
              {t("da_settings_origin_plot_type_label")}
            </p>
            <DropdownField
              id="device-analysis-settings-origin-plot-type-select"
              menuId="device-analysis-settings-origin-plot-type-menu"
              className="w-full"
              value={String(originSettings.plotType ?? 202)}
              onChange={(value) => {
                void originSettings.onPlotTypeChange(value);
              }}
              options={originPlotTypeOptions}
              disabled={originSettings.plotSaving || !originSettings.isConfigurable}
            />
          </div>

          <div className="space-y-1 min-w-0">
            <p className="text-xs text-text-secondary">
              {t("da_settings_origin_plot_line_width_label")}
            </p>
            <Input
              id="device-analysis-settings-origin-plot-line-width-input"
              value={lineWidthDraft}
              onChange={setLineWidthDraft}
              onBlur={() => {
                const nextValue = lineWidthDraft.trim();
                if (nextValue === String(originSettings.plotLineWidth ?? 2)) return;
                void originSettings.onPlotLineWidthChange(nextValue);
              }}
              disabled={originSettings.plotSaving || !originSettings.isConfigurable}
            />
            <p className="text-xs text-text-secondary">
              {t("da_settings_origin_plot_line_width_hint")}
            </p>
          </div>

          <div className="space-y-1 min-w-0">
            <p className="text-xs text-text-secondary">
              {t("da_settings_origin_plot_xy_pairs_label")}
            </p>
            <Input
              id="device-analysis-settings-origin-plot-xy-pairs-input"
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
            id="device-analysis-settings-origin-plot-command-input"
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
            id="device-analysis-settings-origin-plot-post-commands-input"
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
      </Card>

      <Toast
        message={originHealthToast.message}
        isVisible={originHealthToast.isVisible}
        onClose={closeOriginHealthToast}
        type={originHealthToast.type}
        containerRef={settingsSectionRef}
        position="absolute"
        dataUi="device-analysis-settings-origin-health-toast"
      />

      <Toast
        message={cleanupToast.message}
        isVisible={cleanupToast.isVisible}
        onClose={closeCleanupToast}
        type={cleanupToast.type}
        containerRef={settingsSectionRef}
        position="absolute"
        dataUi="device-analysis-settings-origin-cleanup-toast"
      />
    </section>
  );
};

export default DeviceAnalysisSettingsPanel;

