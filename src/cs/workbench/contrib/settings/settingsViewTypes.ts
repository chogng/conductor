import type { LanguageCode, TranslateFn } from "src/cs/platform/language/common/language";
import type { ThemeMode } from "src/cs/workbench/common/theme";
import type { Feedback } from "src/cs/workbench/common/deviceAnalysis/sharedTypes";

export type OriginSettings = {
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

export type StorageSettings = {
  currentPath: string;
  feedback: Feedback;
  isLoading: boolean;
  isConfigurable: boolean;
  isSaving: boolean;
  onChoosePath: () => Promise<void> | void;
};

export type AppUpdateSettings = {
  currentVersion?: string | null;
  isAvailable: boolean;
  onCheckForUpdates: () => boolean | Promise<boolean>;
};

export type WindowCloseSettings = {
  behavior: "minimizeToTray" | "quit";
  isSaving: boolean;
  onBehaviorChange: (
    behavior: "minimizeToTray" | "quit",
  ) => Promise<void> | void;
};

export type FileNameMatchingSettings = {
  feedback: Feedback;
  fieldSeparators: string;
  isSaving: boolean;
  onFieldSeparatorsChange: (value: string) => Promise<void> | void;
};

export type AnalysisDefaultSettings = {
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

export type SettingsViewProps = {
  appUpdateSettings: AppUpdateSettings;
  analysisDefaultSettings: AnalysisDefaultSettings;
  fileNameMatchingSettings: FileNameMatchingSettings;
  language: LanguageCode;
  onLanguageChange: (language: LanguageCode) => Promise<void> | void;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => Promise<void> | void;
  originSettings: OriginSettings;
  storageSettings: StorageSettings;
  windowCloseSettings: WindowCloseSettings;
  t: TranslateFn;
};

export type SettingsSectionId = "general" | "origin" | "about";
