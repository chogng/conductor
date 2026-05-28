import Button from "src/cs/base/browser/ui/Button/Button";
import DropdownField from "src/cs/base/browser/ui/DropdownField/DropdownField";
import Input from "src/cs/base/browser/ui/Input/Input";
import type {
  OriginSettings,
  SettingsPanelProps,
} from "src/cs/workbench/contrib/settings/settingsPanelTypes";

type SelectOption = {
  label: string;
  value: string;
};

type OriginSettingsSectionProps = {
  cleanupEnabledOptions: SelectOption[];
  cleanupFailedDaysOptions: SelectOption[];
  cleanupKeepSuccessOptions: SelectOption[];
  feedbackClassName: (type: "idle" | "success" | "error") => string;
  originSettings: OriginSettings;
  plotCommandDraft: string;
  postCommandsDraft: string;
  setPlotCommandDraft: (value: string) => void;
  setPostCommandsDraft: (value: string) => void;
  setXyPairsDraft: (value: string) => void;
  t: SettingsPanelProps["t"];
  xyPairsDraft: string;
};

export const OriginSettingsSection = ({
  cleanupEnabledOptions,
  cleanupFailedDaysOptions,
  cleanupKeepSuccessOptions,
  feedbackClassName,
  originSettings,
  plotCommandDraft,
  postCommandsDraft,
  setPlotCommandDraft,
  setPostCommandsDraft,
  setXyPairsDraft,
  t,
  xyPairsDraft,
}: OriginSettingsSectionProps) => (
  <>
    <div id="analysis-settings-origin-path-card" className="p-4 space-y-4">
      <div>
        <h3 className="text-base font-semibold text-text-primary">
          {t("da_settings_origin_title")}
        </h3>
        <p className="mt-1 text-sm text-text-secondary">
          {t("da_settings_origin_desc")}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex h-[38px] min-w-0 flex-1 items-center rounded-lg border border-border bg-bg-page px-3 py-2">
          <p className="truncate font-mono text-xs text-text-primary">
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
        <p className="mt-1 text-sm text-text-secondary">
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
        <p className="mt-1 text-sm text-text-secondary">
          {t("da_settings_origin_plot_desc")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs text-text-secondary">
            {t("da_settings_origin_plot_xy_pairs_label")}
          </p>
          <Input
            id="analysis-settings-origin-plot-xy-pairs-input"
            value={xyPairsDraft}
            onChange={setXyPairsDraft}
            onBlur={() => {
              const nextValue = xyPairsDraft.trim();
              if (nextValue === (originSettings.plotXyPairs ?? "")) {
                return;
              }

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
            if (nextValue === (originSettings.plotCommand ?? "")) {
              return;
            }

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
          className="min-h-[96px] w-full resize-y rounded-lg border border-border bg-bg-surface px-3 py-2 font-mono text-sm text-text-primary"
          value={postCommandsDraft}
          onChange={(event) => {
            setPostCommandsDraft(event.target.value);
          }}
          onBlur={() => {
            const nextValue = postCommandsDraft.trim();
            const currentValue = String(
              originSettings.plotPostCommandsText ?? "",
            ).trim();
            if (nextValue === currentValue) {
              return;
            }

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
);
