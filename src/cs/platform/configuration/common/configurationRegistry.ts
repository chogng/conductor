import { Emitter, type Event } from "../../../base/common/event.js";
import type { IJSONSchema } from "../../../base/common/jsonSchema.js";
import { Registry } from "../../registry/common/platform.js";

export const Extensions = {
  Configuration: "base.contributions.configuration",
} as const;

export const OVERRIDE_PROPERTY_REGEX = /^\[([^\]]+)\]$/;

export const enum ConfigurationScope {
  APPLICATION = 1,
  MACHINE,
  APPLICATION_MACHINE,
  WINDOW,
  RESOURCE,
  LANGUAGE_OVERRIDABLE,
  MACHINE_OVERRIDABLE,
}

export interface IConfigurationPropertySchema extends IJSONSchema {
  readonly scope?: ConfigurationScope;
  readonly restricted?: boolean;
  readonly included?: boolean;
  readonly tags?: readonly string[];
  readonly ignoreSync?: boolean;
  readonly disallowSyncIgnore?: boolean;
  readonly disallowConfigurationDefault?: boolean;
  readonly enumItemLabels?: readonly string[];
  readonly keywords?: readonly string[];
  readonly order?: number;
}

export interface IRegisteredConfigurationPropertySchema extends IConfigurationPropertySchema {
  readonly defaultDefaultValue?: unknown;
  readonly source?: IConfigurationNode;
}

export interface IConfigurationNode {
  readonly id?: string;
  readonly order?: number;
  readonly title?: string;
  readonly type?: string;
  readonly scope?: ConfigurationScope;
  readonly properties?: Record<string, IConfigurationPropertySchema>;
}

export interface IConfigurationRegistry {
  readonly onDidSchemaChange: Event<void>;
  readonly onDidUpdateConfiguration: Event<ReadonlySet<string>>;

  registerConfiguration(configuration: IConfigurationNode): IConfigurationNode;
  registerConfigurations(configurations: readonly IConfigurationNode[]): void;
  deregisterConfigurations(configurations: readonly IConfigurationNode[]): void;
  getConfigurations(): readonly IConfigurationNode[];
  getConfigurationProperties(): Record<string, IRegisteredConfigurationPropertySchema>;
}

export function overrideIdentifiersFromKey(key: string): string[] {
  const match = OVERRIDE_PROPERTY_REGEX.exec(key);
  if (!match) {
    return [];
  }

  return match[1]
    .split(",")
    .map(identifier => identifier.trim())
    .filter(Boolean);
}

export function keyFromOverrideIdentifiers(overrideIdentifiers: readonly string[]): string {
  return `[${overrideIdentifiers.join(",")}]`;
}

type OriginPlotOptions = {
  plotType: number;
  xyPairs: string;
  plotCommand: string;
  postPlotCommands: string[];
  lineWidth: number;
  symbolShape: number;
  legendFontSize: string | number;
};

type JsonRecord = Record<string, unknown>;

type PlotAxisSettings = {
  xMin: string;
  xMax: string;
  xTicks: "auto" | "nice" | "step";
  xTickCount: number;
  xStep: string;
  xTooltipDigits: string | number;
  yMin: string;
  yMax: string;
  yScale: "linear" | "log" | "logAbs";
  yLogCurrentMode: "all" | "positive";
  yTicks: "auto" | "nice" | "step" | "decades";
  yTickCount: number;
  yStep: string;
  yDecadeStep: number;
  showGrid: boolean;
  showMajorTicks: boolean;
  showMinorTicks: boolean;
  minorTickCount: string | number;
  tickLabelFontSize: string | number;
  axisTitleFontSize: string | number;
  originTickLabelOffset: string;
  originAxisTitleGap: string;
};

type NumericDisplayMode = "raw" | "smart";
type TemplateRule = {
  id: string;
  label: string;
  description?: string;
  priority: number;
  badge?: string;
  xTerms: string[];
  yTerms: string[];
  enabled: boolean;
};

