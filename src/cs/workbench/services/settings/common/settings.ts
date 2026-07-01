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
export type TemplateXAxisIntent =
  | "rawTransient"
  | "ivCurve"
  | "pvCurve"
  | "cvCurve"
  | "frequencySweep"
  | "genericXY";

export type TemplateSemanticAxisTendency = "x" | "dependent" | "unknown";
export type TemplateSemanticUnit = "V" | "A" | "ohm" | "s" | "F" | "Hz" | "S";

export type TemplateSemanticTermRule = {
  readonly id: string;
  readonly alias: string;
  readonly canonicalUnit?: TemplateSemanticUnit;
  readonly axisTendency: TemplateSemanticAxisTendency;
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
const TEMPLATE_X_AXIS_INTENTS = new Set<TemplateXAxisIntent>([
  "pvCurve",
  "ivCurve",
  "cvCurve",
  "frequencySweep",
  "rawTransient",
  "genericXY",
]);
const TEMPLATE_SEMANTIC_AXIS_TENDENCIES = new Set<TemplateSemanticAxisTendency>([
  "x",
  "dependent",
  "unknown",
]);
const TEMPLATE_SEMANTIC_UNITS = new Set<TemplateSemanticUnit>([
  "V",
  "A",
  "ohm",
  "s",
  "F",
  "Hz",
  "S",
]);
export const DEFAULT_FILES_EXPLORER_DENSITY: FilesExplorerDensity = "compact";
export const DEFAULT_FILES_EXPLORER_SHOW_BADGES = true;
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
export const DEFAULT_TEMPLATE_X_AXIS_INTENT_PRIORITY: readonly TemplateXAxisIntent[] = Object.freeze([
  "pvCurve",
  "ivCurve",
  "cvCurve",
  "frequencySweep",
  "rawTransient",
  "genericXY",
]);
export const DEFAULT_TEMPLATE_SEMANTIC_ALLOWLIST: readonly TemplateSemanticTermRule[] = Object.freeze([]);
export const DEFAULT_TEMPLATE_DISABLED_BUILTIN_SEMANTIC_IDS: readonly string[] = Object.freeze([]);
export const DEFAULT_TEMPLATE_DISABLED_BUILTIN_DOMAIN_PACK_IDS: readonly string[] = Object.freeze([]);
export const DEFAULT_TEMPLATE_SEMANTIC_TERM_ORDER: readonly string[] = Object.freeze([]);

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

export const normalizeTemplateXAxisIntentPriority = (
  value: unknown,
): readonly TemplateXAxisIntent[] => {
  const seen = new Set<TemplateXAxisIntent>();
  const result: TemplateXAxisIntent[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item !== "string" || !TEMPLATE_X_AXIS_INTENTS.has(item as TemplateXAxisIntent)) {
        continue;
      }
      const intent = item as TemplateXAxisIntent;
      if (!seen.has(intent)) {
        seen.add(intent);
        result.push(intent);
      }
    }
  }

  for (const intent of DEFAULT_TEMPLATE_X_AXIS_INTENT_PRIORITY) {
    if (!seen.has(intent)) {
      result.push(intent);
    }
  }
  return result;
};

export const normalizeTemplateSemanticAllowlist = (
  value: unknown,
): readonly TemplateSemanticTermRule[] => {
  if (!Array.isArray(value)) {
    return DEFAULT_TEMPLATE_SEMANTIC_ALLOWLIST;
  }

  const rules: TemplateSemanticTermRule[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const raw = value[index];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      continue;
    }
    const record = raw as Record<string, unknown>;
    const alias = typeof record.alias === "string" ? record.alias.trim() : "";
    if (!alias) {
      continue;
    }
    const axisTendency = typeof record.axisTendency === "string" && TEMPLATE_SEMANTIC_AXIS_TENDENCIES.has(record.axisTendency as TemplateSemanticAxisTendency)
      ? record.axisTendency as TemplateSemanticAxisTendency
      : "unknown";
    const id = typeof record.id === "string" && record.id.trim()
      ? record.id.trim()
      : `template-semantic-${index}`;
    const canonicalUnit = typeof record.canonicalUnit === "string" && TEMPLATE_SEMANTIC_UNITS.has(record.canonicalUnit as TemplateSemanticUnit)
      ? record.canonicalUnit as TemplateSemanticUnit
      : undefined;
    rules.push({
      id,
      alias,
      ...(canonicalUnit ? { canonicalUnit } : {}),
      axisTendency,
      enabled: record.enabled !== false,
    });
  }
  return rules;
};

export const normalizeTemplateDisabledBuiltinSemanticIds = (
  value: unknown,
): readonly string[] => {
  if (!Array.isArray(value)) {
    return DEFAULT_TEMPLATE_DISABLED_BUILTIN_SEMANTIC_IDS;
  }
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of value) {
    const id = typeof item === "string" ? item.trim() : "";
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
  }
  return ids;
};

export const normalizeTemplateDisabledBuiltinDomainPackIds = (
  value: unknown,
): readonly string[] => {
  if (!Array.isArray(value)) {
    return DEFAULT_TEMPLATE_DISABLED_BUILTIN_DOMAIN_PACK_IDS;
  }
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of value) {
    const id = typeof item === "string" ? item.trim() : "";
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
  }
  return ids;
};

export const normalizeTemplateSemanticTermOrder = (
  value: unknown,
): readonly string[] => {
  if (!Array.isArray(value)) {
    return DEFAULT_TEMPLATE_SEMANTIC_TERM_ORDER;
  }
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of value) {
    const id = typeof item === "string" ? item.trim() : "";
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
  }
  return ids;
};

export type ConductorSettings = {
  backgroundColor?: string;
  filesExplorerBadgeColors?: FilesExplorerBadgeColors;
  filesExplorerDensity?: FilesExplorerDensity;
  filesExplorerShowBadges?: boolean;
  fileNameFieldSeparators?: string;
  language?: LanguagePreference;
  numericDisplayMode?: NumericDisplayMode;
  tableTemplateVisualizationEnabled?: boolean;
  templateDisabledBuiltinDomainPackIds?: readonly string[];
  templateDisabledBuiltinSemanticIds?: readonly string[];
  templateSemanticAllowlist?: readonly TemplateSemanticTermRule[];
  templateSemanticTermOrder?: readonly string[];
  templateXAxisIntentPriority?: readonly TemplateXAxisIntent[];
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
