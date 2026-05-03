import fs from "node:fs";
import path from "node:path";
import { normalizeOriginPlotOptions } from "./origin-plot-options.js";
import { normalizeOriginExePath } from "./origin-runner/core.js";

const DEVICE_ANALYSIS_TEMPLATE_FILENAME = "template.json";
const DEVICE_ANALYSIS_SETTINGS_FILENAME = "config.json";
const DEVICE_ANALYSIS_STORE_CONFIG_FILENAME = "store-path.json";
const DEVICE_ANALYSIS_LEGACY_SETTINGS_FILENAME_SUFFIX = ".settings.json";
const DEVICE_ANALYSIS_SS_METHODS = new Set(["auto", "manual", "idWindow", "legacy"]);
const DEVICE_ANALYSIS_ORIGIN_EXPORT_MODES = new Set([
  "merged",
  "workbookBooks",
  "workbookSheets",
  "separate",
]);
const DEVICE_ANALYSIS_Y_UNITS = new Set([
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
const DEVICE_ANALYSIS_Y_SCALES = new Set(["linear", "log"]);
const DEVICE_ANALYSIS_DEFAULT_Y_SCALE = "linear";
const DEVICE_ANALYSIS_THEMES = new Set(["system", "light", "dark"]);
const DEVICE_ANALYSIS_WINDOW_CLOSE_BEHAVIORS = new Set([
  "minimizeToTray",
  "quit",
]);
const DEVICE_ANALYSIS_X_SEGMENTATION_MODES = new Set([
  "auto",
  "points",
  "segments",
]);

const DEVICE_ANALYSIS_DEFAULT_SETTINGS = {
  defaultTemplate: null,
  lastTemplateId: null,
  theme: "system",
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
    tickLabelFontSize: "",
    axisTitleFontSize: "",
    legendFontSize: "",
    originTickLabelOffset: "",
    originAxisTitleGap: "",
  },
};

const DEVICE_ANALYSIS_STARTUP_ANALYSIS_DEFAULTS = {
  defaultYScaleForTransfer: DEVICE_ANALYSIS_DEFAULT_SETTINGS.defaultYScaleForTransfer,
  defaultYScaleForOutput: DEVICE_ANALYSIS_DEFAULT_SETTINGS.defaultYScaleForOutput,
  defaultYScaleForCf: DEVICE_ANALYSIS_DEFAULT_SETTINGS.defaultYScaleForCf,
  defaultYScaleForCv: DEVICE_ANALYSIS_DEFAULT_SETTINGS.defaultYScaleForCv,
  defaultYScaleForPv: DEVICE_ANALYSIS_DEFAULT_SETTINGS.defaultYScaleForPv,
  defaultYScaleForSpecial: DEVICE_ANALYSIS_DEFAULT_SETTINGS.defaultYScaleForSpecial,
  analysisPlotAxisSettings: {
    tickLabelFontSize: DEVICE_ANALYSIS_DEFAULT_SETTINGS.analysisPlotAxisSettings.tickLabelFontSize,
    axisTitleFontSize: DEVICE_ANALYSIS_DEFAULT_SETTINGS.analysisPlotAxisSettings.axisTitleFontSize,
    legendFontSize: DEVICE_ANALYSIS_DEFAULT_SETTINGS.analysisPlotAxisSettings.legendFontSize,
  },
};

function normalizePositiveNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function normalizeBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeBoundedInt(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(num)));
}

