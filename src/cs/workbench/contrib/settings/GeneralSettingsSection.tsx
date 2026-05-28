import Button from "src/cs/base/browser/ui/Button/Button";
import DropdownField from "src/cs/base/browser/ui/DropdownField/DropdownField";
import Input from "src/cs/base/browser/ui/Input/Input";
import { DEFAULT_FILE_NAME_FIELD_SEPARATORS } from "src/cs/workbench/common/deviceAnalysis/fileNameFieldMatching";
import type {
  AnalysisDefaultSettings,
  FileNameMatchingSettings,
  OnboardingSettings,
  SettingsPanelProps,
  StorageSettings,
  WindowCloseSettings,
} from "src/cs/workbench/contrib/settings/settingsPanelTypes";

type SelectOption = {
  label: string;
  value: string;
};

type GeneralSettingsSectionProps = {
  analysisDefaultSettings: AnalysisDefaultSettings;
  axisTitleFontSizeDraft: string;
  feedbackClassName: (type: "idle" | "success" | "error") => string;
  fileNameFieldSeparatorsDraft: string;
  fileNameMatchingSettings: FileNameMatchingSettings;
  language: SettingsPanelProps["language"];
  legendFontSizeDraft: string;
  onboardingSettings: OnboardingSettings;
  onLanguageChange: SettingsPanelProps["onLanguageChange"];
  onThemeChange: SettingsPanelProps["onThemeChange"];
  setAxisTitleFontSizeDraft: (value: string) => void;
  setFileNameFieldSeparatorsDraft: (value: string) => void;
  setLegendFontSizeDraft: (value: string) => void;
  setTickLabelFontSizeDraft: (value: string) => void;
  storageSettings: StorageSettings;
  t: SettingsPanelProps["t"];
  theme: SettingsPanelProps["theme"];
  themeModeOptions: SelectOption[];
  tickLabelFontSizeDraft: string;
  windowCloseBehaviorOptions: SelectOption[];
  windowCloseSettings: WindowCloseSettings;
  yScaleOptions: SelectOption[];
};

export const GeneralSettingsSection = ({
  analysisDefaultSettings,
  axisTitleFontSizeDraft,
  feedbackClassName,
  fileNameFieldSeparatorsDraft,
  fileNameMatchingSettings,
  language,
  legendFontSizeDraft,
  onboardingSettings,
  onLanguageChange,
  onThemeChange,
  setAxisTitleFontSizeDraft,
  setFileNameFieldSeparatorsDraft,
  setLegendFontSizeDraft,
  setTickLabelFontSizeDraft,
  storageSettings,
  t,
  theme,
  themeModeOptions,
  tickLabelFontSizeDraft,
  windowCloseBehaviorOptions,
  windowCloseSettings,
  yScaleOptions,
}: GeneralSettingsSectionProps) => (
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
              void analysisDefaultSettings.onDefaultYScaleForTransferChange(
                String(value),
              );
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
              void analysisDefaultSettings.onDefaultYScaleForOutputChange(
                String(value),
              );
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
              void analysisDefaultSettings.onDefaultYScaleForCvChange(
                String(value),
              );
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
              void analysisDefaultSettings.onDefaultYScaleForCfChange(
                String(value),
              );
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
              void analysisDefaultSettings.onDefaultYScaleForPvChange(
                String(value),
              );
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
              if (
                legendFontSizeDraft ===
                String(analysisDefaultSettings.legendFontSize ?? "")
              ) {
                return;
              }

              void analysisDefaultSettings.onLegendFontSizeChange(
                legendFontSizeDraft.trim(),
              );
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
              if (
                axisTitleFontSizeDraft ===
                String(analysisDefaultSettings.axisTitleFontSize ?? "")
              ) {
                return;
              }

              void analysisDefaultSettings.onAxisTitleFontSizeChange(
                axisTitleFontSizeDraft.trim(),
              );
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
              if (
                tickLabelFontSizeDraft ===
                String(analysisDefaultSettings.tickLabelFontSize ?? "")
              ) {
                return;
              }

              void analysisDefaultSettings.onTickLabelFontSizeChange(
                tickLabelFontSizeDraft.trim(),
              );
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
        <p className="mt-1 text-sm text-text-secondary">
          {t("da_settings_storage_desc")}
        </p>
      </div>

      <div
        id="analysis-settings-origin-path-controls"
        className="flex items-center gap-2"
      >
        <div className="flex h-[38px] min-w-0 flex-1 items-center rounded-lg border border-border bg-bg-page px-3 py-2">
          <p className="truncate font-mono text-xs text-text-primary">
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
        <p className="mt-1 text-sm text-text-secondary">
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
            if (nextValue === fileNameMatchingSettings.fieldSeparators) {
              return;
            }

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
);
