/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import type { LanguagePreference } from "src/cs/platform/language/common/language";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { ThemeMode } from "src/cs/workbench/common/theme";
import type { OriginPlotOptions } from "src/cs/workbench/services/origin/common/originPlotOptions";
import type {
  OriginCleanupResult,
  OriginHealthResult,
} from "src/cs/workbench/services/origin/common/origin";
import type {
  IonIoffMethod,
  SsMethod,
} from "src/cs/workbench/services/parameters/common/parameters";
import type { PlotAxisSettings } from "src/cs/workbench/services/plot/common/plotSettings";

export type { OriginCleanupResult, OriginHealthResult };

export type ConductorSettings = {
  backgroundColor?: string;
  fileNameFieldSeparators?: string;
  language?: LanguagePreference;
  theme?: ThemeMode;
  transparentChrome?: boolean;
  windowCloseBehavior?: "minimizeToTray" | "quit";
  trayMinimizeHintShown?: boolean;
  originExePath?: string;
  originExportModeDefault?:
    | "merged"
    | "workbookBooks"
    | "workbookSheets"
    | "separate";
  originPlotCommandDefault?: string;
  originPlotPostCommandsDefault?: string[];
  originPlotTypeDefault?: number;
  originPlotXyPairsDefault?: string;
  originPlotLineWidthDefault?: number;
  originPlotLegendFontSizeDefault?: number | "";
  originRuntimeCleanupEnabled?: boolean;
  originRuntimeFailedRetentionDays?: number;
  originRuntimeKeepSuccessJobs?: number;
  ionIoffMethodDefault?: IonIoffMethod;
  ssIdHigh?: number | string;
  ssIdLow?: number | string;
  ssMethodDefault?: SsMethod;
  ssShowFitLine?: boolean;
  stopOnErrorDefault?: boolean;
  defaultYScaleForCf?: "linear" | "log";
  defaultYScaleForCv?: "linear" | "log";
  defaultYScaleForOutput?: "linear" | "log";
  defaultYScaleForPv?: "linear" | "log";
  defaultYScaleForSpecial?: "linear" | "log";
  defaultYScaleForTransfer?: "linear" | "log";
  plotAxisSettings?: Record<string, unknown>;
  xUnitByFileId?: Record<string, "V" | "mV">;
  yUnitByFileId?: Record<
    string,
    "A" | "mA" | "uA" | "nA" | "pA" | "F" | "mF" | "uF" | "nF" | "pF"
  >;
  yScaleByFileId?: Record<string, "linear" | "log">;
  yLogCurrentModeByFileId?: Record<string, "all" | "positive">;
  [key: string]: unknown;
};

export const SettingsContributionId = "workbench.contrib.settings";

export const SettingsViewId = "workbench.settings";

export const ISettingsService = createDecorator<ISettingsService>("settingsService");

export type SettingsServiceOptions = {
  updateConductorSettings: (
    updates: unknown,
  ) => Promise<ConductorSettings | null>;
  isWindowsDesktopShell: boolean;
  mergeConductorSettings: (nextSettings: ConductorSettings | null) => void;
};

export type SettingsAppUpdateInput = {
  readonly currentVersion: string | null;
  readonly isAvailable: boolean;
  readonly onCheckForUpdates: () => Promise<boolean> | boolean;
};

export type SettingsViewInput = {
  readonly appUpdateSettings: SettingsAppUpdateInput;
  readonly conductorSettings: ConductorSettings | null;
  readonly conductorSettingsLoaded: boolean;
  readonly handleLanguageChange: (language: LanguagePreference) => Promise<void> | void;
  readonly handleResetLayoutState: () => Promise<void> | void;
  readonly handleThemeChange: (theme: ThemeMode) => Promise<void> | void;
  readonly updateConductorSettings: (
    updates: unknown,
  ) => Promise<ConductorSettings | null>;
  readonly isWindowsDesktopShell: boolean;
  readonly language: LanguagePreference;
  readonly mergeConductorSettings: (nextSettings: ConductorSettings | null) => void;
  readonly theme: ThemeMode;
};

export type OriginSettingsViewInput = {
  readonly axisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
  readonly onAxisChange?: (updates: Record<string, unknown>) => void | Promise<void>;
  readonly onChange?: (updates: Partial<OriginPlotOptions>) => void | Promise<void>;
  readonly options?: OriginPlotOptions;
};

export interface ISettingsService {
  readonly _serviceBrand: undefined;

  readonly onDidChangeOriginSettingsViewInput: Event<OriginSettingsViewInput>;
  readonly onDidChangeSettingsViewInput: Event<SettingsViewInput>;

  canCheckOriginHealth(): boolean;
  canManageOrigin(): boolean;
  canRunOriginCleanup(): boolean;
  checkOriginHealth(path: string): Promise<OriginHealthResult>;
  chooseOriginExePath(): Promise<string>;
  errorMessage(error: unknown): string;
  formatOriginError(error: unknown): string;
  getOriginExePath(): Promise<string>;
  getOriginSettingsViewInput(): OriginSettingsViewInput;
  getSettingsViewInput(): SettingsViewInput | null;
  runOriginCleanup(): Promise<OriginCleanupResult>;
  update(options: SettingsServiceOptions): void;
  updateOriginSettingsViewInput(input: OriginSettingsViewInput): void;
  updateSettingsViewInput(input: SettingsViewInput): void;
  updateSettings(updates: unknown): Promise<ConductorSettings | null>;
}