export type ConductorSettings = JsonRecord & {
  language: string;
  numericDisplayMode: NumericDisplayMode;
  tableAutoFitColumnWidthsEnabled: boolean;
  tableTemplateVisualizationEnabled: boolean;
  templateRules: TemplateRule[];
  theme: string;
  backgroundColor: string;
  filesExplorerBadgeColors: Record<string, string>;
  filesExplorerDensity: string;
  filesExplorerShowBadges: boolean;
  transparentChrome: boolean;
  windowCloseBehavior: string;
  stopOnErrorDefault: boolean;
  ionIoffMethodDefault: string;
  defaultYScaleForTransfer: string;
  defaultYScaleForOutput: string;
  defaultYScaleForCf: string;
  defaultYScaleForCv: string;
  defaultYScaleForPv: string;
  defaultYScaleForSpecial: string;
  ssMethodDefault: string;
  ssShowFitLine: boolean;
  ssIdLow: number;
  ssIdHigh: number;
  originExePath: string | null;
  originExportModeDefault: string;
  originPlotTypeDefault: number;
  originPlotXyPairsDefault: string;
  originPlotCommandDefault: string;
  originPlotPostCommandsDefault: string[];
  originPlotLineWidthDefault: number;
  originPlotSymbolShapeDefault: number;
  originPlotLegendFontSizeDefault: string | number;
  originRuntimeCleanupEnabled: boolean;
  originRuntimeKeepSuccessJobs: number;
  originRuntimeFailedRetentionDays: number;
  plotAxisSettings: PlotAxisSettings;
};

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isSetValue = (set: ReadonlySet<string>, value: unknown): value is string =>
  typeof value === "string" && set.has(value);

const DEFAULT_ORIGIN_PLOT_OPTIONS = Object.freeze<OriginPlotOptions>({
  plotType: 202,
  xyPairs: "((1,2))",
  plotCommand: "",
  postPlotCommands: [],
  lineWidth: 2,
  symbolShape: 1,
  legendFontSize: "",
});

function normalizeNonEmptyString(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function normalizeBoundedFloat(value: unknown, fallback: number, min: number, max: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num * 100) / 100));
}

