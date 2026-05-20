import { useRef } from "react";
import Button from "src/cs/base/browser/ui/Button/Button";
import Card from "src/cs/base/browser/ui/Card/Card";
import DropdownField from "src/cs/base/browser/ui/DropdownField/DropdownField";
import Input from "src/cs/base/browser/ui/Input/Input";
import Toast from "src/cs/base/browser/ui/toast/toast";
import type { Feedback } from "src/cs/workbench/common/deviceAnalysis/sharedTypes";
import { AboutSettingsSection } from "src/cs/workbench/contrib/deviceAnalysis/settings/AboutSettingsSection";
import { GeneralSettingsSection } from "src/cs/workbench/contrib/deviceAnalysis/settings/GeneralSettingsSection";
import { OriginSettingsSection } from "src/cs/workbench/contrib/deviceAnalysis/settings/OriginSettingsSection";
import type {
  SettingsPanelProps,
} from "src/cs/workbench/contrib/deviceAnalysis/settings/settingsPanelTypes";
import { useSettingsPanelState } from "src/cs/workbench/contrib/deviceAnalysis/settings/useSettingsPanelState";

const feedbackClassName = (type: Feedback["type"]): string =>
  `text-sm ${type === "error" ? "text-red-500" : "text-emerald-600"}`;

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
  const {
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
  } = useSettingsPanelState({
    analysisDefaultSettings,
    appUpdateSettings,
    fileNameMatchingSettings,
    originSettings,
    t,
  });

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
              <GeneralSettingsSection
                analysisDefaultSettings={analysisDefaultSettings}
                axisTitleFontSizeDraft={axisTitleFontSizeDraft}
                feedbackClassName={feedbackClassName}
                fileNameFieldSeparatorsDraft={fileNameFieldSeparatorsDraft}
                fileNameMatchingSettings={fileNameMatchingSettings}
                language={language}
                legendFontSizeDraft={legendFontSizeDraft}
                onboardingSettings={onboardingSettings}
                onLanguageChange={onLanguageChange}
                onThemeChange={onThemeChange}
                setAxisTitleFontSizeDraft={setAxisTitleFontSizeDraft}
                setFileNameFieldSeparatorsDraft={setFileNameFieldSeparatorsDraft}
                setLegendFontSizeDraft={setLegendFontSizeDraft}
                setTickLabelFontSizeDraft={setTickLabelFontSizeDraft}
                storageSettings={storageSettings}
                t={t}
                theme={theme}
                themeModeOptions={themeModeOptions}
                tickLabelFontSizeDraft={tickLabelFontSizeDraft}
                windowCloseBehaviorOptions={windowCloseBehaviorOptions}
                windowCloseSettings={windowCloseSettings}
                yScaleOptions={yScaleOptions}
              />
            ) : null}

            {activeSettingsSection === "origin" ? (
              <OriginSettingsSection
                cleanupEnabledOptions={cleanupEnabledOptions}
                cleanupFailedDaysOptions={cleanupFailedDaysOptions}
                cleanupKeepSuccessOptions={cleanupKeepSuccessOptions}
                feedbackClassName={feedbackClassName}
                originSettings={originSettings}
                plotCommandDraft={plotCommandDraft}
                postCommandsDraft={postCommandsDraft}
                setPlotCommandDraft={setPlotCommandDraft}
                setPostCommandsDraft={setPostCommandsDraft}
                setXyPairsDraft={setXyPairsDraft}
                t={t}
                xyPairsDraft={xyPairsDraft}
              />
            ) : null}

            {activeSettingsSection === "about" ? (
              <AboutSettingsSection
                appUpdateChecking={appUpdateChecking}
                appUpdateSettings={appUpdateSettings}
                handleCheckForUpdates={handleCheckForUpdates}
                t={t}
              />
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
