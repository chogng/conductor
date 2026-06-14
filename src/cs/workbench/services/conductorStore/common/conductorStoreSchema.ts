type OriginPlotOptions = {
  plotType: number;
  xyPairs: string;
  plotCommand: string;
  postPlotCommands: string[];
  lineWidth: number;
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

type ConductorSettings = JsonRecord & {
  defaultTemplate: unknown | null;
  lastTemplateId: unknown | null;
  theme: string;
  backgroundColor: string;
  transparentChrome: boolean;
  windowCloseBehavior: string;
  trayMinimizeHintShown: boolean;
  onboardingCompleted: boolean;
  onboardingAutoStartDismissed: boolean;
  stopOnErrorDefault: boolean;
  xUnitByFileId: Record<string, string>;
  yUnitByFileId: Record<string, string>;
  yScaleByFileId: Record<string, string>;
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
  originPlotLegendFontSizeDefault: string | number;
  originRuntimeCleanupEnabled: boolean;
  originRuntimeKeepSuccessJobs: number;
  originRuntimeFailedRetentionDays: number;
  plotAxisSettings: PlotAxisSettings;
};

type StoredTemplate = JsonRecord & {
  id?: unknown;
  xSegmentationMode: string;
  xPoints: string;
  xSegments: string;
  selectedColumns: number[];
};

type StoreData = {
  templates: StoredTemplate[];
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
    legendFontSize,
  };
}

function normalizeOriginExePath(inputPath: unknown): string | null {
  if (typeof inputPath !== "string") return null;
  const normalized = inputPath.trim();
  return normalized || null;
}
export const TEMPLATE_FILENAME = "template.json";
export const SETTINGS_FILENAME = "config.json";
const SS_METHODS = new Set(["auto", "manual"]);
const ORIGIN_EXPORT_MODES = new Set([
  "merged",
  "workbookBooks",
  "workbookSheets",
  "separate",
]);
const Y_UNITS = new Set([
  "A",
  "mA",
  "uA",
  "nA",
  "pA",
  "F",
  "mF",
  "uF",
  "nF",
  "pF",
]);
const X_UNITS = new Set(["V", "mV"]);
const Y_SCALES = new Set(["linear", "log"]);
const DEFAULT_Y_SCALE = "linear";
const THEMES = new Set(["system", "light", "dark"]);
const WINDOW_CLOSE_BEHAVIORS = new Set([
  "minimizeToTray",
  "quit",
]);
const DEFAULT_BACKGROUND_COLOR = "#f3f4f6";
const BACKGROUND_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const X_SEGMENTATION_MODES = new Set([
  "auto",
  "points",
  "segments",
]);