function normalizeOriginPostPlotCommands(value: unknown): string[] {
  if (Array.isArray(value)) {
    const normalized: string[] = [];
    for (const item of value) {
      if (typeof item !== "string") continue;
      const trimmed = item.trim();
      if (!trimmed) continue;
      normalized.push(trimmed);
    }
    return normalized;
  }

  if (typeof value === "string") {
    return value
      .split(/\r?\n/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeOriginPlotOptions(rawOptions: unknown, fallbackOptions: OriginPlotOptions | undefined = undefined): OriginPlotOptions {
  const raw = isRecord(rawOptions) ? rawOptions : {};
  const fallbackBase = fallbackOptions ?? DEFAULT_ORIGIN_PLOT_OPTIONS;
  const fallback =
    fallbackBase && typeof fallbackBase === "object"
      ? {
          ...DEFAULT_ORIGIN_PLOT_OPTIONS,
          ...fallbackBase,
        }
      : DEFAULT_ORIGIN_PLOT_OPTIONS;

  const plotType = normalizeBoundedInt(
    (raw as { plotType?: unknown; type?: unknown }).plotType ??
      (raw as { type?: unknown }).type,
    fallback.plotType,
    0,
    9999,
  );
  const xyPairs = normalizeNonEmptyString(
    (raw as { xyPairs?: unknown }).xyPairs,
    fallback.xyPairs,
  );
  const plotCommand = normalizeNonEmptyString(
    (raw as { plotCommand?: unknown; command?: unknown }).plotCommand ??
      (raw as { command?: unknown }).command,
    fallback.plotCommand,
  );
  const postPlotCommands = normalizeOriginPostPlotCommands(
    Object.prototype.hasOwnProperty.call(raw, "postPlotCommands")
      ? (raw as { postPlotCommands?: unknown }).postPlotCommands
      : Object.prototype.hasOwnProperty.call(raw, "postCommands")
        ? (raw as { postCommands?: unknown }).postCommands
        : fallback.postPlotCommands,
  );
  const fallbackLineWidth = normalizeBoundedFloat(
    fallback.lineWidth,
    DEFAULT_ORIGIN_PLOT_OPTIONS.lineWidth,
    0.5,
    20,
  );
  const lineWidth = normalizeBoundedFloat(
    (raw as { lineWidth?: unknown; linewidth?: unknown; line_width?: unknown }).lineWidth ??
      (raw as { linewidth?: unknown }).linewidth ??
      (raw as { line_width?: unknown }).line_width,
    fallbackLineWidth,
    0.5,
    20,
  );
  const symbolShape = normalizeBoundedInt(
    (raw as { symbolShape?: unknown; symbol?: unknown; symbol_shape?: unknown }).symbolShape ??
      (raw as { symbol?: unknown }).symbol ??
      (raw as { symbol_shape?: unknown }).symbol_shape,
    fallback.symbolShape,
    0,
    58,
  );
  const legendFontSize = normalizeOptionalRoundedBoundedInt(
    (raw as { legendFontSize?: unknown; legend_font_size?: unknown }).legendFontSize ??
      (raw as { legend_font_size?: unknown }).legend_font_size,
    fallback.legendFontSize,
    1,
    96,
  );

  return {
    plotType,
    xyPairs,
    plotCommand,
    postPlotCommands,
    lineWidth,
    symbolShape,
    legendFontSize,
  };
}

function normalizeOriginExePath(inputPath: unknown): string | null {
  if (typeof inputPath !== "string") return null;
  const normalized = inputPath.trim();
  return normalized || null;
}

const SS_METHODS = new Set(["auto", "manual"]);
const ION_IOFF_METHODS = new Set(["auto", "manual"]);
const FILES_EXPLORER_DENSITIES = new Set([
  "compact",
  "default",
  "comfortable",
]);
const FILES_EXPLORER_BADGE_COLORS = new Set([
  "neutral",
  "blue",
  "green",
  "purple",
  "orange",
  "red",
  "cyan",
]);
const DEFAULT_FILES_EXPLORER_BADGE_COLORS = Object.freeze<Record<string, string>>({
  cf: "cyan",
  cv: "purple",
  mixed: "neutral",
  output: "green",
  pv: "red",
  transfer: "blue",
  unknown: "orange",
});
const LANGUAGES = new Set(["system", "en", "zh"]);
const NUMERIC_DISPLAY_MODES = new Set(["raw", "smart"]);
const ORIGIN_EXPORT_MODES = new Set([
  "merged",
  "workbookBooks",
  "workbookSheets",
  "separate",
]);
const THEMES = new Set(["system", "light", "dark"]);
const WINDOW_CLOSE_BEHAVIORS = new Set([
  "minimizeToTray",
  "quit",
]);
const DEFAULT_BACKGROUND_COLOR = "#f3f4f6";
const BACKGROUND_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export const DEFAULT_CONDUCTOR_CONFIGURATION: ConductorSettings = {
  language: "system",
  numericDisplayMode: "raw",
  tableAutoFitColumnWidthsEnabled: false,
  tableTemplateVisualizationEnabled: false,
  templateRules: [],
  theme: "system",
  backgroundColor: DEFAULT_BACKGROUND_COLOR,
  filesExplorerBadgeColors: DEFAULT_FILES_EXPLORER_BADGE_COLORS,
  filesExplorerDensity: "compact",
  filesExplorerShowBadges: true,
  transparentChrome: true,
  windowCloseBehavior: "minimizeToTray",
  stopOnErrorDefault: false,
  ionIoffMethodDefault: "auto",
  defaultYScaleForTransfer: "log",
  defaultYScaleForOutput: "linear",
  defaultYScaleForCf: "linear",
  defaultYScaleForCv: "linear",
  defaultYScaleForPv: "linear",
  defaultYScaleForSpecial: "linear",
  ssMethodDefault: "auto",
  ssShowFitLine: true,
  ssIdLow: 1e-11,
  ssIdHigh: 1e-9,
  originExePath: null,
  originExportModeDefault: "merged",
  originPlotTypeDefault: 202,
  originPlotXyPairsDefault: "((1,2))",
  originPlotCommandDefault: "",
  originPlotPostCommandsDefault: [],
  originPlotLineWidthDefault: 2,
  originPlotSymbolShapeDefault: 1,
  originPlotLegendFontSizeDefault: "",
  originRuntimeCleanupEnabled: true,
  originRuntimeKeepSuccessJobs: 1,
  originRuntimeFailedRetentionDays: 7,
  plotAxisSettings: {
    xMin: "",
    xMax: "",
    xTicks: "auto",
    xTickCount: 6,
    xStep: "",
    xTooltipDigits: "",
    yMin: "",
    yMax: "",
    yScale: "linear",
    yLogCurrentMode: "all",
    yTicks: "nice",
    yTickCount: 6,
    yStep: "",
    yDecadeStep: 1,
    showGrid: true,
    showMajorTicks: true,
    showMinorTicks: true,
    minorTickCount: "",
    tickLabelFontSize: "",
    axisTitleFontSize: "",
    originTickLabelOffset: "",
    originAxisTitleGap: "",
  },
};

export const CONDUCTOR_CONFIGURATION_KEYS: readonly string[] = Object.keys(
  DEFAULT_CONDUCTOR_CONFIGURATION,
);

const STARTUP_DEFAULTS = {
  defaultYScaleForTransfer: DEFAULT_CONDUCTOR_CONFIGURATION.defaultYScaleForTransfer,
  defaultYScaleForOutput: DEFAULT_CONDUCTOR_CONFIGURATION.defaultYScaleForOutput,
  defaultYScaleForCf: DEFAULT_CONDUCTOR_CONFIGURATION.defaultYScaleForCf,
  defaultYScaleForCv: DEFAULT_CONDUCTOR_CONFIGURATION.defaultYScaleForCv,
  defaultYScaleForPv: DEFAULT_CONDUCTOR_CONFIGURATION.defaultYScaleForPv,
  defaultYScaleForSpecial: DEFAULT_CONDUCTOR_CONFIGURATION.defaultYScaleForSpecial,
  plotAxisSettings: {
    tickLabelFontSize: DEFAULT_CONDUCTOR_CONFIGURATION.plotAxisSettings.tickLabelFontSize,
    axisTitleFontSize: DEFAULT_CONDUCTOR_CONFIGURATION.plotAxisSettings.axisTitleFontSize,
  },
};

function normalizePositiveNumber(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeBackgroundColor(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_CONDUCTOR_CONFIGURATION.backgroundColor;
  }

  const normalized = value.trim();
  return BACKGROUND_COLOR_PATTERN.test(normalized)
    ? normalized.toLowerCase()
    : DEFAULT_CONDUCTOR_CONFIGURATION.backgroundColor;
}

function normalizeBoundedInt(value: unknown, fallback: number, min: number, max: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(num)));
}

function normalizeRoundedBoundedInt(value: unknown, fallback: number, min: number, max: number): number;
function normalizeRoundedBoundedInt(value: unknown, fallback: string | number, min: number, max: number): string | number;
function normalizeRoundedBoundedInt(value: unknown, fallback: string | number, min: number, max: number): string | number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

function normalizeOptionalRoundedBoundedInt(
  value: unknown,
  fallback: string | number,
  min: number,
  max: number,
): string | number {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  if (!text) return "";
  return normalizeRoundedBoundedInt(text, fallback, min, max);
}

function normalizeFiniteNumberText(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  if (!text) return "";
  const num = Number(text);
  return Number.isFinite(num) ? text : "";
}

function normalizeIntegerText(value: unknown, min: number, max: number): string {
  const text = normalizeFiniteNumberText(value);
  if (!text) return "";
  return String(normalizeRoundedBoundedInt(text, min, min, max));
}

function normalizeFilesExplorerBadgeColors(value: unknown): Record<string, string> {
  const raw = isRecord(value) ? value : {};
  const colors: Record<string, string> = { ...DEFAULT_FILES_EXPLORER_BADGE_COLORS };

  for (const key of Object.keys(DEFAULT_FILES_EXPLORER_BADGE_COLORS)) {
    const color = raw[key];
    colors[key] = typeof color === "string" && FILES_EXPLORER_BADGE_COLORS.has(color)
      ? color
      : DEFAULT_FILES_EXPLORER_BADGE_COLORS[key];
  }

  return colors;
}

function normalizeTemplateRules(value: unknown): TemplateRule[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const rules: TemplateRule[] = [];
  const seenIds = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const raw = value[index];
    if (!isRecord(raw)) {
      continue;
    }
    const label = typeof raw.label === "string" ? raw.label.trim() : "";
    if (!label) {
      continue;
    }
    const id = typeof raw.id === "string" && raw.id.trim()
      ? raw.id.trim()
      : `template-rule-${index}`;
    if (seenIds.has(id)) {
      continue;
    }
    seenIds.add(id);
    rules.push({
      id,
      label,
      ...(typeof raw.description === "string" && raw.description.trim() ? { description: raw.description.trim() } : {}),
      priority: typeof raw.priority === "number" && Number.isFinite(raw.priority) ? raw.priority : index + 1,
      ...(typeof raw.badge === "string" && raw.badge.trim() ? { badge: raw.badge.trim() } : {}),
      xTerms: normalizeTemplateRuleTerms(raw.xTerms),
      yTerms: normalizeTemplateRuleTerms(raw.yTerms),
      enabled: raw.enabled !== false,
    });
  }
  return rules;
}

