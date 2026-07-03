/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import type { LanguagePreference } from "src/cs/base/common/platform";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { ThemeMode } from "src/cs/workbench/common/theme";
import {
  DEFAULT_ORIGIN_PLOT_OPTIONS,
  normalizeOriginPlotOptions,
  type OriginPlotOptions,
} from "src/cs/workbench/services/origin/common/originPlotOptions";
import type {
  OriginCleanupResult,
  OriginHealthResult,
} from "src/cs/workbench/services/origin/common/origin";
import type {
  IonIoffMethod,
  SsMethod,
} from "src/cs/workbench/services/calculation/common/calculation";
import type { PlotAxisSettings } from "src/cs/workbench/services/plot/common/plotSettings";
import {
  DEFAULT_NUMERIC_DISPLAY_MODE,
  type NumericDisplayMode,
} from "src/cs/workbench/services/table/common/tableDisplayProfile";

export type { NumericDisplayMode, OriginCleanupResult, OriginHealthResult };

export type FilesExplorerDensity = "compact" | "default" | "comfortable";
export type FilesExplorerBadgeColor =
  | "neutral"
  | "blue"
  | "green"
  | "purple"
  | "orange"
  | "red"
  | "cyan";

export type FilesExplorerBadgeColors = Readonly<Record<string, FilesExplorerBadgeColor>>;

export type TemplateRule = {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly priority: number;
  readonly badge?: string;
  readonly xTerms: readonly string[];
  readonly yTerms: readonly string[];
  readonly enabled: boolean;
};

const FILES_EXPLORER_DENSITIES = new Set<FilesExplorerDensity>([
  "compact",
  "default",
  "comfortable",
]);
const FILES_EXPLORER_BADGE_COLORS = new Set<FilesExplorerBadgeColor>([
  "neutral",
  "blue",
  "green",
  "purple",
  "orange",
  "red",
  "cyan",
]);
const NUMERIC_DISPLAY_MODES = new Set<NumericDisplayMode>(["raw", "smart"]);
export const DEFAULT_FILES_EXPLORER_DENSITY: FilesExplorerDensity = "compact";
export const DEFAULT_FILES_EXPLORER_SHOW_BADGES = true;
export const DEFAULT_TABLE_AUTO_FIT_COLUMN_WIDTHS_ENABLED = false;
export const DEFAULT_TABLE_TEMPLATE_VISUALIZATION_ENABLED = false;
export const DEFAULT_FILES_EXPLORER_BADGE_COLORS: FilesExplorerBadgeColors = Object.freeze({
  cf: "cyan",
  cv: "purple",
  mixed: "neutral",
  output: "green",
  pv: "red",
  transfer: "blue",
  unknown: "orange",
});
export const DEFAULT_TEMPLATE_RULES: readonly TemplateRule[] = Object.freeze([]);

export const normalizeFilesExplorerDensity = (
  value: unknown,
): FilesExplorerDensity =>
  typeof value === "string" && FILES_EXPLORER_DENSITIES.has(value as FilesExplorerDensity)
    ? value as FilesExplorerDensity
    : DEFAULT_FILES_EXPLORER_DENSITY;

export const normalizeFilesExplorerShowBadges = (
  value: unknown,
): boolean =>
  typeof value === "boolean"
    ? value
    : DEFAULT_FILES_EXPLORER_SHOW_BADGES;

export const normalizeTableTemplateVisualizationEnabled = (
  value: unknown,
): boolean =>
  typeof value === "boolean"
    ? value
    : DEFAULT_TABLE_TEMPLATE_VISUALIZATION_ENABLED;

export const normalizeTableAutoFitColumnWidthsEnabled = (
  value: unknown,
): boolean =>
  typeof value === "boolean"
    ? value
    : DEFAULT_TABLE_AUTO_FIT_COLUMN_WIDTHS_ENABLED;

export const normalizeFilesExplorerBadgeColor = (
  value: unknown,
): FilesExplorerBadgeColor =>
  typeof value === "string" && FILES_EXPLORER_BADGE_COLORS.has(value as FilesExplorerBadgeColor)
    ? value as FilesExplorerBadgeColor
    : "neutral";

export const normalizeFilesExplorerBadgeColors = (
  value: unknown,
): FilesExplorerBadgeColors => {
  const raw = typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const colors: Record<string, FilesExplorerBadgeColor> = {
    ...DEFAULT_FILES_EXPLORER_BADGE_COLORS,
  };

  for (const key of Object.keys(DEFAULT_FILES_EXPLORER_BADGE_COLORS)) {
    const color = normalizeFilesExplorerBadgeColor(raw[key]);
    colors[key] = color === "neutral" && raw[key] !== "neutral"
      ? DEFAULT_FILES_EXPLORER_BADGE_COLORS[key]
      : color;
  }

  return colors;
};

export const normalizeNumericDisplayMode = (
  value: unknown,
): NumericDisplayMode =>
  typeof value === "string" && NUMERIC_DISPLAY_MODES.has(value as NumericDisplayMode)
    ? value as NumericDisplayMode
    : DEFAULT_NUMERIC_DISPLAY_MODE;

