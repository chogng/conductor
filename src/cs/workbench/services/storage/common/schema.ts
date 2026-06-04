type OriginPlotOptions = {
  plotType: number;
  xyPairs: string;
  plotCommand: string;
  postPlotCommands: string[];
  lineWidth: number;
};

type JsonRecord = Record<string, unknown>;

type AnalysisPlotAxisSettings = {
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
  legendFontSize: string | number;
  originTickLabelOffset: string;
  originAxisTitleGap: string;
};

type AnalysisSettings = JsonRecord & {
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
  yUnitByFileId: Record<string, string>;
  yScaleByFileId: Record<string, string>;
  defaultYScaleForTransfer: string;
  defaultYScaleForOutput: string;
  defaultYScaleForCf: string;
  defaultYScaleForCv: string;
  defaultYScaleForPv: string;
  defaultYScaleForSpecial: string;
  ssMethodDefault: string;
  ssDiagnosticsEnabled: boolean;
  vthDiagnosticsEnabled: boolean;
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
  originRuntimeCleanupEnabled: boolean;
  originRuntimeKeepSuccessJobs: number;
  originRuntimeFailedRetentionDays: number;
  analysisPlotAxisSettings: AnalysisPlotAxisSettings;
};

type AnalysisTemplate = JsonRecord & {
  id?: unknown;
  xSegmentationMode: string;
  xPoints: string;
  xSegments: string;
  selectedColumns: number[];
};

type AnalysisStoreData = {
  templates: AnalysisTemplate[];
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

  return {
    plotType,
    xyPairs,
    plotCommand,
    postPlotCommands,
    lineWidth,
  };
}