function normalizeTemplateRuleTerms(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
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
}

function normalizePlotAxisSettings(
  value: unknown,
  fallback: PlotAxisSettings = DEFAULT_CONDUCTOR_CONFIGURATION.plotAxisSettings,
): PlotAxisSettings {
  const raw = isRecord(value) ? value : {};
  const yScale = raw.yScale === "log" || raw.yScale === "logAbs" ? raw.yScale : fallback.yScale;
  const xTicks = raw.xTicks === "nice" || raw.xTicks === "step" ? raw.xTicks : "auto";
  const yTicks =
    yScale !== "linear"
      ? raw.yTicks === "auto"
        ? "auto"
        : "decades"
      : raw.yTicks === "auto" || raw.yTicks === "step"
        ? raw.yTicks
        : "nice";

  return {
    xMin: normalizeFiniteNumberText(raw.xMin ?? fallback.xMin),
    xMax: normalizeFiniteNumberText(raw.xMax ?? fallback.xMax),
    xTicks,
    xTickCount: normalizeRoundedBoundedInt(raw.xTickCount, fallback.xTickCount, 2, 20),
    xStep: normalizeFiniteNumberText(raw.xStep ?? fallback.xStep),
    xTooltipDigits: normalizeIntegerText(raw.xTooltipDigits ?? fallback.xTooltipDigits, 0, 20),
    yMin: normalizeFiniteNumberText(raw.yMin ?? fallback.yMin),
    yMax: normalizeFiniteNumberText(raw.yMax ?? fallback.yMax),
    yScale,
    yLogCurrentMode: raw.yLogCurrentMode === "positive" ? "positive" : "all",
    yTicks,
    yTickCount: normalizeRoundedBoundedInt(raw.yTickCount, fallback.yTickCount, 2, 20),
    yStep: normalizeFiniteNumberText(raw.yStep ?? fallback.yStep),
    yDecadeStep: normalizeRoundedBoundedInt(raw.yDecadeStep, fallback.yDecadeStep, 1, 10),
    showGrid: typeof raw.showGrid === "boolean" ? raw.showGrid : fallback.showGrid,
    showMajorTicks:
      typeof raw.showMajorTicks === "boolean" ? raw.showMajorTicks : fallback.showMajorTicks,
    showMinorTicks:
      typeof raw.showMinorTicks === "boolean" ? raw.showMinorTicks : fallback.showMinorTicks,
    minorTickCount: normalizeOptionalRoundedBoundedInt(
      raw.minorTickCount,
      fallback.minorTickCount,
      1,
      20,
    ),
    tickLabelFontSize: normalizeOptionalRoundedBoundedInt(
      raw.tickLabelFontSize,
      fallback.tickLabelFontSize,
      1,
      96,
    ),
    axisTitleFontSize: normalizeOptionalRoundedBoundedInt(
      raw.axisTitleFontSize,
      fallback.axisTitleFontSize,
      1,
      96,
    ),
    originTickLabelOffset: normalizeFiniteNumberText(
      raw.originTickLabelOffset ?? fallback.originTickLabelOffset,
    ),
    originAxisTitleGap: normalizeFiniteNumberText(
      raw.originAxisTitleGap ?? fallback.originAxisTitleGap,
    ),
  };
}