export const normalizeTemplateRules = (
  value: unknown,
): readonly TemplateRule[] => {
  if (!Array.isArray(value)) {
    return DEFAULT_TEMPLATE_RULES;
  }

  const rules: TemplateRule[] = [];
  const seenIds = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const raw = value[index];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      continue;
    }
    const record = raw as Record<string, unknown>;
    const label = typeof record.label === "string" ? record.label.trim() : "";
    if (!label) {
      continue;
    }
    const id = typeof record.id === "string" && record.id.trim()
      ? record.id.trim()
      : `template-rule-${index}`;
    if (seenIds.has(id)) {
      continue;
    }
    const priority = typeof record.priority === "number" && Number.isFinite(record.priority)
      ? record.priority
      : index + 1;
    const description = typeof record.description === "string" ? record.description.trim() : "";
    const badge = typeof record.badge === "string" ? record.badge.trim() : "";
    seenIds.add(id);
    rules.push({
      id,
      label,
      ...(description ? { description } : {}),
      priority,
      ...(badge ? { badge } : {}),
      xTerms: normalizeTemplateRuleTermList(record.xTerms),
      yTerms: normalizeTemplateRuleTermList(record.yTerms),
      enabled: record.enabled !== false,
    });
  }
  return rules;
};

const normalizeTemplateRuleTermList = (
  value: unknown,
): readonly string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const term = typeof item === "string" ? item.trim() : "";
    if (!term) {
      continue;
    }
    const key = term
      .replace(/\u00b5|\u03bc/g, "u")
      .replace(/\u03a9|\u03c9|\u2126/g, "ohm")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "");
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(term);
  }
  return result;
};

export type ConductorSettings = {
  backgroundColor?: string;
  filesExplorerBadgeColors?: FilesExplorerBadgeColors;
  filesExplorerDensity?: FilesExplorerDensity;
  filesExplorerShowBadges?: boolean;
  language?: LanguagePreference;
  numericDisplayMode?: NumericDisplayMode;
  tableAutoFitColumnWidthsEnabled?: boolean;
  tableTemplateVisualizationEnabled?: boolean;
  templateRules?: readonly TemplateRule[];
  theme?: ThemeMode;
  transparentChrome?: boolean;
  windowCloseBehavior?: "minimizeToTray" | "quit";
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
  originPlotSymbolShapeDefault?: number;
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
  [key: string]: unknown;
};

export const ISettingsService = createDecorator<ISettingsService>("settingsService");

export type SettingsPersistence = {
  getSettings: () => Promise<unknown>;
  updateSettings: (updates: unknown) => Promise<unknown>;
};

export type SettingsAppUpdateInput = {
  readonly currentVersion: string | null;
  readonly isAvailable: boolean;
};

export type SettingsServiceOptions = {
  appUpdateSettings: SettingsAppUpdateInput;
  isWindowsDesktopShell: boolean;
  language: LanguagePreference;
  settingsPersistence?: SettingsPersistence;
  theme: ThemeMode;
};

export type SettingsViewInput = {
  readonly appUpdateSettings: SettingsAppUpdateInput;
  readonly conductorSettings: ConductorSettings | null;
  readonly conductorSettingsLoaded: boolean;
  readonly isWindowsDesktopShell: boolean;
  readonly language: LanguagePreference;
  readonly theme: ThemeMode;
};

export type OriginSettingsViewInput = {
  readonly axisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
  readonly options?: OriginPlotOptions;
};

export interface ISettingsService {
  readonly _serviceBrand: undefined;

  readonly onDidChangeConductorSettings: Event<ConductorSettings | null>;
  readonly onDidChangeNumericDisplayMode: Event<NumericDisplayMode>;
  readonly onDidChangeOriginSettingsViewInput: Event<void>;
  readonly onDidChangeSettingsViewInput: Event<void>;

  canCheckOriginHealth(): boolean;
  canManageOrigin(): boolean;
  canRunOriginCleanup(): boolean;
  checkOriginHealth(path: string): Promise<OriginHealthResult>;
  chooseOriginExePath(): Promise<string>;
  errorMessage(error: unknown): string;
  formatOriginError(error: unknown): string;
  getConductorSettings(): ConductorSettings | null;
  getOriginExePath(): Promise<string>;
  getOriginSettingsViewInput(): OriginSettingsViewInput;
  getSettingsViewInput(): SettingsViewInput | null;
  mergeConductorSettings(nextSettings: ConductorSettings | null): void;
  runOriginCleanup(): Promise<OriginCleanupResult>;
  update(options: SettingsServiceOptions): void;
  updateOriginPlotOptions(updates: Partial<OriginPlotOptions>): Promise<ConductorSettings | null>;
  updatePlotAxisSettings(updates: Record<string, unknown>): Promise<ConductorSettings | null>;
  updateSettings(updates: unknown): Promise<ConductorSettings | null>;
}

export const getOriginOpenPlotOptions = (
  settings: ConductorSettings | null,
): OriginPlotOptions =>
  normalizeOriginPlotOptions(
    {
      command: settings?.originPlotCommandDefault,
      postCommands: settings?.originPlotPostCommandsDefault,
      type: settings?.originPlotTypeDefault,
      lineWidth: settings?.originPlotLineWidthDefault,
      symbolShape: settings?.originPlotSymbolShapeDefault,
      legendFontSize: settings?.originPlotLegendFontSizeDefault,
      xyPairs: settings?.originPlotXyPairsDefault,
    },
    DEFAULT_ORIGIN_PLOT_OPTIONS,
  );
