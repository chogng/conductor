import Button from "src/cs/base/browser/ui/button/button";
import type {
  AppUpdateSettings,
  SettingsPanelProps,
} from "src/cs/workbench/contrib/settings/settingsPanelTypes";

type AboutSettingsSectionProps = {
  appUpdateChecking: boolean;
  appUpdateSettings: AppUpdateSettings;
  handleCheckForUpdates: () => void;
  t: SettingsPanelProps["t"];
};

export const AboutSettingsSection = ({
  appUpdateChecking,
  appUpdateSettings,
  handleCheckForUpdates,
  t,
}: AboutSettingsSectionProps) => (
  <>
    <div id="analysis-settings-about-version-card" className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-text-primary">
            {t("da_settings_about_version_title")}
          </h3>
        </div>

        <p className="font-mono text-sm text-text-primary">
          {appUpdateSettings.currentVersion ||
            t("da_settings_about_version_unknown")}
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
            onClick={handleCheckForUpdates}
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
);