export function normalizeConductorSettings(raw: unknown): ConductorSettings {
  const next = isRecord(raw) ? { ...raw } : {};
  delete next.fileNameFieldSeparators;
  delete next.templateDisabledBuiltinDomainPackIds;

  const language = isSetValue(LANGUAGES, next.language)
    ? next.language
    : DEFAULT_CONDUCTOR_CONFIGURATION.language;
  const ssMethodDefault = isSetValue(SS_METHODS, next.ssMethodDefault)
    ? next.ssMethodDefault
    : DEFAULT_CONDUCTOR_CONFIGURATION.ssMethodDefault;
  const ionIoffMethodDefault = isSetValue(ION_IOFF_METHODS, next.ionIoffMethodDefault)
    ? next.ionIoffMethodDefault
    : DEFAULT_CONDUCTOR_CONFIGURATION.ionIoffMethodDefault;
  const theme = isSetValue(THEMES, next.theme)
    ? next.theme
    : DEFAULT_CONDUCTOR_CONFIGURATION.theme;
  const numericDisplayMode = isSetValue(NUMERIC_DISPLAY_MODES, next.numericDisplayMode)
    ? next.numericDisplayMode as NumericDisplayMode
    : DEFAULT_CONDUCTOR_CONFIGURATION.numericDisplayMode;
  const tableTemplateVisualizationEnabled = normalizeBoolean(
    next.tableTemplateVisualizationEnabled,
    DEFAULT_CONDUCTOR_CONFIGURATION.tableTemplateVisualizationEnabled,
  );
  const tableAutoFitColumnWidthsEnabled = normalizeBoolean(
    next.tableAutoFitColumnWidthsEnabled,
    DEFAULT_CONDUCTOR_CONFIGURATION.tableAutoFitColumnWidthsEnabled,
  );
  const templateRules = normalizeTemplateRules(
    next.templateRules,
  );
  const filesExplorerDensity = isSetValue(
    FILES_EXPLORER_DENSITIES,
    next.filesExplorerDensity,
  )
    ? next.filesExplorerDensity
    : DEFAULT_CONDUCTOR_CONFIGURATION.filesExplorerDensity;
  const filesExplorerShowBadges = normalizeBoolean(
    next.filesExplorerShowBadges,
    DEFAULT_CONDUCTOR_CONFIGURATION.filesExplorerShowBadges,
  );
  const filesExplorerBadgeColors = normalizeFilesExplorerBadgeColors(
    next.filesExplorerBadgeColors,
  );
  const backgroundColor = normalizeBackgroundColor(next.backgroundColor);
  const transparentChrome = normalizeBoolean(
    next.transparentChrome,
    DEFAULT_CONDUCTOR_CONFIGURATION.transparentChrome,
  );
  const windowCloseBehavior = isSetValue(
    WINDOW_CLOSE_BEHAVIORS,
    next.windowCloseBehavior,
  )
    ? next.windowCloseBehavior
    : DEFAULT_CONDUCTOR_CONFIGURATION.windowCloseBehavior;
  const ssShowFitLine =
    typeof next.ssShowFitLine === "boolean"
      ? next.ssShowFitLine
      : DEFAULT_CONDUCTOR_CONFIGURATION.ssShowFitLine;

  const stopOnErrorDefault =
    normalizeBoolean(
      next.stopOnErrorDefault,
      DEFAULT_CONDUCTOR_CONFIGURATION.stopOnErrorDefault,
    );
  const ssIdLow = normalizePositiveNumber(
    next.ssIdLow,
    DEFAULT_CONDUCTOR_CONFIGURATION.ssIdLow,
  );
  const ssIdHigh = normalizePositiveNumber(
    next.ssIdHigh,
    DEFAULT_CONDUCTOR_CONFIGURATION.ssIdHigh,
  );
  const originExePath = normalizeOriginExePath(next.originExePath);
  const originExportModeDefault = isSetValue(
    ORIGIN_EXPORT_MODES,
    next.originExportModeDefault,
  )
    ? next.originExportModeDefault
    : DEFAULT_CONDUCTOR_CONFIGURATION.originExportModeDefault;
  const originPlotDefaults = normalizeOriginPlotOptions({
    plotCommand: DEFAULT_CONDUCTOR_CONFIGURATION.originPlotCommandDefault,
    plotType: DEFAULT_CONDUCTOR_CONFIGURATION.originPlotTypeDefault,
    postPlotCommands: DEFAULT_CONDUCTOR_CONFIGURATION.originPlotPostCommandsDefault,
    lineWidth: DEFAULT_CONDUCTOR_CONFIGURATION.originPlotLineWidthDefault,
    symbolShape: DEFAULT_CONDUCTOR_CONFIGURATION.originPlotSymbolShapeDefault,
    legendFontSize: DEFAULT_CONDUCTOR_CONFIGURATION.originPlotLegendFontSizeDefault,
    xyPairs: DEFAULT_CONDUCTOR_CONFIGURATION.originPlotXyPairsDefault,
  });
  const plotAxisSettings = normalizePlotAxisSettings(
    next.plotAxisSettings,
  );
  const originPlotSettings = normalizeOriginPlotOptions(
    {
      plotCommand: next.originPlotCommandDefault,
      plotType: next.originPlotTypeDefault,
      postPlotCommands: next.originPlotPostCommandsDefault,
      lineWidth: next.originPlotLineWidthDefault,
      symbolShape: next.originPlotSymbolShapeDefault,
      legendFontSize: next.originPlotLegendFontSizeDefault,
      xyPairs: next.originPlotXyPairsDefault,
    },
    originPlotDefaults,
  );
  const originRuntimeCleanupEnabled =
    typeof next.originRuntimeCleanupEnabled === "boolean"
      ? next.originRuntimeCleanupEnabled
      : DEFAULT_CONDUCTOR_CONFIGURATION.originRuntimeCleanupEnabled;
  const originRuntimeKeepSuccessJobs = normalizeBoundedInt(
    next.originRuntimeKeepSuccessJobs,
    DEFAULT_CONDUCTOR_CONFIGURATION.originRuntimeKeepSuccessJobs,
    0,
    100,
  );
  const originRuntimeFailedRetentionDays = normalizeBoundedInt(
    next.originRuntimeFailedRetentionDays,
    DEFAULT_CONDUCTOR_CONFIGURATION.originRuntimeFailedRetentionDays,
    1,
    365,
  );
  return {
    ...DEFAULT_CONDUCTOR_CONFIGURATION,
    ...next,
    language,
    stopOnErrorDefault,
    numericDisplayMode,
    tableAutoFitColumnWidthsEnabled,
    tableTemplateVisualizationEnabled,
    templateRules,
    theme,
    filesExplorerBadgeColors,
    filesExplorerDensity,
    filesExplorerShowBadges,
    backgroundColor,
    transparentChrome,
    windowCloseBehavior,
    ssMethodDefault,
    ionIoffMethodDefault,
    ssShowFitLine,
    ssIdLow,
    ssIdHigh,
    originExePath,
    originExportModeDefault,
    originPlotTypeDefault: originPlotSettings.plotType,
    originPlotXyPairsDefault: originPlotSettings.xyPairs,
    originPlotCommandDefault: originPlotSettings.plotCommand,
    originPlotPostCommandsDefault: originPlotSettings.postPlotCommands,
    originPlotLineWidthDefault: originPlotSettings.lineWidth,
    originPlotSymbolShapeDefault: originPlotSettings.symbolShape,
    originPlotLegendFontSizeDefault: originPlotSettings.legendFontSize,
    originRuntimeCleanupEnabled,
    originRuntimeKeepSuccessJobs,
    originRuntimeFailedRetentionDays,
    plotAxisSettings,
  };
}