function normalizeOriginExePath(inputPath: unknown): string | null {
  if (typeof inputPath !== "string") return null;
  const normalized = inputPath.trim();
  return normalized || null;
}
export const ANALYSIS_TEMPLATE_FILENAME = "template.json";
export const ANALYSIS_SETTINGS_FILENAME = "config.json";
export const ANALYSIS_STORE_CONFIG_FILENAME = "store-path.json";
export const ANALYSIS_LEGACY_SETTINGS_FILENAME_SUFFIX = ".settings.json";
const ANALYSIS_SS_METHODS = new Set(["auto", "manual", "idWindow", "legacy"]);
const ANALYSIS_ORIGIN_EXPORT_MODES = new Set([
  "merged",
  "workbookBooks",
  "workbookSheets",
  "separate",
]);
const ANALYSIS_Y_UNITS = new Set([
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
const ANALYSIS_Y_SCALES = new Set(["linear", "log"]);
const ANALYSIS_DEFAULT_Y_SCALE = "linear";
const ANALYSIS_THEMES = new Set(["system", "light", "dark"]);
const ANALYSIS_WINDOW_CLOSE_BEHAVIORS = new Set([
  "minimizeToTray",
  "quit",
]);
const ANALYSIS_DEFAULT_BACKGROUND_COLOR = "#f3f4f6";
const ANALYSIS_BACKGROUND_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const ANALYSIS_X_SEGMENTATION_MODES = new Set([
  "auto",
  "points",
  "segments",
]);

export const ANALYSIS_DEFAULT_SETTINGS: AnalysisSettings = {
  defaultTemplate: null,
  lastTemplateId: null,
  theme: "system",
  backgroundColor: ANALYSIS_DEFAULT_BACKGROUND_COLOR,
  transparentChrome: false,
  windowCloseBehavior: "minimizeToTray",
  trayMinimizeHintShown: false,
  onboardingCompleted: false,
  onboardingAutoStartDismissed: false,
  stopOnErrorDefault: false,
  yUnitByFileId: {},
  yScaleByFileId: {},
  defaultYScaleForTransfer: "log",
  defaultYScaleForOutput: "linear",
  defaultYScaleForCf: "linear",
  defaultYScaleForCv: "linear",
  defaultYScaleForPv: "linear",
  defaultYScaleForSpecial: "linear",
  ssMethodDefault: "auto",
  ssDiagnosticsEnabled: true,
  vthDiagnosticsEnabled: false,
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
  originRuntimeCleanupEnabled: true,
  originRuntimeKeepSuccessJobs: 1,
  originRuntimeFailedRetentionDays: 7,
  analysisPlotAxisSettings: {
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
    legendFontSize: "",
    originTickLabelOffset: "",
    originAxisTitleGap: "",
  },
};

const ANALYSIS_STARTUP_ANALYSIS_DEFAULTS = {
  defaultYScaleForTransfer: ANALYSIS_DEFAULT_SETTINGS.defaultYScaleForTransfer,
  defaultYScaleForOutput: ANALYSIS_DEFAULT_SETTINGS.defaultYScaleForOutput,
  defaultYScaleForCf: ANALYSIS_DEFAULT_SETTINGS.defaultYScaleForCf,
  defaultYScaleForCv: ANALYSIS_DEFAULT_SETTINGS.defaultYScaleForCv,
  defaultYScaleForPv: ANALYSIS_DEFAULT_SETTINGS.defaultYScaleForPv,
  defaultYScaleForSpecial: ANALYSIS_DEFAULT_SETTINGS.defaultYScaleForSpecial,
  analysisPlotAxisSettings: {
    tickLabelFontSize: ANALYSIS_DEFAULT_SETTINGS.analysisPlotAxisSettings.tickLabelFontSize,
    axisTitleFontSize: ANALYSIS_DEFAULT_SETTINGS.analysisPlotAxisSettings.axisTitleFontSize,
    legendFontSize: ANALYSIS_DEFAULT_SETTINGS.analysisPlotAxisSettings.legendFontSize,
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
    return ANALYSIS_DEFAULT_SETTINGS.backgroundColor;
  }

  const normalized = value.trim();
  return ANALYSIS_BACKGROUND_COLOR_PATTERN.test(normalized)
    ? normalized.toLowerCase()
    : ANALYSIS_DEFAULT_SETTINGS.backgroundColor;
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

function isLegacyAutoFontDefaults(raw: unknown): boolean {
  if (!isRecord(raw)) return false;
  const tick = Number(raw.tickLabelFontSize);
  const title = Number(raw.axisTitleFontSize);
  const legendText =
    raw.legendFontSize === null || raw.legendFontSize === undefined
      ? ""
      : String(raw.legendFontSize).trim();
  if (legendText) return false;
  return (tick === 8 && title === 8) || (tick === 12 && title === 18);
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
  fallback: AnalysisPlotAxisSettings = ANALYSIS_DEFAULT_SETTINGS.analysisPlotAxisSettings,
): AnalysisPlotAxisSettings {
  const raw = isRecord(value) ? value : {};
  const legacyAutoFontDefaults = isLegacyAutoFontDefaults(raw);
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
      legacyAutoFontDefaults ? "" : raw.tickLabelFontSize,
      fallback.tickLabelFontSize,
      1,
      96,
    ),
    axisTitleFontSize: normalizeOptionalRoundedBoundedInt(
      legacyAutoFontDefaults ? "" : raw.axisTitleFontSize,
      fallback.axisTitleFontSize,
      1,
      96,
    ),
    legendFontSize: normalizeOptionalRoundedBoundedInt(
      raw.legendFontSize,
      fallback.legendFontSize,
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
      typeof scale === "string" && ANALYSIS_Y_SCALES.has(scale)
        ? scale
        : ANALYSIS_DEFAULT_Y_SCALE;
    next[normalizedFileId] = normalizedScale
      ? normalizedScale
      : ANALYSIS_DEFAULT_Y_SCALE;
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
      typeof unit === "string" && ANALYSIS_Y_UNITS.has(unit)
        ? unit
        : "A";
  }

  return next;
}

function normalizeXSegmentationMode(mode: unknown): string {
  const normalizedMode =
    typeof mode === "string" ? mode.trim().toLowerCase() : "";
  if (ANALYSIS_X_SEGMENTATION_MODES.has(normalizedMode)) {
    return normalizedMode;
  }

  return "auto";
}

const isAnalysisTemplate = (value: AnalysisTemplate | null): value is AnalysisTemplate =>
  value !== null;

export function normalizeAnalysisTemplate(template: unknown): AnalysisTemplate | null {
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

export function normalizeAnalysisTemplates(templates: unknown): AnalysisTemplate[] {
  if (!Array.isArray(templates)) return [];

  return templates
    .map((template) => normalizeAnalysisTemplate(template))
    .filter(isAnalysisTemplate)
    .map((template, index) => ({
      ...template,
      id: template.id || `tpl_local_${index}_${Date.now()}`,
    }));
}

export function toTemplateNameKey(name: unknown): string {
  return String(name || "").trim().toLowerCase();
}

export function buildDefaultStoreData(): AnalysisStoreData {
  return {
    templates: [],
  };
}

export function normalizeStoreData(raw: unknown): AnalysisStoreData {
  const next = isRecord(raw) ? raw : {};
  return {
    templates: normalizeAnalysisTemplates(next.templates),
  };
}

export function normalizeAnalysisSettings(raw: unknown): AnalysisSettings {
  const next = isRecord(raw) ? { ...raw } : {};
  const { yUnit: _legacyGlobalYUnit, yScale: _legacyGlobalYScale, ...nextWithoutLegacyAxes } = next;

  const ssMethodDefault = isSetValue(ANALYSIS_SS_METHODS, next.ssMethodDefault)
    ? next.ssMethodDefault
    : isSetValue(ANALYSIS_SS_METHODS, next.ssMethod)
      ? next.ssMethod
      : ANALYSIS_DEFAULT_SETTINGS.ssMethodDefault;

  const yUnitByFileId = normalizeYUnitByFileIdMap(next.yUnitByFileId);
  const yScaleByFileId = normalizeYScaleByFileIdMap(next.yScaleByFileId);
  const theme = isSetValue(ANALYSIS_THEMES, next.theme)
    ? next.theme
    : ANALYSIS_DEFAULT_SETTINGS.theme;
  const backgroundColor = normalizeBackgroundColor(next.backgroundColor);
  const transparentChrome = normalizeBoolean(
    next.transparentChrome,
    ANALYSIS_DEFAULT_SETTINGS.transparentChrome,
  );
  const windowCloseBehavior = isSetValue(
    ANALYSIS_WINDOW_CLOSE_BEHAVIORS,
    next.windowCloseBehavior,
  )
    ? next.windowCloseBehavior
    : ANALYSIS_DEFAULT_SETTINGS.windowCloseBehavior;
  const trayMinimizeHintShown = normalizeBoolean(
    next.trayMinimizeHintShown,
    ANALYSIS_DEFAULT_SETTINGS.trayMinimizeHintShown,
  );

  const ssDiagnosticsEnabled =
    typeof next.ssDiagnosticsEnabled === "boolean"
      ? next.ssDiagnosticsEnabled
      : ANALYSIS_DEFAULT_SETTINGS.ssDiagnosticsEnabled;

  const vthDiagnosticsEnabled =
    typeof next.vthDiagnosticsEnabled === "boolean"
      ? next.vthDiagnosticsEnabled
      : ANALYSIS_DEFAULT_SETTINGS.vthDiagnosticsEnabled;

  const ssShowFitLine =
    typeof next.ssShowFitLine === "boolean"
      ? next.ssShowFitLine
      : ANALYSIS_DEFAULT_SETTINGS.ssShowFitLine;

  const stopOnErrorDefault =
    normalizeBoolean(
      next.stopOnErrorDefault,
      ANALYSIS_DEFAULT_SETTINGS.stopOnErrorDefault,
    );
  const onboardingCompleted = normalizeBoolean(
    next.onboardingCompleted,
    ANALYSIS_DEFAULT_SETTINGS.onboardingCompleted,
  );
  const onboardingAutoStartDismissed = normalizeBoolean(
    next.onboardingAutoStartDismissed,
    ANALYSIS_DEFAULT_SETTINGS.onboardingAutoStartDismissed,
  );

  const ssIdLow = normalizePositiveNumber(
    next.ssIdLow ?? next.ssIdWindowLow,
    ANALYSIS_DEFAULT_SETTINGS.ssIdLow,
  );
  const ssIdHigh = normalizePositiveNumber(
    next.ssIdHigh ?? next.ssIdWindowHigh,
    ANALYSIS_DEFAULT_SETTINGS.ssIdHigh,
  );
  const originExePath = normalizeOriginExePath(next.originExePath);
  const originExportModeDefault = isSetValue(
    ANALYSIS_ORIGIN_EXPORT_MODES,
    next.originExportModeDefault,
  )
    ? next.originExportModeDefault
    : isSetValue(ANALYSIS_ORIGIN_EXPORT_MODES, next.originExportMode)
      ? next.originExportMode
      : ANALYSIS_DEFAULT_SETTINGS.originExportModeDefault;
  const originPlotDefaults = normalizeOriginPlotOptions({
    plotCommand: ANALYSIS_DEFAULT_SETTINGS.originPlotCommandDefault,
    plotType: ANALYSIS_DEFAULT_SETTINGS.originPlotTypeDefault,
    postPlotCommands: ANALYSIS_DEFAULT_SETTINGS.originPlotPostCommandsDefault,
    lineWidth: ANALYSIS_DEFAULT_SETTINGS.originPlotLineWidthDefault,
    xyPairs: ANALYSIS_DEFAULT_SETTINGS.originPlotXyPairsDefault,
  });
  const originPlotSettings = normalizeOriginPlotOptions(
    {
      plotCommand: next.originPlotCommandDefault,
      plotType: next.originPlotTypeDefault,
      postPlotCommands: next.originPlotPostCommandsDefault,
      lineWidth: next.originPlotLineWidthDefault,
      xyPairs: next.originPlotXyPairsDefault,
    },
    originPlotDefaults,
  );
  const originRuntimeCleanupEnabled =
    typeof next.originRuntimeCleanupEnabled === "boolean"
      ? next.originRuntimeCleanupEnabled
      : ANALYSIS_DEFAULT_SETTINGS.originRuntimeCleanupEnabled;
  const originRuntimeKeepSuccessJobs = normalizeBoundedInt(
    next.originRuntimeKeepSuccessJobs,
    ANALYSIS_DEFAULT_SETTINGS.originRuntimeKeepSuccessJobs,
    0,
    100,
  );
  const originRuntimeFailedRetentionDays = normalizeBoundedInt(
    next.originRuntimeFailedRetentionDays,
    ANALYSIS_DEFAULT_SETTINGS.originRuntimeFailedRetentionDays,
    1,
    365,
  );
  const analysisPlotAxisSettings = normalizePlotAxisSettings(
    next.analysisPlotAxisSettings,
  );

  return {
    ...ANALYSIS_DEFAULT_SETTINGS,
    ...nextWithoutLegacyAxes,
    defaultTemplate: next.defaultTemplate ?? null,
    lastTemplateId: next.lastTemplateId ?? null,
    onboardingCompleted,
    onboardingAutoStartDismissed,
    stopOnErrorDefault,
    yUnitByFileId,
    yScaleByFileId,
    theme,
    backgroundColor,
    transparentChrome,
    windowCloseBehavior,
    trayMinimizeHintShown,
    ssMethodDefault,
    ssDiagnosticsEnabled,
    vthDiagnosticsEnabled,
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
    originRuntimeCleanupEnabled,
    originRuntimeKeepSuccessJobs,
    originRuntimeFailedRetentionDays,
    analysisPlotAxisSettings,
  };
}

export function cloneAnalysisSettings(settings: unknown): AnalysisSettings {
  return normalizeAnalysisSettings(settings);
}

export function applyStartupAnalysisDefaults(settings: unknown): AnalysisSettings {
  const normalized = normalizeAnalysisSettings(settings);
  return normalizeAnalysisSettings({
    ...normalized,
    ...ANALYSIS_STARTUP_ANALYSIS_DEFAULTS,
    analysisPlotAxisSettings: {
      ...normalized.analysisPlotAxisSettings,
      ...ANALYSIS_STARTUP_ANALYSIS_DEFAULTS.analysisPlotAxisSettings,
    },
  });
}