export const DEFAULT_SETTINGS: ConductorSettings = {
  defaultTemplate: null,
  lastTemplateId: null,
  theme: "system",
  backgroundColor: DEFAULT_BACKGROUND_COLOR,
  transparentChrome: true,
  windowCloseBehavior: "minimizeToTray",
  trayMinimizeHintShown: false,
  onboardingCompleted: false,
  onboardingAutoStartDismissed: false,
  stopOnErrorDefault: false,
  xUnitByFileId: {},
  yUnitByFileId: {},
  yScaleByFileId: {},
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

const STARTUP_DEFAULTS = {
  defaultYScaleForTransfer: DEFAULT_SETTINGS.defaultYScaleForTransfer,
  defaultYScaleForOutput: DEFAULT_SETTINGS.defaultYScaleForOutput,
  defaultYScaleForCf: DEFAULT_SETTINGS.defaultYScaleForCf,
  defaultYScaleForCv: DEFAULT_SETTINGS.defaultYScaleForCv,
  defaultYScaleForPv: DEFAULT_SETTINGS.defaultYScaleForPv,
  defaultYScaleForSpecial: DEFAULT_SETTINGS.defaultYScaleForSpecial,
  plotAxisSettings: {
    tickLabelFontSize: DEFAULT_SETTINGS.plotAxisSettings.tickLabelFontSize,
    axisTitleFontSize: DEFAULT_SETTINGS.plotAxisSettings.axisTitleFontSize,
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
    return DEFAULT_SETTINGS.backgroundColor;
  }

  const normalized = value.trim();
  return BACKGROUND_COLOR_PATTERN.test(normalized)
    ? normalized.toLowerCase()
    : DEFAULT_SETTINGS.backgroundColor;
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

function normalizePlotAxisSettings(
  value: unknown,
  fallback: PlotAxisSettings = DEFAULT_SETTINGS.plotAxisSettings,
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

function normalizeTemplateTextValue(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

function normalizeYScaleByFileIdMap(value: unknown): Record<string, string> {
  const raw = isRecord(value) ? value : {};
  const next: Record<string, string> = {};

  for (const [fileId, scale] of Object.entries(raw)) {
    const normalizedFileId =
      typeof fileId === "string" && fileId.trim() ? fileId.trim() : "";
    if (!normalizedFileId) continue;
    const normalizedScale =
      typeof scale === "string" && Y_SCALES.has(scale)
        ? scale
        : DEFAULT_Y_SCALE;
    next[normalizedFileId] = normalizedScale
      ? normalizedScale
      : DEFAULT_Y_SCALE;
  }

  return next;
}

function normalizeYUnitByFileIdMap(value: unknown): Record<string, string> {
  const raw = isRecord(value) ? value : {};
  const next: Record<string, string> = {};

  for (const [fileId, unit] of Object.entries(raw)) {
    const normalizedFileId =
      typeof fileId === "string" && fileId.trim() ? fileId.trim() : "";
    if (!normalizedFileId) continue;
    next[normalizedFileId] =
      typeof unit === "string" && Y_UNITS.has(unit)
        ? unit
        : "A";
  }

  return next;
}

function normalizeXUnitByFileIdMap(value: unknown): Record<string, string> {
  const raw = isRecord(value) ? value : {};
  const next: Record<string, string> = {};

  for (const [fileId, unit] of Object.entries(raw)) {
    const normalizedFileId =
      typeof fileId === "string" && fileId.trim() ? fileId.trim() : "";
    if (!normalizedFileId) continue;
    next[normalizedFileId] =
      typeof unit === "string" && X_UNITS.has(unit)
        ? unit
        : "V";
  }

  return next;
}

function normalizeXSegmentationMode(mode: unknown): string {
  const normalizedMode =
    typeof mode === "string" ? mode.trim().toLowerCase() : "";
  if (X_SEGMENTATION_MODES.has(normalizedMode)) {
    return normalizedMode;
  }

  return "auto";
}

const isStoredTemplate = (value: StoredTemplate | null): value is StoredTemplate =>
  value !== null;

export function normalizeStoredTemplate(template: unknown): StoredTemplate | null {
  if (!isRecord(template)) return null;

  return {
    ...template,
    xSegmentationMode: normalizeXSegmentationMode(
      template.xSegmentationMode,
    ),
    xPoints: normalizeTemplateTextValue(template.xPoints),
    xSegments: normalizeTemplateTextValue(template.xSegments),
    selectedColumns: Array.isArray(template.selectedColumns)
      ? template.selectedColumns.map((n) => Number(n)).filter(Number.isFinite)
      : [],
  };
}

export function normalizeStoredTemplates(templates: unknown): StoredTemplate[] {
  if (!Array.isArray(templates)) return [];

  return templates
    .map((template) => normalizeStoredTemplate(template))
    .filter(isStoredTemplate)
    .map((template, index) => ({
      ...template,
      id: template.id || `tpl_local_${index}_${Date.now()}`,
    }));
}

export function toTemplateNameKey(name: unknown): string {
  return String(name || "").trim().toLowerCase();
}

export function buildDefaultStoreData(): StoreData {
  return {
    templates: [],
  };
}

export function normalizeStoreData(raw: unknown): StoreData {
  const next = isRecord(raw) ? raw : {};
  return {
    templates: normalizeStoredTemplates(next.templates),
  };
}

export function normalizeConductorSettings(raw: unknown): ConductorSettings {
  const next = isRecord(raw) ? { ...raw } : {};

  const ssMethodDefault = isSetValue(SS_METHODS, next.ssMethodDefault)
    ? next.ssMethodDefault
    : DEFAULT_SETTINGS.ssMethodDefault;

  const xUnitByFileId = normalizeXUnitByFileIdMap(next.xUnitByFileId);
  const yUnitByFileId = normalizeYUnitByFileIdMap(next.yUnitByFileId);
  const yScaleByFileId = normalizeYScaleByFileIdMap(next.yScaleByFileId);
  const theme = isSetValue(THEMES, next.theme)
    ? next.theme
    : DEFAULT_SETTINGS.theme;
  const backgroundColor = normalizeBackgroundColor(next.backgroundColor);
  const transparentChrome = normalizeBoolean(
    next.transparentChrome,
    DEFAULT_SETTINGS.transparentChrome,
  );
  const windowCloseBehavior = isSetValue(
    WINDOW_CLOSE_BEHAVIORS,
    next.windowCloseBehavior,
  )
    ? next.windowCloseBehavior
    : DEFAULT_SETTINGS.windowCloseBehavior;
  const trayMinimizeHintShown = normalizeBoolean(
    next.trayMinimizeHintShown,
    DEFAULT_SETTINGS.trayMinimizeHintShown,
  );

  const ssShowFitLine =
    typeof next.ssShowFitLine === "boolean"
      ? next.ssShowFitLine
      : DEFAULT_SETTINGS.ssShowFitLine;

  const stopOnErrorDefault =
    normalizeBoolean(
      next.stopOnErrorDefault,
      DEFAULT_SETTINGS.stopOnErrorDefault,
    );
  const onboardingCompleted = normalizeBoolean(
    next.onboardingCompleted,
    DEFAULT_SETTINGS.onboardingCompleted,
  );
  const onboardingAutoStartDismissed = normalizeBoolean(
    next.onboardingAutoStartDismissed,
    DEFAULT_SETTINGS.onboardingAutoStartDismissed,
  );

  const ssIdLow = normalizePositiveNumber(
    next.ssIdLow,
    DEFAULT_SETTINGS.ssIdLow,
  );
  const ssIdHigh = normalizePositiveNumber(
    next.ssIdHigh,
    DEFAULT_SETTINGS.ssIdHigh,
  );
  const originExePath = normalizeOriginExePath(next.originExePath);
  const originExportModeDefault = isSetValue(
    ORIGIN_EXPORT_MODES,
    next.originExportModeDefault,
  )
    ? next.originExportModeDefault
    : DEFAULT_SETTINGS.originExportModeDefault;
  const originPlotDefaults = normalizeOriginPlotOptions({
    plotCommand: DEFAULT_SETTINGS.originPlotCommandDefault,
    plotType: DEFAULT_SETTINGS.originPlotTypeDefault,
    postPlotCommands: DEFAULT_SETTINGS.originPlotPostCommandsDefault,
    lineWidth: DEFAULT_SETTINGS.originPlotLineWidthDefault,
    legendFontSize: DEFAULT_SETTINGS.originPlotLegendFontSizeDefault,
    xyPairs: DEFAULT_SETTINGS.originPlotXyPairsDefault,
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
      legendFontSize: next.originPlotLegendFontSizeDefault,
      xyPairs: next.originPlotXyPairsDefault,
    },
    originPlotDefaults,
  );
  const originRuntimeCleanupEnabled =
    typeof next.originRuntimeCleanupEnabled === "boolean"
      ? next.originRuntimeCleanupEnabled
      : DEFAULT_SETTINGS.originRuntimeCleanupEnabled;
  const originRuntimeKeepSuccessJobs = normalizeBoundedInt(
    next.originRuntimeKeepSuccessJobs,
    DEFAULT_SETTINGS.originRuntimeKeepSuccessJobs,
    0,
    100,
  );
  const originRuntimeFailedRetentionDays = normalizeBoundedInt(
    next.originRuntimeFailedRetentionDays,
    DEFAULT_SETTINGS.originRuntimeFailedRetentionDays,
    1,
    365,
  );
  return {
    ...DEFAULT_SETTINGS,
    ...next,
    defaultTemplate: next.defaultTemplate ?? null,
    lastTemplateId: next.lastTemplateId ?? null,
    onboardingCompleted,
    onboardingAutoStartDismissed,
    stopOnErrorDefault,
    xUnitByFileId,
    yUnitByFileId,
    yScaleByFileId,
    theme,
    backgroundColor,
    transparentChrome,
    windowCloseBehavior,
    trayMinimizeHintShown,
    ssMethodDefault,
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
