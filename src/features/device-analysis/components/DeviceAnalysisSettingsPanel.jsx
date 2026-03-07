import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import Select from "../../../components/ui/Select";

const feedbackClassName = (type) =>
  `text-sm ${type === "error" ? "text-red-500" : "text-emerald-600"}`;

const DeviceAnalysisSettingsPanel = ({
  language,
  onLanguageChange,
  originSettings,
  storageSettings,
  t,
}) => {
  return (
    <section aria-label={t("da_settings_section_aria_label")}>
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

          <div className="w-full sm:w-[94px]">
            <Select
              id="device-analysis-settings-language-dropdown"
              menuId="device-analysis-settings-language-dropdown-menu"
              value={language}
              onChange={(value) => {
                void onLanguageChange(value);
              }}
              options={[
                { value: "zh", label: t("da_settings_language_zh") },
                { value: "en", label: t("da_settings_language_en") },
              ]}
            />
          </div>
        </div>
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

        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 rounded-lg border border-border bg-bg-page px-3 py-2 flex items-center h-[38px]">
            <p className="font-mono text-xs text-text-primary truncate">
              {storageSettings.currentPath || t("da_settings_storage_loading")}
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

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-text-secondary">
            {t("da_settings_origin_batch_desc")}
          </p>

          <Button
            id="device-analysis-settings-origin-batch-run-btn"
            type="button"
            variant="secondary"
            size="sm"
            className="h-[38px] whitespace-nowrap"
            onClick={() => {
              void originSettings.onRunBatch();
            }}
            disabled={
              !originSettings.isBatchAvailable ||
              originSettings.isLoading ||
              originSettings.isSaving ||
              originSettings.isHealthChecking ||
              originSettings.isBatchRunning
            }
          >
            {originSettings.isBatchRunning
              ? t("da_settings_origin_batch_running")
              : t("da_settings_origin_batch_btn")}
          </Button>
        </div>

        {!originSettings.isConfigurable ? (
          <p className="text-sm text-text-secondary">
            {t("da_settings_origin_not_configurable_hint")}
          </p>
        ) : null}

        {originSettings.feedback.message ? (
          <p className={feedbackClassName(originSettings.feedback.type)}>
            {originSettings.feedback.message}
          </p>
        ) : null}
      </Card>
    </section>
  );
};

export default DeviceAnalysisSettingsPanel;