export function cloneConductorSettings(settings: unknown): ConductorSettings {
  return normalizeConductorSettings(settings);
}

export function applyStartupConductorDefaults(settings: unknown): ConductorSettings {
  const normalized = normalizeConductorSettings(settings);
  return normalizeConductorSettings({
    ...normalized,
    ...STARTUP_DEFAULTS,
    plotAxisSettings: {
      ...normalized.plotAxisSettings,
      ...STARTUP_DEFAULTS.plotAxisSettings,
    },
  });
}

function createConductorConfigurationProperties(): Record<string, IConfigurationPropertySchema> {
  const properties: Record<string, IConfigurationPropertySchema> = Object.create(null);

  for (const [key, defaultValue] of Object.entries(DEFAULT_CONDUCTOR_CONFIGURATION)) {
    properties[key] = {
      default: defaultValue,
      scope: ConfigurationScope.APPLICATION,
      type: getJsonSchemaType(defaultValue),
    };
  }

  properties.filesExplorerDensity = {
    ...properties.filesExplorerDensity,
    enum: ["compact", "default", "comfortable"],
    enumItemLabels: ["Compact", "Default", "Comfortable"],
  };

  properties.numericDisplayMode = {
    ...properties.numericDisplayMode,
    enum: ["raw", "smart"],
    enumItemLabels: ["raw", "smart"],
  };

  properties.templateRules = {
    ...properties.templateRules,
    items: {
      additionalProperties: false,
      properties: {
        badge: { type: "string" },
        description: { type: "string" },
        enabled: { type: "boolean" },
        id: { type: "string" },
        label: { type: "string" },
        priority: { type: "number" },
        xTerms: {
          items: { type: "string" },
          type: "array",
        },
        yTerms: {
          items: { type: "string" },
          type: "array",
        },
      },
      required: ["id", "label", "priority", "xTerms", "yTerms", "enabled"],
      type: "object",
    },
  };

  return properties;
}