function normalizeRoundedBoundedInt(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

function normalizeOptionalRoundedBoundedInt(value, fallback, min, max) {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  if (!text) return "";
  return normalizeRoundedBoundedInt(text, fallback, min, max);
}

function isLegacyAutoFontDefaults(raw) {
  if (!raw || typeof raw !== "object") return false;
  const tick = Number(raw.tickLabelFontSize);
  const title = Number(raw.axisTitleFontSize);
  const legendText =
    raw.legendFontSize === null || raw.legendFontSize === undefined
      ? ""
      : String(raw.legendFontSize).trim();
  if (legendText) return false;
  return (tick === 8 && title === 8) || (tick === 12 && title === 18);
}

function normalizeFiniteNumberText(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  if (!text) return "";
  const num = Number(text);
  return Number.isFinite(num) ? text : "";
}

function normalizeIntegerText(value, min, max) {
  const text = normalizeFiniteNumberText(value);
  if (!text) return "";
  return String(normalizeRoundedBoundedInt(text, min, min, max));
}

function normalizePlotAxisSettings(value, fallback = DEVICE_ANALYSIS_DEFAULT_SETTINGS.analysisPlotAxisSettings) {
  const raw = value && typeof value === "object" ? value : {};
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

function normalizeTemplateTextValue(value) {
  if (value == null) return "";
  return String(value);
}

function normalizeYScaleByFileIdMap(value) {
  const raw = value && typeof value === "object" ? value : {};
  const next = {};

  for (const [fileId, scale] of Object.entries(raw)) {
    const normalizedFileId =
      typeof fileId === "string" && fileId.trim() ? fileId.trim() : "";
    if (!normalizedFileId) continue;
    const normalizedScale =
      typeof scale === "string" && DEVICE_ANALYSIS_Y_SCALES.has(scale)
        ? scale
        : DEVICE_ANALYSIS_DEFAULT_Y_SCALE;
    next[normalizedFileId] = normalizedScale
      ? normalizedScale
      : DEVICE_ANALYSIS_DEFAULT_Y_SCALE;
  }

  return next;
}

function normalizeYUnitByFileIdMap(value) {
  const raw = value && typeof value === "object" ? value : {};
  const next = {};

  for (const [fileId, unit] of Object.entries(raw)) {
    const normalizedFileId =
      typeof fileId === "string" && fileId.trim() ? fileId.trim() : "";
    if (!normalizedFileId) continue;
    next[normalizedFileId] =
      typeof unit === "string" && DEVICE_ANALYSIS_Y_UNITS.has(unit)
        ? unit
        : "A";
  }

  return next;
}

function normalizeXSegmentationMode(mode) {
  const normalizedMode =
    typeof mode === "string" ? mode.trim().toLowerCase() : "";
  if (DEVICE_ANALYSIS_X_SEGMENTATION_MODES.has(normalizedMode)) {
    return normalizedMode;
  }

  return "auto";
}

function normalizeDeviceAnalysisTemplate(template) {
  if (!template || typeof template !== "object") return null;

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

function normalizeDeviceAnalysisTemplates(templates) {
  if (!Array.isArray(templates)) return [];

  return templates
    .map((template) => normalizeDeviceAnalysisTemplate(template))
    .filter(Boolean)
    .map((template, index) => ({
      ...template,
      id: template.id || `tpl_local_${index}_${Date.now()}`,
    }));
}

function toTemplateNameKey(name) {
  return String(name || "").trim().toLowerCase();
}

function buildDefaultStoreData() {
  return {
    templates: [],
  };
}

function normalizeStoreData(raw) {
  const next = raw && typeof raw === "object" ? raw : {};
  return {
    templates: normalizeDeviceAnalysisTemplates(next.templates),
  };
}

function normalizeStoreConfig(raw) {
  const next = raw && typeof raw === "object" ? raw : {};
  const customStorePath =
    typeof next.customStorePath === "string" && next.customStorePath.trim()
      ? next.customStorePath.trim()
      : null;

  return { customStorePath };
}

export function createDeviceAnalysisStore(options) {
  const input = options && typeof options === "object" ? options : {};
  const getHomeDir =
    typeof input.getHomeDir === "function" ? input.getHomeDir : null;

  if (!getHomeDir) {
    throw new Error("Device analysis store requires getHomeDir().");
  }

  let storeConfigCache = null;
  let storeCache = null;
  let storeCachePath = null;
  let settingsCache = null;
  let settingsCachePath = null;

  function cloneStoreConfig(config) {
    return normalizeStoreConfig(config);
  }

  function cloneStoreData(store) {
    return normalizeStoreData(store);
  }

  function normalizeDeviceAnalysisSettings(raw) {
    const next = raw && typeof raw === "object" ? { ...raw } : {};
    const { yUnit: _legacyGlobalYUnit, yScale: _legacyGlobalYScale, ...nextWithoutLegacyAxes } = next;

    const ssMethodDefault = DEVICE_ANALYSIS_SS_METHODS.has(next.ssMethodDefault)
      ? next.ssMethodDefault
      : DEVICE_ANALYSIS_SS_METHODS.has(next.ssMethod)
        ? next.ssMethod
        : DEVICE_ANALYSIS_DEFAULT_SETTINGS.ssMethodDefault;

    const yUnitByFileId = normalizeYUnitByFileIdMap(next.yUnitByFileId);
    const yScaleByFileId = normalizeYScaleByFileIdMap(next.yScaleByFileId);
    const theme = DEVICE_ANALYSIS_THEMES.has(next.theme)
      ? next.theme
      : DEVICE_ANALYSIS_DEFAULT_SETTINGS.theme;
    const windowCloseBehavior = DEVICE_ANALYSIS_WINDOW_CLOSE_BEHAVIORS.has(
      next.windowCloseBehavior,
    )
      ? next.windowCloseBehavior
      : DEVICE_ANALYSIS_DEFAULT_SETTINGS.windowCloseBehavior;
    const trayMinimizeHintShown = normalizeBoolean(
      next.trayMinimizeHintShown,
      DEVICE_ANALYSIS_DEFAULT_SETTINGS.trayMinimizeHintShown,
    );

    const ssDiagnosticsEnabled =
      typeof next.ssDiagnosticsEnabled === "boolean"
        ? next.ssDiagnosticsEnabled
        : DEVICE_ANALYSIS_DEFAULT_SETTINGS.ssDiagnosticsEnabled;

    const vthDiagnosticsEnabled =
      typeof next.vthDiagnosticsEnabled === "boolean"
        ? next.vthDiagnosticsEnabled
        : DEVICE_ANALYSIS_DEFAULT_SETTINGS.vthDiagnosticsEnabled;

    const ssShowFitLine =
      typeof next.ssShowFitLine === "boolean"
        ? next.ssShowFitLine
        : DEVICE_ANALYSIS_DEFAULT_SETTINGS.ssShowFitLine;

    const stopOnErrorDefault =
      normalizeBoolean(
        next.stopOnErrorDefault,
        DEVICE_ANALYSIS_DEFAULT_SETTINGS.stopOnErrorDefault,
      );
    const onboardingCompleted = normalizeBoolean(
      next.onboardingCompleted,
      DEVICE_ANALYSIS_DEFAULT_SETTINGS.onboardingCompleted,
    );
    const onboardingAutoStartDismissed = normalizeBoolean(
      next.onboardingAutoStartDismissed,
      DEVICE_ANALYSIS_DEFAULT_SETTINGS.onboardingAutoStartDismissed,
    );

    const ssIdLow = normalizePositiveNumber(
      next.ssIdLow ?? next.ssIdWindowLow,
      DEVICE_ANALYSIS_DEFAULT_SETTINGS.ssIdLow,
    );
    const ssIdHigh = normalizePositiveNumber(
      next.ssIdHigh ?? next.ssIdWindowHigh,
      DEVICE_ANALYSIS_DEFAULT_SETTINGS.ssIdHigh,
    );
    const originExePath = normalizeOriginExePath(next.originExePath);
    const originExportModeDefault = DEVICE_ANALYSIS_ORIGIN_EXPORT_MODES.has(
      next.originExportModeDefault,
    )
      ? next.originExportModeDefault
      : DEVICE_ANALYSIS_ORIGIN_EXPORT_MODES.has(next.originExportMode)
        ? next.originExportMode
        : DEVICE_ANALYSIS_DEFAULT_SETTINGS.originExportModeDefault;
    const originPlotDefaults = normalizeOriginPlotOptions({
      plotCommand: DEVICE_ANALYSIS_DEFAULT_SETTINGS.originPlotCommandDefault,
      plotType: DEVICE_ANALYSIS_DEFAULT_SETTINGS.originPlotTypeDefault,
      postPlotCommands: DEVICE_ANALYSIS_DEFAULT_SETTINGS.originPlotPostCommandsDefault,
      lineWidth: DEVICE_ANALYSIS_DEFAULT_SETTINGS.originPlotLineWidthDefault,
      xyPairs: DEVICE_ANALYSIS_DEFAULT_SETTINGS.originPlotXyPairsDefault,
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
        : DEVICE_ANALYSIS_DEFAULT_SETTINGS.originRuntimeCleanupEnabled;
    const originRuntimeKeepSuccessJobs = normalizeBoundedInt(
      next.originRuntimeKeepSuccessJobs,
      DEVICE_ANALYSIS_DEFAULT_SETTINGS.originRuntimeKeepSuccessJobs,
      0,
      100,
    );
    const originRuntimeFailedRetentionDays = normalizeBoundedInt(
      next.originRuntimeFailedRetentionDays,
      DEVICE_ANALYSIS_DEFAULT_SETTINGS.originRuntimeFailedRetentionDays,
      1,
      365,
    );
    const analysisPlotAxisSettings = normalizePlotAxisSettings(
      next.analysisPlotAxisSettings,
    );

    return {
      ...DEVICE_ANALYSIS_DEFAULT_SETTINGS,
      ...nextWithoutLegacyAxes,
      defaultTemplate: next.defaultTemplate ?? null,
      lastTemplateId: next.lastTemplateId ?? null,
      onboardingCompleted,
      onboardingAutoStartDismissed,
      stopOnErrorDefault,
      yUnitByFileId,
      yScaleByFileId,
      theme,
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

  function cloneDeviceAnalysisSettings(settings) {
    return normalizeDeviceAnalysisSettings(settings);
  }

  function applyStartupAnalysisDefaults(settings) {
    const normalized = normalizeDeviceAnalysisSettings(settings);
    return normalizeDeviceAnalysisSettings({
      ...normalized,
      ...DEVICE_ANALYSIS_STARTUP_ANALYSIS_DEFAULTS,
      analysisPlotAxisSettings: {
        ...normalized.analysisPlotAxisSettings,
        ...DEVICE_ANALYSIS_STARTUP_ANALYSIS_DEFAULTS.analysisPlotAxisSettings,
      },
    });
  }

  function clearStoreCache() {
    storeCache = null;
    storeCachePath = null;
  }

  function clearSettingsCache() {
    settingsCache = null;
    settingsCachePath = null;
  }

  function getDefaultStorePath() {
    return path.join(getHomeDir(), DEVICE_ANALYSIS_SETTINGS_FILENAME);
  }

  function getStoreConfigPath() {
    return path.join(getHomeDir(), DEVICE_ANALYSIS_STORE_CONFIG_FILENAME);
  }

  function readStoreConfig() {
    if (storeConfigCache) {
      return cloneStoreConfig(storeConfigCache);
    }

    const configPath = getStoreConfigPath();
    if (!fs.existsSync(configPath)) {
      storeConfigCache = { customStorePath: null };
      return cloneStoreConfig(storeConfigCache);
    }

    try {
      const raw = fs.readFileSync(configPath, "utf8");
      if (!raw) {
        storeConfigCache = { customStorePath: null };
        return cloneStoreConfig(storeConfigCache);
      }
      storeConfigCache = normalizeStoreConfig(JSON.parse(raw));
    } catch {
      storeConfigCache = { customStorePath: null };
    }

    return cloneStoreConfig(storeConfigCache);
  }

  function writeStoreConfig(nextConfig) {
    const normalized = normalizeStoreConfig(nextConfig);
    const configPath = getStoreConfigPath();
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(normalized, null, 2), "utf8");
    storeConfigCache = normalized;
    clearStoreCache();
    clearSettingsCache();
    return cloneStoreConfig(normalized);
  }

  function getStorePersistenceInfo() {
    const { customStorePath } = readStoreConfig();
    const defaultPath = getDefaultStorePath();
    const currentPath = customStorePath || defaultPath;

    return {
      currentPath,
      defaultPath,
      isCustom: Boolean(customStorePath),
      isConfigurable: true,
    };
  }

  function getStorePath() {
    return getStorePersistenceInfo().currentPath;
  }

  function getTemplatePath() {
    const settingsPath = getStorePath();
    return path.join(path.dirname(settingsPath), DEVICE_ANALYSIS_TEMPLATE_FILENAME);
  }

  function getLegacySettingsPath() {
    const settingsPath = getStorePath();
    const parsed = path.parse(settingsPath);
    return path.join(parsed.dir, `${parsed.name}${DEVICE_ANALYSIS_LEGACY_SETTINGS_FILENAME_SUFFIX}`);
  }

  function tryReadJsonFile(filePath) {
    if (!fs.existsSync(filePath)) return null;

    try {
      const raw = fs.readFileSync(filePath, "utf8");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return null;
    }
  }

  function writeJsonFile(filePath, value) {
    const fileDir = path.dirname(filePath);
    if (!fs.existsSync(fileDir)) {
      fs.mkdirSync(fileDir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
  }

  function removeFileIfExists(filePath) {
    if (!fs.existsSync(filePath)) return;

    try {
      fs.unlinkSync(filePath);
    } catch {
      // Leave the legacy file in place if cleanup fails.
    }
  }

  function extractLegacySettings(raw) {
    if (!raw || typeof raw !== "object") return null;

    const next = { ...raw };
    delete next.templates;
    return next;
  }

  function ensureCurrentPersistenceLayout() {
    const settingsPath = getStorePath();
    const templatePath = getTemplatePath();
    const legacySettingsPath = getLegacySettingsPath();
    const currentSettingsRaw = tryReadJsonFile(settingsPath);
    const legacySettingsRaw = tryReadJsonFile(legacySettingsPath);
    const currentSettingsHasTemplates = Array.isArray(currentSettingsRaw?.templates);
    const templateExists = fs.existsSync(templatePath);

    if (!templateExists && currentSettingsHasTemplates) {
      writeJsonFile(
        templatePath,
        normalizeStoreData({ templates: currentSettingsRaw.templates }),
      );
      clearStoreCache();
    }

    if (legacySettingsRaw) {
      writeJsonFile(settingsPath, normalizeDeviceAnalysisSettings(legacySettingsRaw));
      removeFileIfExists(legacySettingsPath);
      clearSettingsCache();
    } else if (currentSettingsHasTemplates) {
      writeJsonFile(
        settingsPath,
        normalizeDeviceAnalysisSettings(extractLegacySettings(currentSettingsRaw)),
      );
      clearSettingsCache();
    } else if (currentSettingsRaw && typeof currentSettingsRaw === "object") {
      const normalizedCurrentSettings = normalizeDeviceAnalysisSettings(
        currentSettingsRaw,
      );
      const rawSerialized = JSON.stringify(currentSettingsRaw);
      const normalizedSerialized = JSON.stringify(normalizedCurrentSettings);
      if (rawSerialized !== normalizedSerialized) {
        writeJsonFile(settingsPath, normalizedCurrentSettings);
        clearSettingsCache();
      }
    }
  }

  function readStore() {
    ensureCurrentPersistenceLayout();

    const templatePath = getTemplatePath();
    if (storeCache && storeCachePath === templatePath) {
      return cloneStoreData(storeCache);
    }

    if (!fs.existsSync(templatePath)) {
      const defaults = buildDefaultStoreData();
      writeStore(defaults);
      return cloneStoreData(defaults);
    }

    try {
      const raw = fs.readFileSync(templatePath, "utf8");
      if (!raw) {
        storeCache = buildDefaultStoreData();
        storeCachePath = templatePath;
        return cloneStoreData(storeCache);
      }
      const parsed = JSON.parse(raw);
      storeCache = normalizeStoreData(parsed);
    } catch {
      storeCache = buildDefaultStoreData();
    }

    storeCachePath = templatePath;
    return cloneStoreData(storeCache);
  }

  function writeStore(nextStore) {
    ensureCurrentPersistenceLayout();

    const templatePath = getTemplatePath();
    const storeDir = path.dirname(templatePath);
    if (!fs.existsSync(storeDir)) {
      fs.mkdirSync(storeDir, { recursive: true });
    }
    const normalized = normalizeStoreData(nextStore);
    fs.writeFileSync(templatePath, JSON.stringify(normalized, null, 2), "utf8");
    storeCache = normalized;
    storeCachePath = templatePath;
    return cloneStoreData(normalized);
  }

  function tryReadSettingsFile() {
    ensureCurrentPersistenceLayout();

    const settingsPath = getStorePath();
    if (settingsCache && settingsCachePath === settingsPath) {
      return cloneDeviceAnalysisSettings(settingsCache);
    }

    if (!fs.existsSync(settingsPath)) {
      return null;
    }

    try {
      const raw = fs.readFileSync(settingsPath, "utf8");
      const parsed = raw ? JSON.parse(raw) : {};
      settingsCache = applyStartupAnalysisDefaults(parsed);
      settingsCachePath = settingsPath;
      return cloneDeviceAnalysisSettings(settingsCache);
    } catch {
      return null;
    }
  }

  function writeSettings(nextSettings) {
    ensureCurrentPersistenceLayout();

    const settingsPath = getStorePath();
    const settingsDir = path.dirname(settingsPath);
    if (!fs.existsSync(settingsDir)) {
      fs.mkdirSync(settingsDir, { recursive: true });
    }

    const normalized = normalizeDeviceAnalysisSettings(nextSettings);
    fs.writeFileSync(settingsPath, JSON.stringify(normalized, null, 2), "utf8");
    settingsCache = normalized;
    settingsCachePath = settingsPath;
    return cloneDeviceAnalysisSettings(normalized);
  }

  function getDeviceAnalysisSettings() {
    const direct = tryReadSettingsFile();
    if (direct) return direct;

    const defaults = normalizeDeviceAnalysisSettings(DEVICE_ANALYSIS_DEFAULT_SETTINGS);
    settingsCache = defaults;
    settingsCachePath = getStorePath();
    return cloneDeviceAnalysisSettings(defaults);
  }

  function patchDeviceAnalysisSettings(updates) {
    const patch = updates && typeof updates === "object" ? updates : {};
    const nextSettings = normalizeDeviceAnalysisSettings({
      ...getDeviceAnalysisSettings(),
      ...patch,
    });
    writeSettings(nextSettings);
    return nextSettings;
  }

  function getDeviceAnalysisTemplates() {
    return readStore().templates;
  }

  function upsertDeviceAnalysisTemplate(payload) {
    const input = normalizeDeviceAnalysisTemplate(payload);
    if (!input) throw new Error("Invalid template payload.");

    const inputNameKey = toTemplateNameKey(input.name);
    if (!inputNameKey) throw new Error("Template name is required.");

    const store = readStore();
    const existingTemplates = Array.isArray(store.templates) ? store.templates : [];
    let existingMatch = null;
    for (let i = existingTemplates.length - 1; i >= 0; i -= 1) {
      const tpl = existingTemplates[i];
      if (toTemplateNameKey(tpl?.name) === inputNameKey) {
        existingMatch = tpl;
        break;
      }
    }

    const saved = {
      ...existingMatch,
      ...input,
      id: existingMatch?.id || input.id || `tpl_${Date.now()}`,
    };
    const savedId = String(saved.id || "");
    store.templates = normalizeDeviceAnalysisTemplates([
      saved,
      ...existingTemplates.filter((tpl) => {
        const nameKey = toTemplateNameKey(tpl?.name);
        const tplId = String(tpl?.id || "");
        return nameKey !== inputNameKey && tplId !== savedId;
      }),
    ]);
    writeStore(store);
    return saved;
  }

  function deleteDeviceAnalysisTemplate(id) {
    const templateId = String(id || "").trim();
    if (!templateId) throw new Error("Invalid template id.");

    const store = readStore();
    store.templates = store.templates.filter((tpl) => String(tpl?.id || "") !== templateId);
    writeStore(store);
    return { success: true };
  }

  function migratePersistenceFile(previousPath, currentPath, label) {
    if (currentPath === previousPath) return;
    if (!fs.existsSync(previousPath) || fs.existsSync(currentPath)) return;

    const currentDir = path.dirname(currentPath);
    if (!fs.existsSync(currentDir)) {
      fs.mkdirSync(currentDir, { recursive: true });
    }

    try {
      fs.renameSync(previousPath, currentPath);
    } catch (error) {
      fs.copyFileSync(previousPath, currentPath);
      fs.unlinkSync(previousPath);
      if (error?.code !== "EXDEV") {
        console.warn(
          `[${label}] rename failed (${error?.code || "unknown"}), migrated by copy+delete.`,
        );
      }
    }
  }

  function setPersistencePath(nextPath) {
    const normalizedPath =
      typeof nextPath === "string" && nextPath.trim() ? nextPath.trim() : null;

    ensureCurrentPersistenceLayout();

    const previousSettingsPath = getStorePath();
    const previousTemplatePath = getTemplatePath();

    if (!normalizedPath) {
      writeStoreConfig({ customStorePath: null });
    } else {
      if (!path.isAbsolute(normalizedPath)) {
        throw new Error("User config path must be an absolute file path.");
      }
      writeStoreConfig({ customStorePath: normalizedPath });
    }

    const currentSettingsPath = getStorePath();
    const currentTemplatePath = getTemplatePath();
    migratePersistenceFile(
      previousTemplatePath,
      currentTemplatePath,
      "device-analysis-template",
    );
    migratePersistenceFile(
      previousSettingsPath,
      currentSettingsPath,
      "device-analysis-settings",
    );

    return getStorePersistenceInfo();
  }

  return {
    getHomeDir,
    getStorePersistenceInfo,
    getDeviceAnalysisSettings,
    patchDeviceAnalysisSettings,
    getDeviceAnalysisTemplates,
    upsertDeviceAnalysisTemplate,
    deleteDeviceAnalysisTemplate,
    setPersistencePath,
  };
}