function getJsonSchemaType(value: unknown): IConfigurationPropertySchema["type"] {
  if (value === null) {
    return ["string", "null"];
  }

  if (Array.isArray(value)) {
    return "array";
  }

  switch (typeof value) {
    case "boolean":
      return "boolean";
    case "number":
      return "number";
    case "object":
      return "object";
    case "string":
    default:
      return "string";
  }
}

export const CONDUCTOR_CONFIGURATION_NODE: IConfigurationNode = {
  id: "conductor",
  title: "Conductor",
  type: "object",
  properties: createConductorConfigurationProperties(),
};

class ConfigurationRegistry implements IConfigurationRegistry {
  private readonly configurations: IConfigurationNode[] = [];
  private readonly properties = new Map<string, IRegisteredConfigurationPropertySchema>();
  private readonly onDidSchemaChangeEmitter = new Emitter<void>();
  private readonly onDidUpdateConfigurationEmitter = new Emitter<ReadonlySet<string>>();

  public readonly onDidSchemaChange = this.onDidSchemaChangeEmitter.event;
  public readonly onDidUpdateConfiguration = this.onDidUpdateConfigurationEmitter.event;

  public registerConfiguration(configuration: IConfigurationNode): IConfigurationNode {
    this.validateConfiguration(configuration);
    this.configurations.push(configuration);
    const updatedKeys = this.registerProperties(configuration);
    this.fireUpdatedConfiguration(updatedKeys);
    return configuration;
  }

  public registerConfigurations(configurations: readonly IConfigurationNode[]): void {
    const updatedKeys = new Set<string>();

    for (const configuration of configurations) {
      this.validateConfiguration(configuration);
      this.configurations.push(configuration);
      for (const key of this.registerProperties(configuration)) {
        updatedKeys.add(key);
      }
    }

    this.fireUpdatedConfiguration(updatedKeys);
  }

  public deregisterConfigurations(configurations: readonly IConfigurationNode[]): void {
    const updatedKeys = new Set<string>();

    for (const configuration of configurations) {
      const index = this.configurations.indexOf(configuration);
      if (index !== -1) {
        this.configurations.splice(index, 1);
      }

      for (const key of Object.keys(configuration.properties ?? {})) {
        if (this.properties.get(key)?.source === configuration) {
          this.properties.delete(key);
          updatedKeys.add(key);
        }
      }
    }

    this.fireUpdatedConfiguration(updatedKeys);
  }

  public getConfigurations(): readonly IConfigurationNode[] {
    return this.configurations.slice();
  }

  public getConfigurationProperties(): Record<string, IRegisteredConfigurationPropertySchema> {
    const result: Record<string, IRegisteredConfigurationPropertySchema> = Object.create(null);

    for (const [key, value] of this.properties) {
      result[key] = value;
    }

    return result;
  }

  public dispose(): void {
    this.onDidSchemaChangeEmitter.dispose();
    this.onDidUpdateConfigurationEmitter.dispose();
    this.configurations.length = 0;
    this.properties.clear();
  }

  private registerProperties(configuration: IConfigurationNode): Set<string> {
    const updatedKeys = new Set<string>();

    for (const [key, property] of Object.entries(configuration.properties ?? {})) {
      if (property.included === false) {
        continue;
      }

      if (this.properties.has(key)) {
        throw new Error(`Configuration '${key}' is already registered.`);
      }

      this.properties.set(key, {
        ...property,
        defaultDefaultValue: property.default,
        source: configuration,
      });
      updatedKeys.add(key);
    }

    return updatedKeys;
  }

  private validateConfiguration(configuration: IConfigurationNode): void {
    if (!configuration || typeof configuration !== "object") {
      throw new Error("Configuration node must be an object.");
    }

    if (configuration.properties === undefined) {
      return;
    }

    for (const [key, property] of Object.entries(configuration.properties)) {
      if (!key) {
        throw new Error("Configuration property key must be a non-empty string.");
      }

      if (!property || typeof property !== "object") {
        throw new Error(`Configuration '${key}' schema must be an object.`);
      }
    }
  }

  private fireUpdatedConfiguration(updatedKeys: Set<string>): void {
    if (updatedKeys.size === 0) {
      return;
    }

    this.onDidSchemaChangeEmitter.fire();
    this.onDidUpdateConfigurationEmitter.fire(updatedKeys);
  }
}

const configurationRegistry = new ConfigurationRegistry();
configurationRegistry.registerConfiguration(CONDUCTOR_CONFIGURATION_NODE);
Registry.add(Extensions.Configuration, configurationRegistry);
