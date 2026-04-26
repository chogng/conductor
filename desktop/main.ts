import fs from "node:fs";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, Menu, shell, Tray } from "electron";
import { createBootSplashWindow } from "./boot-splash.js";
import { createDeviceAnalysisStore } from "./device-analysis-store.js";
import {
  assertOriginExePath,
  normalizeOriginExePath,
} from "./origin-runner/core.js";
import { ipcChannels } from "./ipc-channels.js";
import {
  DEFAULT_ORIGIN_PLOT_OPTIONS,
  normalizeNonEmptyString,
  normalizeOriginCommandList,
  normalizeOriginPlotOptions,
} from "./origin-plot-options.js";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let autoUpdater = null;
let originRunnerModulePromise = null;
let rustDeviceAnalysisEngine = null;
let rustDeviceAnalysisEngineStdoutBuffer = "";
let rustDeviceAnalysisEngineRequestId = 0;
const rustDeviceAnalysisEnginePending = new Map();
const rustDeviceAnalysisProcessingSlots = [];
let rustDeviceAnalysisProcessingSlotCursor = 0;

const isDev = !app.isPackaged;
const isWindows = process.platform === "win32";
const devUrl =
  process.env.ELECTRON_START_URL ||
  "http://127.0.0.1:5174/desktop/workbench.html";
const AUTO_UPDATE_INITIAL_DELAY_MS = 15 * 1000;
const AUTO_UPDATE_INTERVAL_MS = 4 * 60 * 60 * 1000;
const AUTO_UPDATE_SUPPORTED_PLATFORMS = new Set(["win32"]);
const PACKAGED_AUTO_UPDATE_CONFIG = {
  provider: "github",
  owner: "chogng",
  repo: "conductor-update",
  releaseType: "release",
};
const DESKTOP_APP_USER_MODEL_ID = "com.conductor.desktop";
const DEVICE_ANALYSIS_DEMO_FILE_NAMES = [
  "demo-01.csv",
  "demo-02.csv",
  "demo-03.csv",
  "demo-04.csv",
  "demo-05.csv",
  "demo-06.csv",
];
const ORIGIN_DETECTION_CACHE_TTL_MS = 60 * 1000;
const MAIN_WINDOW_BOUNDS = {
  width: 1440,
  height: 920,
  minWidth: 1080,
  minHeight: 700,
};
const BOOT_WINDOW_SETTLE_MS = 80;
const BOOT_UI_READY_FALLBACK_MS = 3500;
const DEVICE_ANALYSIS_RUST_PROCESSING_POOL_SIZE = Math.max(
  1,
  Math.min(4, Number(process.env.CONDUCTOR_RUST_PROCESSING_POOL_SIZE) || 2),
);
let mainWindow = null;
let splashWindow = null;
let appTray = null;
let mainWindowBootExpansionPromise = null;
let mainWindowBootShown = false;
let startupGatePromise = null;
let autoUpdateTimer = null;
let autoUpdateConfiguredFeedUrl = null;
let isAutoUpdateConfigured = false;
let autoUpdateStatus = {
  status: "idle",
  version: null,
};
let isAppQuitting = false;
let originDetectionCache = null;
let originDetectionPromise = null;
const desktopProcessStartMs = Date.now();

function logDesktopBoot(stage, extra = "") {
  const elapsedMs = Date.now() - desktopProcessStartMs;
  const suffix = extra ? ` ${extra}` : "";
  console.info(`[boot][main] +${elapsedMs}ms ${stage}${suffix}`);
}

const loadOriginRunnerModule = async () => {
  if (!originRunnerModulePromise) {
    originRunnerModulePromise = import("./origin-runner.js");
  }

  return originRunnerModulePromise;
};

const ensureAutoUpdater = async () => {
  if (autoUpdater) return autoUpdater;

  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch (error) {
    console.warn("[auto-update] electron-updater is unavailable:", error?.message || error);
    autoUpdater = null;
  }

  return autoUpdater;
};

function getResourcesPath() {
  const resourcesPath = Reflect.get(process, "resourcesPath");
  return typeof resourcesPath === "string" ? resourcesPath : process.cwd();
}

function resolveDesktopWindowIconPath() {
  const iconFileName =
    process.platform === "win32"
      ? "icon-150.png"
      : process.platform === "darwin"
        ? "icon.icns"
        : "icon.png";

  const candidates = app.isPackaged
    ? [
        path.join(getResourcesPath(), "build", "icons", iconFileName),
        path.join(getResourcesPath(), "app.asar.unpacked", "build", "icons", iconFileName),
      ]
    : [path.join(__dirname, "..", "build", "icons", iconFileName)];

  return resolveFirstExistingPath(candidates) ?? undefined;
}

function resolveTrayIconPath() {
  const iconFileName =
    process.platform === "win32"
      ? "icon.ico"
      : process.platform === "darwin"
        ? "icon.icns"
        : "icon.png";

  const candidates = app.isPackaged
    ? [
        path.join(getResourcesPath(), "build", "icons", iconFileName),
        path.join(getResourcesPath(), "app.asar.unpacked", "build", "icons", iconFileName),
      ]
    : [path.join(__dirname, "..", "build", "icons", iconFileName)];

  return resolveFirstExistingPath(candidates) ?? resolveDesktopWindowIconPath();
}

function prepareStartupGate() {
  if (!startupGatePromise) {
    startupGatePromise = Promise.resolve().then(() => {
      logDesktopBoot("startup-gate:ready", "(session=skipped)");
      return { session: "skipped" };
    });
  }

  return startupGatePromise;
}

function resolveOriginCsvScriptPath() {
  if (!app.isPackaged) {
    return path.join(__dirname, "..", "origin", "run_origin_csv.py");
  }

  const unpackedPath = path.join(
    getResourcesPath(),
    "app.asar.unpacked",
    "origin",
    "run_origin_csv.py",
  );
  if (fs.existsSync(unpackedPath)) {
    return unpackedPath;
  }

  return path.join(
    getResourcesPath(),
    "app.asar",
    "origin",
    "run_origin_csv.py",
  );
}

function resolveFirstExistingPath(candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const candidate = item.trim();
    if (!candidate) continue;
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function resolveOriginCsvWorkerPath() {
  const envPath = normalizeOriginExePath(process.env.ORIGIN_CSV_WORKER_PATH);
  if (!app.isPackaged) {
    // Dev mode should use the source Python worker by default.
    // Use ORIGIN_CSV_WORKER_PATH only when explicitly smoke-testing the built EXE.
    return resolveFirstExistingPath([envPath]);
  }

  return resolveFirstExistingPath([
    envPath,
    path.join(
      getResourcesPath(),
      "origin",
      "bin",
      "origin-csv-worker",
      "origin-csv-worker.exe",
    ),
    path.join(getResourcesPath(), "origin", "bin", "origin-csv-worker.exe"),
    path.join(
      getResourcesPath(),
      "app.asar.unpacked",
      "origin",
      "bin",
      "origin-csv-worker",
      "origin-csv-worker.exe",
    ),
    path.join(
      getResourcesPath(),
      "app.asar.unpacked",
      "origin",
      "bin",
      "origin-csv-worker.exe",
    ),
  ]);
}

const ORIGIN_CSV_SCRIPT_PATH = isDev ? resolveOriginCsvScriptPath() : null;
const ORIGIN_CSV_WORKER_PATH = resolveOriginCsvWorkerPath();

/**
 * @typedef {{
 *   import?: {workbookLongName?: string, columnLabels?: {longNames?: string[], units?: string[]}, preCommands?: string[], postCommands?: string[]},
 *   plot?: {command?: string, preCommands?: string[], postCommands?: string[]},
 *   graph?: {preCommands?: string[], postCommands?: string[]},
 *   style?: {commands?: string[]},
 *   axis?: {commands?: string[]},
 *   commands?: {preCommands?: string[], postCommands?: string[]},
 * }} OriginCapabilitiesOptions
 */
function assertOriginCapabilitiesObject(value, fieldPath) {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid Origin capabilities at '${fieldPath}': expected object.`);
  }
  return value;
}

function assertOriginCapabilitiesAllowedKeys(section, allowedKeys, fieldPath) {
  const sectionObj = assertOriginCapabilitiesObject(section, fieldPath);
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(sectionObj)) {
    if (!allowed.has(key)) {
      throw new Error(`Invalid Origin capabilities field '${fieldPath}.${key}'.`);
    }
  }
  return sectionObj;
}

function assertOriginCapabilitiesString(value, fieldPath) {
  if (value == null) return;
  if (typeof value !== "string") {
    throw new Error(`Invalid Origin capabilities at '${fieldPath}': expected string.`);
  }
}

function assertOriginCapabilitiesCommandList(value, fieldPath) {
  if (value == null) return;
  if (typeof value === "string") return;
  if (!Array.isArray(value)) {
    throw new Error(`Invalid Origin capabilities at '${fieldPath}': expected string or string array.`);
  }
  for (let i = 0; i < value.length; i += 1) {
    if (typeof value[i] !== "string") {
      throw new Error(
        `Invalid Origin capabilities at '${fieldPath}[${i}]': expected string.`,
      );
    }
  }
}

function assertOriginCapabilitiesStringList(value, fieldPath) {
  if (value == null) return;
  if (!Array.isArray(value)) {
    throw new Error(`Invalid Origin capabilities at '${fieldPath}': expected string array.`);
  }
  for (let i = 0; i < value.length; i += 1) {
    if (typeof value[i] !== "string") {
      throw new Error(
        `Invalid Origin capabilities at '${fieldPath}[${i}]': expected string.`,
      );
    }
  }
}

function assertOriginCapabilitiesNumber(value, fieldPath) {
  if (value == null) return;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid Origin capabilities at '${fieldPath}': expected finite number.`);
  }
}

function validateOriginCapabilitiesPayload(rawCapabilities) {
  if (rawCapabilities == null) return;

  const root = assertOriginCapabilitiesAllowedKeys(
    rawCapabilities,
    [
      "import",
      "plot",
      "graph",
      "style",
      "axis",
      "commands",
      "preCommands",
      "postCommands",
    ],
    "capabilities",
  );

  const importSection = assertOriginCapabilitiesAllowedKeys(
    root.import,
    ["workbookLongName", "longName", "columnLabels", "preCommands", "beforeCommands", "postCommands", "afterCommands"],
    "capabilities.import",
  );
  const plotSection = assertOriginCapabilitiesAllowedKeys(
    root.plot,
    ["command", "plotCommand", "preCommands", "beforeCommands", "postCommands", "afterCommands", "postPlotCommands"],
    "capabilities.plot",
  );
  const graphSection = assertOriginCapabilitiesAllowedKeys(
    root.graph,
    ["preCommands", "beforeCommands", "postCommands", "afterCommands"],
    "capabilities.graph",
  );
  const styleSection = assertOriginCapabilitiesAllowedKeys(
    root.style,
    ["commands", "postCommands"],
    "capabilities.style",
  );
  const axisSection = assertOriginCapabilitiesAllowedKeys(
    root.axis,
    ["commands", "postCommands", "limits"],
    "capabilities.axis",
  );
  const commandsSection = assertOriginCapabilitiesAllowedKeys(
    root.commands,
    ["preCommands", "beforeCommands", "postCommands", "afterCommands"],
    "capabilities.commands",
  );
  const importColumnLabels = assertOriginCapabilitiesAllowedKeys(
    importSection.columnLabels,
    ["longNames", "units"],
    "capabilities.import.columnLabels",
  );
  const axisLimits = assertOriginCapabilitiesAllowedKeys(
    axisSection.limits,
    ["x", "y"],
    "capabilities.axis.limits",
  );
  const axisXLimits = assertOriginCapabilitiesAllowedKeys(
    axisLimits.x,
    ["from", "to", "step", "scale"],
    "capabilities.axis.limits.x",
  );
  const axisYLimits = assertOriginCapabilitiesAllowedKeys(
    axisLimits.y,
    ["from", "to", "step", "scale"],
    "capabilities.axis.limits.y",
  );

  assertOriginCapabilitiesString(importSection.workbookLongName, "capabilities.import.workbookLongName");
  assertOriginCapabilitiesString(importSection.longName, "capabilities.import.longName");
  assertOriginCapabilitiesString(plotSection.command, "capabilities.plot.command");
  assertOriginCapabilitiesString(plotSection.plotCommand, "capabilities.plot.plotCommand");
  assertOriginCapabilitiesStringList(importColumnLabels.longNames, "capabilities.import.columnLabels.longNames");
  assertOriginCapabilitiesStringList(importColumnLabels.units, "capabilities.import.columnLabels.units");
  assertOriginCapabilitiesNumber(axisXLimits.from, "capabilities.axis.limits.x.from");
  assertOriginCapabilitiesNumber(axisXLimits.to, "capabilities.axis.limits.x.to");
  assertOriginCapabilitiesNumber(axisXLimits.step, "capabilities.axis.limits.x.step");
  assertOriginCapabilitiesString(axisXLimits.scale, "capabilities.axis.limits.x.scale");
  assertOriginCapabilitiesNumber(axisYLimits.from, "capabilities.axis.limits.y.from");
  assertOriginCapabilitiesNumber(axisYLimits.to, "capabilities.axis.limits.y.to");
  assertOriginCapabilitiesNumber(axisYLimits.step, "capabilities.axis.limits.y.step");
  assertOriginCapabilitiesString(axisYLimits.scale, "capabilities.axis.limits.y.scale");

  assertOriginCapabilitiesCommandList(root.preCommands, "capabilities.preCommands");
  assertOriginCapabilitiesCommandList(root.postCommands, "capabilities.postCommands");
  assertOriginCapabilitiesCommandList(importSection.preCommands, "capabilities.import.preCommands");
  assertOriginCapabilitiesCommandList(importSection.beforeCommands, "capabilities.import.beforeCommands");
  assertOriginCapabilitiesCommandList(importSection.postCommands, "capabilities.import.postCommands");
  assertOriginCapabilitiesCommandList(importSection.afterCommands, "capabilities.import.afterCommands");
  assertOriginCapabilitiesCommandList(plotSection.preCommands, "capabilities.plot.preCommands");
  assertOriginCapabilitiesCommandList(plotSection.beforeCommands, "capabilities.plot.beforeCommands");
  assertOriginCapabilitiesCommandList(plotSection.postCommands, "capabilities.plot.postCommands");
  assertOriginCapabilitiesCommandList(plotSection.afterCommands, "capabilities.plot.afterCommands");
  assertOriginCapabilitiesCommandList(plotSection.postPlotCommands, "capabilities.plot.postPlotCommands");
  assertOriginCapabilitiesCommandList(graphSection.preCommands, "capabilities.graph.preCommands");
  assertOriginCapabilitiesCommandList(graphSection.beforeCommands, "capabilities.graph.beforeCommands");
  assertOriginCapabilitiesCommandList(graphSection.postCommands, "capabilities.graph.postCommands");
  assertOriginCapabilitiesCommandList(graphSection.afterCommands, "capabilities.graph.afterCommands");
  assertOriginCapabilitiesCommandList(styleSection.commands, "capabilities.style.commands");
  assertOriginCapabilitiesCommandList(styleSection.postCommands, "capabilities.style.postCommands");
  assertOriginCapabilitiesCommandList(axisSection.commands, "capabilities.axis.commands");
  assertOriginCapabilitiesCommandList(axisSection.postCommands, "capabilities.axis.postCommands");
  assertOriginCapabilitiesCommandList(commandsSection.preCommands, "capabilities.commands.preCommands");
  assertOriginCapabilitiesCommandList(commandsSection.beforeCommands, "capabilities.commands.beforeCommands");
  assertOriginCapabilitiesCommandList(commandsSection.postCommands, "capabilities.commands.postCommands");
  assertOriginCapabilitiesCommandList(commandsSection.afterCommands, "capabilities.commands.afterCommands");
}

/**
 * @param {unknown} rawCapabilities
 * @returns {OriginCapabilitiesOptions | null}
 */
function normalizeOriginCapabilitiesPayload(rawCapabilities) {
  if (rawCapabilities != null) {
    validateOriginCapabilitiesPayload(rawCapabilities);
  }

  const raw =
    rawCapabilities && typeof rawCapabilities === "object" && !Array.isArray(rawCapabilities)
      ? rawCapabilities
      : null;
  if (!raw) return null;

  const pickSection = (sectionValue) =>
    sectionValue && typeof sectionValue === "object" ? sectionValue : {};

  const importSection = pickSection(raw.import);
  const plotSection = pickSection(raw.plot);
  const graphSection = pickSection(raw.graph);
  const styleSection = pickSection(raw.style);
  const axisSection = pickSection(raw.axis);
  const commandsSection = pickSection(raw.commands);

  const importWorkbookLongName = normalizeNonEmptyString(
    importSection.workbookLongName ?? importSection.longName,
    "",
  );
  const importColumnLabelsRaw =
    importSection.columnLabels && typeof importSection.columnLabels === "object"
      ? importSection.columnLabels
      : {};
  const importColumnLongNames = Array.isArray(importColumnLabelsRaw.longNames)
    ? importColumnLabelsRaw.longNames
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
    : [];
  const importColumnUnits = Array.isArray(importColumnLabelsRaw.units)
    ? importColumnLabelsRaw.units
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
    : [];
  const importPreCommands = normalizeOriginCommandList(
    importSection.preCommands ?? importSection.beforeCommands,
  );
  const importPostCommands = normalizeOriginCommandList(
    importSection.postCommands ?? importSection.afterCommands,
  );

  const plotCommand = normalizeNonEmptyString(
    plotSection.command ?? plotSection.plotCommand,
    "",
  );
  const plotPreCommands = normalizeOriginCommandList(
    plotSection.preCommands ?? plotSection.beforeCommands,
  );
  const plotPostCommands = normalizeOriginCommandList(
    plotSection.postCommands ?? plotSection.afterCommands ?? plotSection.postPlotCommands,
  );

  const graphPreCommands = normalizeOriginCommandList(
    graphSection.preCommands ?? graphSection.beforeCommands,
  );
  const graphPostCommands = normalizeOriginCommandList(
    graphSection.postCommands ?? graphSection.afterCommands,
  );

  const styleCommands = normalizeOriginCommandList(
    styleSection.commands ?? styleSection.postCommands,
  );
  const axisCommands = normalizeOriginCommandList(
    axisSection.commands ?? axisSection.postCommands,
  );
  const axisLimitsRaw =
    axisSection.limits && typeof axisSection.limits === "object"
      ? axisSection.limits
      : {};
  const normalizeAxisLimitShape = (value) => {
    const source = value && typeof value === "object" ? value : {};
    const from = Number.isFinite(source.from) ? Number(source.from) : undefined;
    const to = Number.isFinite(source.to) ? Number(source.to) : undefined;
    const step = Number.isFinite(source.step) ? Number(source.step) : undefined;
    const scale = normalizeNonEmptyString(source.scale, "");
    if (
      from === undefined &&
      to === undefined &&
      step === undefined &&
      !scale
    ) {
      return null;
    }
    const normalizedAxis: {
      from?: number;
      to?: number;
      step?: number;
      scale?: string;
    } = {};
    if (from !== undefined) normalizedAxis.from = from;
    if (to !== undefined) normalizedAxis.to = to;
    if (step !== undefined) normalizedAxis.step = step;
    if (scale) normalizedAxis.scale = scale;
    return normalizedAxis;
  };
  const axisLimitsNormalized = {
    x: normalizeAxisLimitShape(axisLimitsRaw.x),
    y: normalizeAxisLimitShape(axisLimitsRaw.y),
  };

  const globalPreCommands = normalizeOriginCommandList(
    raw.preCommands ??
      commandsSection.preCommands ??
      commandsSection.beforeCommands,
  );
  const globalPostCommands = normalizeOriginCommandList(
    raw.postCommands ??
      commandsSection.postCommands ??
      commandsSection.afterCommands,
  );

  const normalized: any = {};

  if (
    importWorkbookLongName ||
    importColumnLongNames.length ||
    importColumnUnits.length ||
    importPreCommands.length ||
    importPostCommands.length
  ) {
    normalized.import = {};
    if (importWorkbookLongName) normalized.import.workbookLongName = importWorkbookLongName;
    if (importColumnLongNames.length || importColumnUnits.length) {
      normalized.import.columnLabels = {};
      if (importColumnLongNames.length) normalized.import.columnLabels.longNames = importColumnLongNames;
      if (importColumnUnits.length) normalized.import.columnLabels.units = importColumnUnits;
    }
    if (importPreCommands.length) normalized.import.preCommands = importPreCommands;
    if (importPostCommands.length) normalized.import.postCommands = importPostCommands;
  }

  if (plotCommand || plotPreCommands.length || plotPostCommands.length) {
    normalized.plot = {};
    if (plotCommand) normalized.plot.command = plotCommand;
    if (plotPreCommands.length) normalized.plot.preCommands = plotPreCommands;
    if (plotPostCommands.length) normalized.plot.postCommands = plotPostCommands;
  }

  if (graphPreCommands.length || graphPostCommands.length) {
    normalized.graph = {};
    if (graphPreCommands.length) normalized.graph.preCommands = graphPreCommands;
    if (graphPostCommands.length) normalized.graph.postCommands = graphPostCommands;
  }

  if (styleCommands.length) {
    normalized.style = { commands: styleCommands };
  }

  if (axisCommands.length || axisLimitsNormalized.x || axisLimitsNormalized.y) {
    normalized.axis = { commands: axisCommands };
    if (axisLimitsNormalized.x || axisLimitsNormalized.y) {
      normalized.axis.limits = {};
      if (axisLimitsNormalized.x) normalized.axis.limits.x = axisLimitsNormalized.x;
      if (axisLimitsNormalized.y) normalized.axis.limits.y = axisLimitsNormalized.y;
    }
  }

  if (globalPreCommands.length || globalPostCommands.length) {
    normalized.commands = {};
    if (globalPreCommands.length) normalized.commands.preCommands = globalPreCommands;
    if (globalPostCommands.length) normalized.commands.postCommands = globalPostCommands;
  }

  return Object.keys(normalized).length ? normalized : null;
}

/**
 * @param {unknown} payload
 * @param {OriginPlotOptions} [plotDefaults]
 */
function normalizeOriginCsvPayload(payload, plotDefaults = undefined) {
  const raw = payload && typeof payload === "object" ? payload : {};
  const csv = raw.csv && typeof raw.csv === "object" ? raw.csv : {};
  const workbook =
    raw.workbook && typeof raw.workbook === "object" ? raw.workbook : {};
  const sheet = raw.sheet && typeof raw.sheet === "object" ? raw.sheet : {};
  const plot = raw.plot && typeof raw.plot === "object" ? raw.plot : {};
  const resolvedPlotDefaults = plotDefaults ?? DEFAULT_ORIGIN_PLOT_OPTIONS;
  const capabilities = normalizeOriginCapabilitiesPayload(
    raw.capabilities ?? raw.originCapabilities,
  );

  const csvName = normalizeNonEmptyString(
    raw.csvName ?? csv.name,
    "device_analysis_origin.csv",
  );
  const csvText =
    typeof raw.csvText === "string"
      ? raw.csvText
      : typeof csv.text === "string"
        ? csv.text
        : "";
  const importMode = normalizeNonEmptyString(raw.importMode, "new-book");
  const workbookName = normalizeNonEmptyString(
    raw.workbookName ??
      workbook.longName ??
      raw.seriesName ??
      sheet.longName,
    "",
  );
  const workbookKey = normalizeNonEmptyString(
    raw.workbookKey ?? workbook.key,
    "",
  );
  const sheetName = normalizeNonEmptyString(
    raw.sheetName ?? sheet.longName ?? sheet.name,
    "",
  );
  const normalizedPlot = normalizeOriginPlotOptions(
    {
      plotCommand: plot.command ?? plot.plotCommand ?? raw.plotCommand,
      plotType: plot.type ?? plot.plotType ?? raw.plotType,
      postPlotCommands: plot.postCommands ?? plot.postPlotCommands ?? raw.postPlotCommands,
      lineWidth: plot.lineWidth ?? plot.linewidth ?? plot.line_width ?? raw.lineWidth ?? raw.linewidth ?? raw.line_width,
      xyPairs: plot.xyPairs ?? raw.xyPairs,
    },
    resolvedPlotDefaults,
  );

  return {
    csvName,
    csvText,
    importMode,
    workbookKey,
    workbookName,
    sheetName,
    capabilities,
    ...normalizedPlot,
  };
}

function normalizeOriginCsvBatchPayload(payload, plotDefaults = undefined) {
  const raw = payload && typeof payload === "object" ? payload : {};
  const jobs = Array.isArray(raw.jobs) ? raw.jobs : [];
  if (!jobs.length) return [];
  return jobs.map((job) => normalizeOriginCsvPayload(job, plotDefaults));
}

function getDeviceAnalysisHomeDir() {
  return path.join(app.getPath("home"), ".device");
}

function getDeviceAnalysisDemoDir() {
  return path.join(getDeviceAnalysisHomeDir(), "demo");
}

function resolveDeviceAnalysisDemoSourceDir() {
  const candidates = app.isPackaged
    ? [
        path.join(getResourcesPath(), "demo"),
        path.join(getResourcesPath(), "app.asar", "dist", "demo"),
      ]
    : [
        path.join(__dirname, "..", "public", "demo"),
        path.join(__dirname, "..", "dist", "demo"),
      ];

  return resolveFirstExistingPath(candidates);
}

function ensureDeviceAnalysisDemoFiles() {
  const sourceDir = resolveDeviceAnalysisDemoSourceDir();
  if (!sourceDir) {
    console.warn("[demo] Demo source directory was not found.");
    return { demoDir: getDeviceAnalysisDemoDir(), filePaths: [] };
  }

  const demoDir = getDeviceAnalysisDemoDir();
  fs.mkdirSync(demoDir, { recursive: true });

  const filePaths = [];
  for (const fileName of DEVICE_ANALYSIS_DEMO_FILE_NAMES) {
    const sourcePath = path.join(sourceDir, fileName);
    const targetPath = path.join(demoDir, fileName);
    if (!fs.existsSync(sourcePath)) continue;

    let shouldCopy = true;
    try {
      if (fs.existsSync(targetPath)) {
        const sourceStat = fs.statSync(sourcePath);
        const targetStat = fs.statSync(targetPath);
        shouldCopy = sourceStat.size !== targetStat.size;
      }
    } catch {
      shouldCopy = true;
    }

    if (shouldCopy) {
      fs.copyFileSync(sourcePath, targetPath);
    }
    filePaths.push(targetPath);
  }

  return { demoDir, filePaths };
}

function normalizeAbsoluteFilePath(rawPath) {
  const normalized = typeof rawPath === "string" ? rawPath.trim() : "";
  if (!normalized || !path.isAbsolute(normalized)) return "";
  return path.normalize(normalized);
}

function isSupportedRustExcelInputPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ext === ".xls" || ext === ".xlsx";
}

function isSupportedRustDeviceAnalysisInputPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ext === ".csv" || ext === ".xls" || ext === ".xlsx";
}

function resolveRustExcelConverterPath() {
  const envPath = normalizeAbsoluteFilePath(process.env.CONDUCTOR_RUST_XLS_CONVERTER_PATH);
  const candidates = [
    envPath,
    path.join(getResourcesPath(), "excel", "bin", "rust-xls-converter.exe"),
    isDev
      ? path.join(
          __dirname,
          "..",
          ".tooling",
          "rust-xls-target",
          "release",
          "rust-xls-bench.exe",
        )
      : "",
    isDev
      ? path.join(
          __dirname,
          "..",
          "tools",
          "rust-xls-bench",
          "target",
          "release",
          "rust-xls-bench.exe",
        )
      : "",
    path.join(
      getResourcesPath(),
      "app.asar.unpacked",
      "excel",
      "bin",
      "rust-xls-converter.exe",
    ),
  ].filter(Boolean);

  return candidates.find((candidate) => {
    try {
      return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  }) ?? null;
}

function rejectPendingRustDeviceAnalysisEngineRequests(error) {
  for (const pending of rustDeviceAnalysisEnginePending.values()) {
    clearTimeout(pending.timeoutId);
    pending.reject(error);
  }
  rustDeviceAnalysisEnginePending.clear();
}

function stopRustDeviceAnalysisEngine() {
  if (!rustDeviceAnalysisEngine) return;
  const child = rustDeviceAnalysisEngine;
  rustDeviceAnalysisEngine = null;
  rustDeviceAnalysisEngineStdoutBuffer = "";
  rejectPendingRustDeviceAnalysisEngineRequests(
    new Error("Rust device-analysis engine stopped."),
  );
  try {
    child.kill();
  } catch {
    // best-effort shutdown
  }
}

function handleRustDeviceAnalysisEngineLine(line) {
  const text = String(line ?? "").trim();
  if (!text) return;

  let message = null;
  try {
    message = JSON.parse(text);
  } catch (error) {
    console.warn("[device-analysis-rust] invalid engine JSON:", error?.message || error);
    return;
  }

  const id = Number(message?.id);
  if (!Number.isFinite(id)) return;
  const pending = rustDeviceAnalysisEnginePending.get(id);
  if (!pending) return;

  rustDeviceAnalysisEnginePending.delete(id);
  clearTimeout(pending.timeoutId);

  if (message?.ok === true) {
    pending.resolve(message.result ?? {});
    return;
  }

  const errorMessage =
    typeof message?.error?.message === "string" && message.error.message.trim()
      ? message.error.message
      : "Rust device-analysis engine failed.";
  pending.reject(new Error(errorMessage));
}

function ensureRustDeviceAnalysisEngine() {
  if (rustDeviceAnalysisEngine && !rustDeviceAnalysisEngine.killed) {
    return rustDeviceAnalysisEngine;
  }

  const executablePath = resolveRustExcelConverterPath();
  if (!executablePath) {
    throw new Error("Rust device-analysis engine was not found.");
  }

  const child = spawn(executablePath, ["--stdio-engine"], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  rustDeviceAnalysisEngine = child;
  rustDeviceAnalysisEngineStdoutBuffer = "";

  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk) => {
    rustDeviceAnalysisEngineStdoutBuffer += String(chunk ?? "");
    while (true) {
      const newlineIndex = rustDeviceAnalysisEngineStdoutBuffer.indexOf("\n");
      if (newlineIndex < 0) break;
      const line = rustDeviceAnalysisEngineStdoutBuffer.slice(0, newlineIndex);
      rustDeviceAnalysisEngineStdoutBuffer =
        rustDeviceAnalysisEngineStdoutBuffer.slice(newlineIndex + 1);
      handleRustDeviceAnalysisEngineLine(line);
    }
  });

  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk) => {
    const text = String(chunk ?? "").trim();
    if (text) console.warn("[device-analysis-rust]", text);
  });

  child.on("error", (error) => {
    if (rustDeviceAnalysisEngine === child) rustDeviceAnalysisEngine = null;
    rejectPendingRustDeviceAnalysisEngineRequests(error);
  });

  child.on("exit", (code, signal) => {
    if (rustDeviceAnalysisEngine === child) rustDeviceAnalysisEngine = null;
    rejectPendingRustDeviceAnalysisEngineRequests(
      new Error(
        `Rust device-analysis engine exited (code=${code ?? "null"} signal=${signal ?? "null"}).`,
      ),
    );
  });

  return child;
}

function sendRustDeviceAnalysisEngineCommand(command, payload = {}, timeoutMs = 120000) {
  const child = ensureRustDeviceAnalysisEngine();
  const id = (rustDeviceAnalysisEngineRequestId += 1);
  const message = JSON.stringify({ id, command, ...payload });

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      rustDeviceAnalysisEnginePending.delete(id);
      reject(new Error(`Rust device-analysis engine command timed out: ${command}`));
    }, timeoutMs);

    rustDeviceAnalysisEnginePending.set(id, { reject, resolve, timeoutId });

    try {
      child.stdin.write(`${message}\n`, "utf8", (error) => {
        if (!error) return;
        rustDeviceAnalysisEnginePending.delete(id);
        clearTimeout(timeoutId);
        reject(error);
      });
    } catch (error) {
      rustDeviceAnalysisEnginePending.delete(id);
      clearTimeout(timeoutId);
      reject(error);
    }
  });
}

function createRustDeviceAnalysisEngineSlot(name) {
  return {
    busyCount: 0,
    child: null,
    name,
    pending: new Map(),
    requestId: 0,
    stdoutBuffer: "",
  };
}

function rejectPendingRustDeviceAnalysisEngineSlotRequests(slot, error) {
  for (const pending of slot.pending.values()) {
    clearTimeout(pending.timeoutId);
    pending.reject(error);
  }
  slot.pending.clear();
  slot.busyCount = 0;
}

function stopRustDeviceAnalysisEngineSlot(slot) {
  if (!slot?.child) return;
  const child = slot.child;
  slot.child = null;
  slot.stdoutBuffer = "";
  rejectPendingRustDeviceAnalysisEngineSlotRequests(
    slot,
    new Error(`Rust device-analysis engine stopped (${slot.name}).`),
  );
  try {
    child.kill();
  } catch {
    // best-effort shutdown
  }
}

function handleRustDeviceAnalysisEngineSlotLine(slot, line) {
  const text = String(line ?? "").trim();
  if (!text) return;

  let message = null;
  try {
    message = JSON.parse(text);
  } catch (error) {
    console.warn(
      `[device-analysis-rust:${slot.name}] invalid engine JSON:`,
      error?.message || error,
    );
    return;
  }

  const id = Number(message?.id);
  if (!Number.isFinite(id)) return;
  const pending = slot.pending.get(id);
  if (!pending) return;

  slot.pending.delete(id);
  slot.busyCount = Math.max(0, slot.busyCount - 1);
  clearTimeout(pending.timeoutId);

  if (message?.ok === true) {
    pending.resolve(message.result ?? {});
    return;
  }

  const errorMessage =
    typeof message?.error?.message === "string" && message.error.message.trim()
      ? message.error.message
      : "Rust device-analysis engine failed.";
  pending.reject(new Error(errorMessage));
}

function ensureRustDeviceAnalysisEngineSlot(slot) {
  if (slot.child && !slot.child.killed) {
    return slot.child;
  }

  const executablePath = resolveRustExcelConverterPath();
  if (!executablePath) {
    throw new Error("Rust device-analysis engine was not found.");
  }

  const child = spawn(executablePath, ["--stdio-engine"], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  slot.child = child;
  slot.stdoutBuffer = "";

  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk) => {
    slot.stdoutBuffer += String(chunk ?? "");
    while (true) {
      const newlineIndex = slot.stdoutBuffer.indexOf("\n");
      if (newlineIndex < 0) break;
      const line = slot.stdoutBuffer.slice(0, newlineIndex);
      slot.stdoutBuffer = slot.stdoutBuffer.slice(newlineIndex + 1);
      handleRustDeviceAnalysisEngineSlotLine(slot, line);
    }
  });

  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk) => {
    const text = String(chunk ?? "").trim();
    if (text) console.warn(`[device-analysis-rust:${slot.name}]`, text);
  });

  child.on("error", (error) => {
    if (slot.child === child) slot.child = null;
    rejectPendingRustDeviceAnalysisEngineSlotRequests(slot, error);
  });

  child.on("exit", (code, signal) => {
    if (slot.child === child) slot.child = null;
    rejectPendingRustDeviceAnalysisEngineSlotRequests(
      slot,
      new Error(
        `Rust device-analysis engine exited (${slot.name}, code=${code ?? "null"} signal=${signal ?? "null"}).`,
      ),
    );
  });

  return child;
}

function getRustDeviceAnalysisProcessingSlot() {
  while (rustDeviceAnalysisProcessingSlots.length < DEVICE_ANALYSIS_RUST_PROCESSING_POOL_SIZE) {
    rustDeviceAnalysisProcessingSlots.push(
      createRustDeviceAnalysisEngineSlot(
        `process-${rustDeviceAnalysisProcessingSlots.length + 1}`,
      ),
    );
  }

  let selected = rustDeviceAnalysisProcessingSlots[0];
  for (let offset = 0; offset < rustDeviceAnalysisProcessingSlots.length; offset += 1) {
    const index =
      (rustDeviceAnalysisProcessingSlotCursor + offset) %
      rustDeviceAnalysisProcessingSlots.length;
    const slot = rustDeviceAnalysisProcessingSlots[index];
    if (slot.busyCount < selected.busyCount) {
      selected = slot;
    }
  }
  rustDeviceAnalysisProcessingSlotCursor =
    (rustDeviceAnalysisProcessingSlots.indexOf(selected) + 1) %
    rustDeviceAnalysisProcessingSlots.length;
  return selected;
}

function sendRustDeviceAnalysisProcessingCommand(command, payload = {}, timeoutMs = 120000) {
  const slot = getRustDeviceAnalysisProcessingSlot();
  return sendRustDeviceAnalysisEngineSlotCommand(slot, command, payload, timeoutMs);
}

function createRustDeviceAnalysisResultTempDir(fileId) {
  const safeFileId = String(fileId || "file").replace(/[^a-zA-Z0-9._-]+/g, "_");
  const root = path.join(app.getPath("temp"), "conductor-device-analysis");
  fs.mkdirSync(root, { recursive: true });
  return fs.mkdtempSync(path.join(root, `${safeFileId}-`));
}

async function hydrateRustDeviceAnalysisResultRefs(result, tempDir = null) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return result;

  const ref = result.analysisCacheRef;
  const refPath =
    ref && typeof ref === "object" && typeof ref.path === "string"
      ? normalizeAbsoluteFilePath(ref.path)
      : "";
  if (refPath && ref?.format === "json") {
    const text = await fs.promises.readFile(refPath, "utf8");
    result.analysisCache = JSON.parse(text);
    delete result.analysisCacheRef;
  }

  if (tempDir) {
    void fs.promises.rm(tempDir, { force: true, recursive: true }).catch(() => {});
  }
  return result;
}

function sendRustDeviceAnalysisEngineSlotCommand(
  slot,
  command,
  payload = {},
  timeoutMs = 120000,
) {
  const child = ensureRustDeviceAnalysisEngineSlot(slot);
  const id = (slot.requestId += 1);
  const message = JSON.stringify({ id, command, ...payload });
  slot.busyCount += 1;

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      slot.pending.delete(id);
      slot.busyCount = Math.max(0, slot.busyCount - 1);
      reject(new Error(`Rust device-analysis engine command timed out: ${command}`));
    }, timeoutMs);

    slot.pending.set(id, { reject, resolve, timeoutId });

    try {
      child.stdin.write(`${message}\n`, "utf8", (error) => {
        if (!error) return;
        slot.pending.delete(id);
        slot.busyCount = Math.max(0, slot.busyCount - 1);
        clearTimeout(timeoutId);
        reject(error);
      });
    } catch (error) {
      slot.pending.delete(id);
      slot.busyCount = Math.max(0, slot.busyCount - 1);
      clearTimeout(timeoutId);
      reject(error);
    }
  });
}

async function disposeRustDeviceAnalysisProcessingFile(fileId) {
  if (!fileId) return;
  const disposals = rustDeviceAnalysisProcessingSlots
    .filter((slot) => slot.child && !slot.child.killed)
    .map((slot) =>
      sendRustDeviceAnalysisEngineSlotCommand(slot, "dispose", { fileId }, 30000),
    );
  await Promise.allSettled(disposals);
}

function stopRustDeviceAnalysisProcessingEngines() {
  for (const slot of rustDeviceAnalysisProcessingSlots) {
    stopRustDeviceAnalysisEngineSlot(slot);
  }
  rustDeviceAnalysisProcessingSlots.length = 0;
  rustDeviceAnalysisProcessingSlotCursor = 0;
}

function runRustExcelConverter(executablePath, inputPath, outputPath, manifestPath = null) {
  return new Promise((resolve, reject) => {
    const args = ["--convert-one", inputPath, "--out", outputPath];
    if (manifestPath) {
      args.push("--manifest", manifestPath);
    }
    execFile(
      executablePath,
      args,
      {
        timeout: 120000,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              stderr?.trim() ||
                stdout?.trim() ||
                error.message ||
                "Rust Excel converter failed.",
            ),
          );
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

function normalizeRustImportAssessment(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const confidence = ["high", "medium", "low"].includes(raw.curveTypeConfidence)
    ? raw.curveTypeConfidence
    : "low";
  const xAxisRole =
    raw.xAxisRole === "vg" || raw.xAxisRole === "vd" ? raw.xAxisRole : null;
  const sourceValues = new Set(["filename", "title", "label", "metadata", "shape"]);
  const xAxisRoleSource = sourceValues.has(raw.xAxisRoleSource)
    ? raw.xAxisRoleSource
    : null;
  const curveType =
    typeof raw.curveType === "string" && raw.curveType.trim()
      ? raw.curveType.trim()
      : null;
  return {
    curveType,
    curveTypeConfidence: confidence,
    curveTypeNeedsTemplate: Boolean(raw.curveTypeNeedsTemplate),
    curveTypeReasons: Array.isArray(raw.curveTypeReasons)
      ? raw.curveTypeReasons.filter((item) => typeof item === "string")
      : [],
    xAxisRole,
    xAxisRoleSource,
  };
}

function readRustExcelConvertManifest(manifestPath) {
  try {
    if (!manifestPath || !fs.existsSync(manifestPath)) return null;
    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function isRustConvertedCsvPath(filePath) {
  const normalized = normalizeAbsoluteFilePath(filePath);
  if (!normalized || path.extname(normalized).toLowerCase() !== ".csv") return false;
  const root = path.normalize(path.join(getDeviceAnalysisHomeDir(), "rust-xls-jobs"));
  const relative = path.relative(root, normalized);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function handleExcelReadConvertedCsv(_event, payload) {
  const rawPath = payload && typeof payload === "object" ? payload.path : payload;
  const csvPath = normalizeAbsoluteFilePath(rawPath);
  if (!isRustConvertedCsvPath(csvPath)) {
    return {
      ok: false,
      code: "INVALID_CONVERTED_CSV_PATH",
      message: "Invalid converted CSV path.",
    };
  }

  try {
    const stat = fs.statSync(csvPath);
    if (!stat.isFile()) {
      return {
        ok: false,
        code: "CONVERTED_CSV_NOT_FOUND",
        message: "Converted CSV path is not a file.",
      };
    }
    return {
      ok: true,
      csvText: fs.readFileSync(csvPath, "utf8"),
      sizeBytes: stat.size,
      source: "rust-converted-csv",
    };
  } catch (error) {
    return {
      ok: false,
      code: "CONVERTED_CSV_READ_FAILED",
      message: error?.message || "Failed to read converted CSV.",
    };
  }
}

const deviceAnalysisStore = createDeviceAnalysisStore({
  getHomeDir: getDeviceAnalysisHomeDir,
});

function configureRuntimeCachePath() {
  const cacheDir = path.join(getDeviceAnalysisHomeDir(), "cache");
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  try {
    app.setPath("cache", cacheDir);
  } catch (error) {
    console.warn("[runtime] Failed to set cache path:", error?.message || error);
  }
}

function handleDeviceAnalysisTemplatesGet() {
  return deviceAnalysisStore.getDeviceAnalysisTemplates();
}

function handleDeviceAnalysisTemplatesCreate(_event, payload) {
  return deviceAnalysisStore.upsertDeviceAnalysisTemplate(payload);
}

function handleDeviceAnalysisTemplatesDelete(_event, id) {
  return deviceAnalysisStore.deleteDeviceAnalysisTemplate(id);
}

function handleDeviceAnalysisSettingsGet() {
  return deviceAnalysisStore.getDeviceAnalysisSettings();
}

function handleDeviceAnalysisDemoFilesGet() {
  const { demoDir, filePaths } = ensureDeviceAnalysisDemoFiles();
  return {
    demoDir,
    files: filePaths
      .filter((filePath) => fs.existsSync(filePath))
      .map((filePath) => {
        const stat = fs.statSync(filePath);
        return {
          fileName: path.basename(filePath),
          path: filePath,
          text: fs.readFileSync(filePath, "utf8"),
          size: stat.size,
          lastModified: stat.mtimeMs,
        };
      }),
  };
}

function handleDesktopMetaGet(event) {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) {
    event.returnValue = null;
    return;
  }

  event.returnValue = {
    isDesktop: true,
    platform: process.platform,
    isPackaged: app.isPackaged,
  };
}

function handleDesktopBootSettingsGet(event) {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) {
    event.returnValue = null;
    return;
  }

  try {
    event.returnValue = deviceAnalysisStore.getDeviceAnalysisSettings();
  } catch (error) {
    console.warn("[boot] Failed to load initial desktop settings:", error?.message || error);
    event.returnValue = null;
  }
}

function cleanupRustExcelJobRoot() {
  const jobRoot = path.join(getDeviceAnalysisHomeDir(), "rust-xls-jobs");
  try {
    if (fs.existsSync(jobRoot)) {
      fs.rmSync(jobRoot, { recursive: true, force: true });
    }
  } catch (error) {
    console.warn("[device-analysis] Failed to clean Rust Excel jobs:", error?.message || error);
  }
}

function ensureRustExcelJobRoot() {
  const jobRoot = path.join(getDeviceAnalysisHomeDir(), "rust-xls-jobs");
  fs.mkdirSync(jobRoot, { recursive: true });
  return jobRoot;
}

function handleDeviceAnalysisSettingsPatch(_event, updates) {
  return deviceAnalysisStore.patchDeviceAnalysisSettings(updates);
}

function handleDeviceAnalysisPersistencePathGet() {
  return deviceAnalysisStore.getStorePersistenceInfo();
}

async function handleExcelConvertRust(_event, payload) {
  const rawPath = payload && typeof payload === "object" ? payload.path : payload;
  const inputPath = normalizeAbsoluteFilePath(rawPath);
  if (!inputPath || !isSupportedRustExcelInputPath(inputPath)) {
    return {
      ok: false,
      code: "INVALID_EXCEL_PATH",
      message: "Invalid Excel file path.",
    };
  }

  try {
    const stat = fs.statSync(inputPath);
    if (!stat.isFile()) {
      return {
        ok: false,
        code: "INVALID_EXCEL_PATH",
        message: "Excel path is not a file.",
      };
    }
  } catch (error) {
    return {
      ok: false,
      code: "EXCEL_FILE_NOT_FOUND",
      message: error?.message || "Excel file not found.",
    };
  }

  const converterPath = resolveRustExcelConverterPath();
  if (!converterPath) {
    return {
      ok: false,
      code: "RUST_CONVERTER_NOT_FOUND",
      message: "Rust Excel converter was not found.",
    };
  }

  const startedAt = Date.now();
  const returnCsvText = payload?.returnCsvText !== false;
  const jobRoot = ensureRustExcelJobRoot();
  const jobDir = fs.mkdtempSync(path.join(jobRoot, "job-"));
  const csvPath = path.join(jobDir, "converted.csv");
  const manifestPath = path.join(jobDir, "manifest.json");

  try {
    await runRustExcelConverter(converterPath, inputPath, csvPath, manifestPath);
    const csvText = returnCsvText ? fs.readFileSync(csvPath, "utf8") : undefined;
    const manifest = readRustExcelConvertManifest(manifestPath);
    const assessment = normalizeRustImportAssessment(manifest?.assessment);
    return {
      ok: true,
      assessment,
      csvPath,
      csvText: returnCsvText ? csvText : undefined,
      durationMs: Date.now() - startedAt,
      manifest,
      normalizedSizeBytes:
        manifest?.csvBytes ?? fs.statSync(csvPath).size,
      source: "rust",
    };
  } catch (error) {
    return {
      ok: false,
      code: "RUST_CONVERTER_FAILED",
      message: error?.message || "Rust Excel conversion failed.",
      durationMs: Date.now() - startedAt,
    };
  } finally {
    if (returnCsvText) {
      try {
        fs.rmSync(jobDir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    }
  }
}

async function handleDeviceAnalysisRustEngineOpen(_event, payload) {
  const rawPath = payload && typeof payload === "object" ? payload.path : "";
  const inputPath = normalizeAbsoluteFilePath(rawPath);
  const fileId =
    payload && typeof payload.fileId === "string" ? payload.fileId.trim() : "";
  const fileName =
    payload && typeof payload.fileName === "string" ? payload.fileName.trim() : "";
  const seedRows = Math.max(
    0,
    Math.min(5000, Math.floor(Number(payload?.seedRows) || 0)),
  );

  if (!fileId || !inputPath || !isSupportedRustDeviceAnalysisInputPath(inputPath)) {
    return {
      ok: false,
      code: "INVALID_DEVICE_ANALYSIS_PATH",
      message: "Invalid device-analysis file path.",
    };
  }

  try {
    const stat = fs.statSync(inputPath);
    if (!stat.isFile()) {
      return {
        ok: false,
        code: "INVALID_DEVICE_ANALYSIS_PATH",
        message: "Device-analysis path is not a file.",
      };
    }
  } catch (error) {
    return {
      ok: false,
      code: "DEVICE_ANALYSIS_FILE_NOT_FOUND",
      message: error?.message || "Device-analysis file not found.",
    };
  }

  const startedAt = Date.now();
  try {
    const result = await sendRustDeviceAnalysisEngineCommand("open", {
      fileId,
      fileName: fileName || path.basename(inputPath),
      path: inputPath,
      seedRows,
    });
    return {
      ok: true,
      durationMs: Date.now() - startedAt,
      result,
      source: "rust-engine",
    };
  } catch (error) {
    return {
      ok: false,
      code: "RUST_ENGINE_OPEN_FAILED",
      durationMs: Date.now() - startedAt,
      message: error?.message || "Rust device-analysis engine failed to open file.",
    };
  }
}

async function handleDeviceAnalysisRustEnginePreviewRows(_event, payload) {
  const fileId =
    payload && typeof payload.fileId === "string" ? payload.fileId.trim() : "";
  const startRow = Math.max(0, Math.floor(Number(payload?.startRow) || 0));
  const endRow = Math.max(startRow, Math.floor(Number(payload?.endRow) || startRow));

  if (!fileId) {
    return {
      ok: false,
      code: "INVALID_DEVICE_ANALYSIS_FILE_ID",
      message: "Missing file id.",
    };
  }

  const startedAt = Date.now();
  try {
    const result = await sendRustDeviceAnalysisEngineCommand("previewRows", {
      endRow,
      fileId,
      startRow,
    });
    return {
      ok: true,
      durationMs: Date.now() - startedAt,
      result,
      source: "rust-engine",
    };
  } catch (error) {
    return {
      ok: false,
      code: "RUST_ENGINE_PREVIEW_ROWS_FAILED",
      durationMs: Date.now() - startedAt,
      message:
        error?.message || "Rust device-analysis engine failed to read preview rows.",
    };
  }
}

async function handleDeviceAnalysisRustEnginePreviewMeta(_event, payload) {
  const fileId =
    payload && typeof payload.fileId === "string" ? payload.fileId.trim() : "";

  if (!fileId) {
    return {
      ok: false,
      code: "INVALID_DEVICE_ANALYSIS_FILE_ID",
      message: "Missing file id.",
    };
  }

  const startedAt = Date.now();
  try {
    const result = await sendRustDeviceAnalysisEngineCommand("previewMeta", {
      fileId,
    });
    return {
      ok: true,
      durationMs: Date.now() - startedAt,
      result,
      source: "rust-engine",
    };
  } catch (error) {
    return {
      ok: false,
      code: "RUST_ENGINE_PREVIEW_META_FAILED",
      durationMs: Date.now() - startedAt,
      message:
        error?.message || "Rust device-analysis engine failed to read preview metadata.",
    };
  }
}

function normalizeDeviceAnalysisCellIndex(value) {
  const index = Math.floor(Number(value));
  return Number.isInteger(index) && index >= 0 ? index : null;
}

async function handleDeviceAnalysisRustEngineReadCell(_event, payload) {
  const fileId =
    payload && typeof payload.fileId === "string" ? payload.fileId.trim() : "";
  const rowIndex = normalizeDeviceAnalysisCellIndex(payload?.rowIndex);
  const colIndex = normalizeDeviceAnalysisCellIndex(payload?.colIndex);

  if (!fileId || rowIndex === null || colIndex === null) {
    return {
      ok: false,
      code: "INVALID_DEVICE_ANALYSIS_CELL",
      message: "Invalid device-analysis cell request.",
    };
  }

  const startedAt = Date.now();
  try {
    const result = await sendRustDeviceAnalysisEngineCommand("readCell", {
      colIndex,
      fileId,
      rowIndex,
    });
    return {
      ok: true,
      durationMs: Date.now() - startedAt,
      result,
      source: "rust-engine",
    };
  } catch (error) {
    return {
      ok: false,
      code: "RUST_ENGINE_READ_CELL_FAILED",
      durationMs: Date.now() - startedAt,
      message: error?.message || "Rust device-analysis engine failed to read cell.",
    };
  }
}

async function handleDeviceAnalysisRustEngineReadCells(_event, payload) {
  const fileId =
    payload && typeof payload.fileId === "string" ? payload.fileId.trim() : "";
  const rawCells = Array.isArray(payload?.cells) ? payload.cells : [];
  const cells = rawCells
    .map((cell) => ({
      colIndex: normalizeDeviceAnalysisCellIndex(cell?.colIndex),
      rowIndex: normalizeDeviceAnalysisCellIndex(cell?.rowIndex),
    }))
    .filter((cell) => cell.rowIndex !== null && cell.colIndex !== null)
    .slice(0, 5000);

  if (!fileId || !cells.length || cells.length !== rawCells.length) {
    return {
      ok: false,
      code: "INVALID_DEVICE_ANALYSIS_CELLS",
      message: "Invalid device-analysis cells request.",
    };
  }

  const startedAt = Date.now();
  try {
    const result = await sendRustDeviceAnalysisEngineCommand("readCells", {
      cells,
      fileId,
    });
    return {
      ok: true,
      durationMs: Date.now() - startedAt,
      result,
      source: "rust-engine",
    };
  } catch (error) {
    return {
      ok: false,
      code: "RUST_ENGINE_READ_CELLS_FAILED",
      durationMs: Date.now() - startedAt,
      message: error?.message || "Rust device-analysis engine failed to read cells.",
    };
  }
}

async function handleDeviceAnalysisRustEngineInferAutoExtraction(_event, payload) {
  const rawPath = payload && typeof payload === "object" ? payload.path : "";
  const inputPath = normalizeAbsoluteFilePath(rawPath);
  const fileId =
    payload && typeof payload.fileId === "string" ? payload.fileId.trim() : "";
  const fileName =
    payload && typeof payload.fileName === "string" ? payload.fileName.trim() : "";

  if (!fileId || !inputPath || !isSupportedRustDeviceAnalysisInputPath(inputPath)) {
    return {
      ok: false,
      code: "INVALID_DEVICE_ANALYSIS_PATH",
      message: "Invalid device-analysis file path.",
    };
  }

  const startedAt = Date.now();
  try {
    const result = await sendRustDeviceAnalysisEngineCommand("inferAutoExtraction", {
      fileId,
      fileName: fileName || path.basename(inputPath),
      path: inputPath,
    });
    return {
      ok: true,
      durationMs: Date.now() - startedAt,
      result,
      source: "rust-engine",
    };
  } catch (error) {
    return {
      ok: false,
      code: "RUST_ENGINE_INFER_AUTO_EXTRACTION_FAILED",
      durationMs: Date.now() - startedAt,
      message:
        error?.message ||
        "Rust device-analysis engine failed to infer auto extraction.",
    };
  }
}

function isRustProcessFileConfigSupported(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return false;
  }
  const mode = String(config.xSegmentationMode ?? "").trim().toLowerCase();
  if (mode && mode !== "auto" && mode !== "points" && mode !== "segments") return false;
  if (!Array.isArray(config.yCols) || !config.yCols.length) return false;
  return true;
}

async function handleDeviceAnalysisRustEngineProcessFile(_event, payload) {
  const rawPath = payload && typeof payload === "object" ? payload.path : "";
  const inputPath = normalizeAbsoluteFilePath(rawPath);
  const fileId =
    payload && typeof payload.fileId === "string" ? payload.fileId.trim() : "";
  const fileName =
    payload && typeof payload.fileName === "string" ? payload.fileName.trim() : "";
  const config =
    payload && typeof payload.config === "object" && !Array.isArray(payload.config)
      ? payload.config
      : null;
  const maxPoints = Math.max(2, Math.floor(Number(payload?.maxPoints) || 600));
  const auto = payload?.auto === true;

  if (!fileId || !inputPath || !isSupportedRustDeviceAnalysisInputPath(inputPath)) {
    return {
      ok: false,
      code: "INVALID_DEVICE_ANALYSIS_PATH",
      message: "Invalid device-analysis file path.",
    };
  }
  if (!auto && !isRustProcessFileConfigSupported(config)) {
    return {
      ok: false,
      code: "RUST_ENGINE_PROCESS_UNSUPPORTED_CONFIG",
      message: "Rust engine does not support this extraction config yet.",
    };
  }

  const startedAt = Date.now();
  const tempDir = createRustDeviceAnalysisResultTempDir(fileId);
  const analysisCachePath = path.join(tempDir, "analysis-cache.json");
  try {
    const result = await sendRustDeviceAnalysisProcessingCommand(
      auto ? "processFileAuto" : "processFile",
      {
        analysisCachePath,
        config,
        curveFilterField:
          typeof payload?.curveFilterField === "string" ? payload.curveFilterField : null,
        curveFilterKey:
          typeof payload?.curveFilterKey === "string" ? payload.curveFilterKey : null,
        fileId,
        fileName: fileName || path.basename(inputPath),
        maxPoints,
        path: inputPath,
      },
    );
    await hydrateRustDeviceAnalysisResultRefs(result, tempDir);
    void disposeRustDeviceAnalysisProcessingFile(fileId);
    return {
      ok: true,
      durationMs: Date.now() - startedAt,
      result,
      source: "rust-engine-pool",
    };
  } catch (error) {
    void fs.promises.rm(tempDir, { force: true, recursive: true }).catch(() => {});
    return {
      ok: false,
      code: "RUST_ENGINE_PROCESS_FAILED",
      durationMs: Date.now() - startedAt,
      message: error?.message || "Rust device-analysis engine failed to process file.",
    };
  }
}

async function handleDeviceAnalysisRustEngineDispose(_event, payload) {
  const fileId =
    payload && typeof payload.fileId === "string" ? payload.fileId.trim() : "";

  try {
    if (payload?.clear === true) {
      await sendRustDeviceAnalysisEngineCommand("clear", {}, 30000);
      return { ok: true, source: "rust-engine" };
    }
    if (fileId) {
      await sendRustDeviceAnalysisEngineCommand("dispose", { fileId }, 30000);
    }
    return { ok: true, source: "rust-engine" };
  } catch (error) {
    return {
      ok: false,
      code: "RUST_ENGINE_DISPOSE_FAILED",
      message: error?.message || "Rust device-analysis engine dispose failed.",
    };
  }
}

function handleDeviceAnalysisPersistencePathSet(_event, payload) {
  const rawPath =
    payload && typeof payload === "object" ? payload.path : payload;
  return deviceAnalysisStore.setPersistencePath(rawPath);
}

async function handleDeviceAnalysisPersistencePathChoose(event) {
  const currentInfo = deviceAnalysisStore.getStorePersistenceInfo();
  const win = BrowserWindow.fromWebContents(event.sender) ?? null;

  const result = await dialog.showSaveDialog(win || undefined, {
    title: "Select user config file path",
    defaultPath: currentInfo.currentPath,
    buttonLabel: "Confirm",
    filters: [
      { name: "JSON", extensions: ["json"] },
      { name: "All Files", extensions: ["*"] },
    ],
    properties: ["createDirectory", "showOverwriteConfirmation"],
  });

  if (result.canceled || !result.filePath) {
    return { ...currentInfo, cancelled: true };
  }

  const updated = deviceAnalysisStore.setPersistencePath(result.filePath);
  return { ...updated, cancelled: false };
}

function getOriginExePathFromSettings() {
  const settings = deviceAnalysisStore.getDeviceAnalysisSettings();
  return normalizeOriginExePath(settings?.originExePath);
}

function saveOriginExePathToSettings(originExePath) {
  originDetectionCache = null;
  originDetectionPromise = null;
  const normalizedPath = normalizeOriginExePath(originExePath);
  const settings = deviceAnalysisStore.patchDeviceAnalysisSettings({
    originExePath: normalizedPath,
  });
  return settings.originExePath ?? null;
}

function getOriginRuntimeCleanupPolicyFromSettings() {
  const settings = deviceAnalysisStore.getDeviceAnalysisSettings();
  return {
    enabled: Boolean(settings?.originRuntimeCleanupEnabled),
    keepSuccessJobs: Number(settings?.originRuntimeKeepSuccessJobs),
    failedRetentionDays: Number(settings?.originRuntimeFailedRetentionDays),
  };
}

function getOriginPlotOptionsFromSettings() {
  const settings = deviceAnalysisStore.getDeviceAnalysisSettings();
  return normalizeOriginPlotOptions({
    plotCommand: settings?.originPlotCommandDefault,
    plotType: settings?.originPlotTypeDefault,
    postPlotCommands: settings?.originPlotPostCommandsDefault,
    lineWidth: settings?.originPlotLineWidthDefault,
    xyPairs: settings?.originPlotXyPairsDefault,
  });
}

function logOriginDetectionResult(context, result) {
  const probes = Array.isArray(result?.probes) ? result.probes : [];
  const probeSummary = probes
    .map((probe) => {
      const source = String(probe?.source || "unknown");
      const count = Number.isFinite(Number(probe?.candidates))
        ? Number(probe.candidates)
        : 0;
      const uniqueCount = Number.isFinite(Number(probe?.uniqueCandidates))
        ? Number(probe.uniqueCandidates)
        : 0;
      const matched = probe?.matched === true ? "matched" : "miss";
      return `${source}:raw=${count},unique=${uniqueCount},${matched}`;
    })
    .join(" | ");

  if (result?.path) {
    console.info(
      `[origin-detect] ${context}: detected '${result.path}'` +
        `${result.source ? ` via ${result.source}` : ""}` +
        `${probeSummary ? ` (${probeSummary})` : ""}`,
    );
    return;
  }

  console.warn(
    `[origin-detect] ${context}: no Origin executable detected` +
      `${probeSummary ? ` (${probeSummary})` : ""}`,
  );
}

async function detectOriginExecutablePathCached() {
  const now = Date.now();
  if (
    originDetectionCache &&
    now - originDetectionCache.createdAt < ORIGIN_DETECTION_CACHE_TTL_MS
  ) {
    return originDetectionCache.result;
  }

  if (!originDetectionPromise) {
    originDetectionPromise = Promise.resolve()
      .then(async () => {
        const { detectOriginExecutablePathDetailed } = await loadOriginRunnerModule();
        const result = await detectOriginExecutablePathDetailed();
        originDetectionCache = {
          createdAt: Date.now(),
          result,
        };
        return result;
      })
      .finally(() => {
        originDetectionPromise = null;
      });
  }

  return originDetectionPromise;
}

async function tryRunOriginRuntimeCleanup({ force = false, clearAll = false } = {}) {
  const { runOriginRuntimeCleanup } = await loadOriginRunnerModule();
  return runOriginRuntimeCleanup({
    runtimeRootDir: getDeviceAnalysisHomeDir(),
    policy: getOriginRuntimeCleanupPolicyFromSettings(),
    force,
    clearAll,
  });
}

async function handleOriginExeGet() {
  const configured = getOriginExePathFromSettings();
  if (configured) {
    try {
      return assertOriginExePath(configured);
    } catch {
      // Fall through to auto detection.
    }
  }

  const detectResult = await detectOriginExecutablePathCached();
  logOriginDetectionResult("originExeGet", detectResult);
  if (detectResult.path) {
    return saveOriginExePathToSettings(detectResult.path);
  }

  return null;
}

function handleOriginExeSet(_event, payload) {
  const rawPath =
    payload && typeof payload === "object" ? payload.path : payload;
  const validated = assertOriginExePath(rawPath);
  return saveOriginExePathToSettings(validated);
}

async function handleOriginExePick(event) {
  if (!isWindows) return null;

  const win = BrowserWindow.fromWebContents(event.sender) ?? null;
  const { pickOriginExecutable } = await loadOriginRunnerModule();
  const pickedPath = await pickOriginExecutable({
    dialog,
    ownerWindow: win,
    defaultPath: getOriginExePathFromSettings(),
  });

  if (!pickedPath) return null;
  return saveOriginExePathToSettings(pickedPath);
}

async function resolveOriginExePath(event) {
  const configured = getOriginExePathFromSettings();
  if (configured) {
    try {
      return assertOriginExePath(configured);
    } catch {
      // Fall through to auto detection + picker.
    }
  }

  const detectResult = await detectOriginExecutablePathCached();
  logOriginDetectionResult("resolveOriginExePath", detectResult);
  if (detectResult.path) {
    return saveOriginExePathToSettings(detectResult.path);
  }

  return handleOriginExePick(event);
}

async function resolveOriginExePathForHealthCheck(event, payload) {
  const rawPath =
    payload && typeof payload === "object" ? payload.path : payload;
  if (typeof rawPath === "string" && rawPath.trim()) {
    const validated = assertOriginExePath(rawPath);
    return saveOriginExePathToSettings(validated);
  }

  const configured = await handleOriginExeGet();
  if (configured) {
    return configured;
  }

  const allowPick = Boolean(payload && typeof payload === "object" && payload.allowPick);
  if (allowPick) {
    const picked = await resolveOriginExePath(event);
    if (picked) return picked;
  }

  throw new Error("__ORIGIN_EXE_REQUIRED__");
}

async function handleOriginHealthCheck(event, payload) {
  if (!isWindows) {
    throw new Error("Origin integration is only available on Windows desktop.");
  }

  const originExePath = await resolveOriginExePathForHealthCheck(event, payload);
  const { runOriginHealthCheck } = await loadOriginRunnerModule();

  try {
    return await runOriginHealthCheck({
      originExePath,
      workerScriptPath: ORIGIN_CSV_SCRIPT_PATH,
      workerExecutablePath: ORIGIN_CSV_WORKER_PATH,
      runtimeRootDir: getDeviceAnalysisHomeDir(),
    });
  } finally {
    try {
      await tryRunOriginRuntimeCleanup();
    } catch (cleanupError) {
      console.warn("[origin-cleanup] Health check cleanup failed:", cleanupError);
    }
  }
}

async function handleOriginRunCsv(event, payload) {
  if (!isWindows) {
    throw new Error("Origin integration is only available on Windows desktop.");
  }

  const plotDefaults = getOriginPlotOptionsFromSettings();
  const normalizedBatchJobs = normalizeOriginCsvBatchPayload(payload, plotDefaults);
  const normalizedPayload = normalizedBatchJobs.length
    ? null
    : normalizeOriginCsvPayload(payload, plotDefaults);

  const originExePath = await resolveOriginExePath(event);
  if (!originExePath) {
    throw new Error("__ORIGIN_EXE_REQUIRED__");
  }

  const { runOriginCsvBatchJob, runOriginCsvJob } = await loadOriginRunnerModule();

  try {
    if (normalizedBatchJobs.length) {
      return await runOriginCsvBatchJob({
        jobs: normalizedBatchJobs,
        originExePath,
        workerScriptPath: ORIGIN_CSV_SCRIPT_PATH,
        workerExecutablePath: ORIGIN_CSV_WORKER_PATH,
        runtimeRootDir: getDeviceAnalysisHomeDir(),
      });
    }

    const {
      csvName,
      csvText,
      importMode,
      workbookKey,
      workbookName,
      sheetName,
      plotType,
      xyPairs,
      plotCommand,
      postPlotCommands,
      lineWidth,
      capabilities,
    } =
      normalizedPayload;

    if (!csvText.trim()) {
      throw new Error("CSV payload is missing.");
    }

    return await runOriginCsvJob({
      csvName,
      csvText,
      importMode,
      workbookKey,
      workbookName,
      sheetName,
      plotType,
      xyPairs,
      plotCommand,
      postPlotCommands,
      lineWidth,
      capabilities,
      originExePath,
      workerScriptPath: ORIGIN_CSV_SCRIPT_PATH,
      workerExecutablePath: ORIGIN_CSV_WORKER_PATH,
      runtimeRootDir: getDeviceAnalysisHomeDir(),
    });
  } finally {
    try {
      await tryRunOriginRuntimeCleanup();
    } catch (cleanupError) {
      console.warn("[origin-cleanup] CSV cleanup failed:", cleanupError);
    }
  }
}

async function handleOriginRuntimeCleanupRun() {
  if (!isWindows) {
    throw new Error("Origin integration is only available on Windows desktop.");
  }

  return tryRunOriginRuntimeCleanup({ force: true, clearAll: true });
}

function normalizeAutoUpdateUrl(value) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function resolveAutoUpdateFeedUrl() {
  return normalizeAutoUpdateUrl(
    process.env.CONDUCTOR_UPDATE_URL ||
      process.env.DEVICE_ANALYSIS_UPDATE_URL ||
      process.env.APP_UPDATE_URL ||
      null,
  );
}

function resolvePackagedAutoUpdateConfig() {
  try {
    const packageJson = require("../package.json");
    const publish = packageJson?.build?.publish;
    const publishList = Array.isArray(publish) ? publish : publish ? [publish] : [];
    const githubPublish = publishList.find(
      (item) =>
        item &&
        typeof item === "object" &&
        String(item.provider || "").trim().toLowerCase() === "github",
    );

    const owner =
      typeof githubPublish?.owner === "string" ? githubPublish.owner.trim() : "";
    const repo =
      typeof githubPublish?.repo === "string" ? githubPublish.repo.trim() : "";
    if (!owner || !repo) return { ...PACKAGED_AUTO_UPDATE_CONFIG };

    return {
      provider: "github",
      owner,
      repo,
      releaseType:
        typeof githubPublish?.releaseType === "string" && githubPublish.releaseType.trim()
          ? githubPublish.releaseType.trim()
          : "release",
    };
  } catch (error) {
    console.warn("[auto-update] Failed to read packaged update config:", error?.message || error);
    return { ...PACKAGED_AUTO_UPDATE_CONFIG };
  }
}

function getAutoUpdateDialogWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }

  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed()) return win;
  }

  return null;
}

function cloneAutoUpdateStatus() {
  return {
    status:
      autoUpdateStatus && typeof autoUpdateStatus.status === "string"
        ? autoUpdateStatus.status
        : "idle",
    version:
      autoUpdateStatus && typeof autoUpdateStatus.version === "string"
        ? autoUpdateStatus.version
        : null,
  };
}

function broadcastAutoUpdateStatus() {
  const payload = cloneAutoUpdateStatus();
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    win.webContents.send(ipcChannels.desktopAutoUpdateStatusChanged, payload);
  }
}

function setAutoUpdateStatus(status, version = null) {
  autoUpdateStatus = {
    status: typeof status === "string" && status ? status : "idle",
    version: typeof version === "string" && version.trim() ? version.trim() : null,
  };
  broadcastAutoUpdateStatus();
}

function stopAutoUpdatePolling() {
  if (autoUpdateTimer) {
    clearInterval(autoUpdateTimer);
    autoUpdateTimer = null;
  }
}

async function installDownloadedUpdate() {
  const updater = await ensureAutoUpdater();
  if (!updater) return false;
  if (!autoUpdater) return false;
  if (autoUpdateStatus?.status !== "downloaded") return false;

  autoUpdater.quitAndInstall();
  return true;
}

async function checkForAutoUpdates({ manual = false } = {}) {
  const updater = await ensureAutoUpdater();
  if (!updater) return null;
  if (!autoUpdater) return null;

  if (!isAutoUpdateConfigured) {
    setAutoUpdateStatus("disabled");
    if (manual) {
      const windowForDialog = getAutoUpdateDialogWindow();
      await dialog.showMessageBox(windowForDialog || undefined, {
        type: "info",
        title: "Conductor",
        message: "Auto update is not enabled in this build.",
        buttons: ["OK"],
        defaultId: 0,
        noLink: true,
      });
    }
    return null;
  }

  try {
    const result = await autoUpdater.checkForUpdates();
    if (manual && result && result.isUpdateAvailable === false) {
      const windowForDialog = getAutoUpdateDialogWindow();
      await dialog.showMessageBox(windowForDialog || undefined, {
        type: "info",
        title: "Conductor",
        message: "You are already using the latest version.",
        buttons: ["OK"],
        defaultId: 0,
        noLink: true,
      });
    }
    return result;
  } catch (error) {
    const message = error?.message || String(error);
    console.warn("[auto-update] Check failed:", message);
    setAutoUpdateStatus("error");

    if (manual) {
      const windowForDialog = getAutoUpdateDialogWindow();
      await dialog.showMessageBox(windowForDialog || undefined, {
        type: "error",
        title: "Conductor",
        message: "Update check failed.",
        detail: message,
        buttons: ["OK"],
        defaultId: 0,
        noLink: true,
      });
    }
    return null;
  }
}

async function setupAutoUpdates() {
  if (!app.isPackaged) return;
  if (!AUTO_UPDATE_SUPPORTED_PLATFORMS.has(process.platform)) {
    console.info("[auto-update] Skipped for unsupported platform:", process.platform);
    setAutoUpdateStatus("unsupported");
    return;
  }
  const updater = await ensureAutoUpdater();
  if (!updater) {
    console.warn("[auto-update] electron-updater dependency is missing.");
    setAutoUpdateStatus("disabled");
    return;
  }
  if (!autoUpdater) {
    console.warn("[auto-update] electron-updater dependency is missing.");
    setAutoUpdateStatus("disabled");
    return;
  }

  const feedUrl = resolveAutoUpdateFeedUrl();
  isAutoUpdateConfigured = true;
  autoUpdateConfiguredFeedUrl = feedUrl || "github-release";

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  if (feedUrl) {
    try {
      autoUpdater.setFeedURL({
        provider: "generic",
        url: feedUrl,
      });
      console.info(`[auto-update] Using custom generic feed URL: ${feedUrl}`);
    } catch (error) {
      isAutoUpdateConfigured = false;
      autoUpdateConfiguredFeedUrl = null;
      setAutoUpdateStatus("disabled");
      console.warn("[auto-update] Invalid custom feed URL:", error?.message || error);
      return;
    }
  } else {
    const packagedUpdateConfig = resolvePackagedAutoUpdateConfig();
    if (!packagedUpdateConfig) {
      isAutoUpdateConfigured = false;
      autoUpdateConfiguredFeedUrl = null;
      setAutoUpdateStatus("disabled");
      console.warn("[auto-update] Packaged updater provider configuration is missing.");
      return;
    }

    autoUpdater.setFeedURL(packagedUpdateConfig);
    autoUpdateConfiguredFeedUrl = `${packagedUpdateConfig.provider}:${packagedUpdateConfig.owner}/${packagedUpdateConfig.repo}`;
    console.info("[auto-update] Using packaged GitHub updater provider configuration.");
  }

  autoUpdater.on("checking-for-update", () => {
    setAutoUpdateStatus("checking");
    console.info("[auto-update] Checking for updates...");
  });

  autoUpdater.on("update-available", (info) => {
    setAutoUpdateStatus("available", info?.version || null);
    console.info(`[auto-update] Update ${info?.version || "unknown"} is available.`);
  });

  autoUpdater.on("update-not-available", (info) => {
    setAutoUpdateStatus("idle", info?.version || null);
    console.info(
      `[auto-update] No update available. Current=${app.getVersion()}, latest=${info?.version || "unknown"}.`,
    );
  });

  autoUpdater.on("error", (error) => {
    setAutoUpdateStatus("error");
    console.warn("[auto-update] Error:", error?.message || error);
  });

  autoUpdater.on("update-downloaded", (info) => {
    setAutoUpdateStatus("downloaded", info?.version || null);
    console.info(
      `[auto-update] Update ${info?.version || "unknown"} downloaded from ${autoUpdateConfiguredFeedUrl}.`,
    );
  });

  setTimeout(() => {
    void checkForAutoUpdates();
  }, AUTO_UPDATE_INITIAL_DELAY_MS);

  stopAutoUpdatePolling();
  autoUpdateTimer = setInterval(() => {
    void checkForAutoUpdates();
  }, AUTO_UPDATE_INTERVAL_MS);
}

function createSplashWindow() {
  const win = createBootSplashWindow({
    icon: resolveDesktopWindowIconPath(),
    logDesktopBoot,
  });

  splashWindow = win;
  win.on("closed", () => {
    if (splashWindow === win) {
      splashWindow = null;
    }
  });

  return win;
}

async function revealMainWindow(win) {
  if (!win || win.isDestroyed()) return;

  if (win.isMinimized()) {
    win.restore();
  }

  if (!mainWindowBootShown) {
    await showMainWindowAfterBoot(win);
    return;
  }

  if (!win.isVisible()) {
    win.show();
  }

  win.focus();
}

function showTrayHint() {
  if (!isWindows || !appTray) return;
  if (typeof appTray.displayBalloon !== "function") return;
  const settings = deviceAnalysisStore.getDeviceAnalysisSettings();
  if (settings?.trayMinimizeHintShown) return;

  appTray.displayBalloon({
    title: "Conductor",
    content: "应用仍在后台运行，可从系统托盘恢复或退出。",
    noSound: true,
  });
  deviceAnalysisStore.patchDeviceAnalysisSettings({
    trayMinimizeHintShown: true,
  });
}

function getWindowCloseBehaviorFromSettings() {
  const settings = deviceAnalysisStore.getDeviceAnalysisSettings();
  return settings?.windowCloseBehavior === "quit" ? "quit" : "minimizeToTray";
}

function shouldMinimizeToTrayOnWindowClose() {
  if (process.platform === "darwin") return false;
  return getWindowCloseBehaviorFromSettings() === "minimizeToTray";
}

function hideMainWindowToTray(win, options = { showTrayHint: false }) {
  if (!win || win.isDestroyed()) return;
  win.hide();
  if (options.showTrayHint === true) {
    showTrayHint();
  }
}

function updateTrayMenu() {
  if (!appTray) return;

  const hasVisibleWindow = Boolean(
    mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible(),
  );

  appTray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: hasVisibleWindow ? "隐藏窗口" : "显示窗口",
        click: () => {
          if (hasVisibleWindow) {
            hideMainWindowToTray(mainWindow);
            return;
          }
          void ensureMainWindowVisible();
        },
      },
      {
        label: "检查更新",
        click: () => {
          void checkForAutoUpdates({ manual: true });
        },
      },
      { type: "separator" },
      {
        label: "退出",
        click: () => {
          isAppQuitting = true;
          app.quit();
        },
      },
    ]),
  );
}

function createAppTray() {
  if (appTray) {
    updateTrayMenu();
    return appTray;
  }

  const trayIconPath = resolveTrayIconPath();
  if (!trayIconPath) {
    console.warn("[tray] Tray icon is unavailable.");
    return null;
  }

  appTray = new Tray(trayIconPath);
  appTray.setToolTip("Conductor");
  appTray.on("click", () => {
    void ensureMainWindowVisible();
  });
  appTray.on("double-click", () => {
    void ensureMainWindowVisible();
  });
  updateTrayMenu();
  return appTray;
}

async function ensureMainWindowVisible() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    await revealMainWindow(mainWindow);
    updateTrayMenu();
    return mainWindow;
  }

  if (!splashWindow || splashWindow.isDestroyed()) {
    createSplashWindow();
  }

  const win = createMainWindow();
  await revealMainWindow(win);
  updateTrayMenu();
  return win;
}

function createMainWindow() {
  logDesktopBoot("create-window:start");
  const windowIcon = resolveDesktopWindowIconPath();
  mainWindowBootShown = false;

  const win = new BrowserWindow({
    width: MAIN_WINDOW_BOUNDS.width,
    height: MAIN_WINDOW_BOUNDS.height,
    minWidth: MAIN_WINDOW_BOUNDS.minWidth,
    minHeight: MAIN_WINDOW_BOUNDS.minHeight,
    icon: windowIcon,
    backgroundColor: "#f5f4ef",
    autoHideMenuBar: true,
    center: true,
    frame: !isWindows,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      ...(isDev
        ? null
        : { v8CacheOptions: "bypassHeatCheckAndEagerCompile" }),
    },
  });

  if (process.platform !== "darwin") {
    win.removeMenu();
    win.setAutoHideMenuBar(true);
    win.setMenuBarVisibility(false);
  }

  win.on("system-context-menu", (event) => {
    event.preventDefault();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow = win;
  win.on("close", (event) => {
    if (isAppQuitting) return;
    if (process.platform === "darwin") return;
    if (!shouldMinimizeToTrayOnWindowClose()) return;

    event.preventDefault();
    hideMainWindowToTray(win, { showTrayHint: true });
    updateTrayMenu();
  });
  win.on("show", () => {
    updateTrayMenu();
  });
  win.on("hide", () => {
    updateTrayMenu();
  });
  win.on("minimize", () => {
    updateTrayMenu();
  });
  win.on("restore", () => {
    updateTrayMenu();
  });
  win.on("closed", () => {
    if (mainWindow === win) {
      mainWindow = null;
      mainWindowBootExpansionPromise = null;
    }
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }
  });

  win.webContents.once("dom-ready", () => {
    logDesktopBoot("window:dom-ready");
  });

  win.webContents.on("did-start-navigation", (_event, navigationUrl, isInPlace, isMainFrame) => {
    if (!isMainFrame) return;
    logDesktopBoot(
      "window:did-start-navigation",
      `(inPlace=${isInPlace} url=${navigationUrl})`,
    );
  });

  win.webContents.on("did-start-loading", () => {
    logDesktopBoot("window:did-start-loading");
  });

  win.webContents.once("did-finish-load", () => {
    logDesktopBoot("window:did-finish-load");
    setTimeout(() => {
      if (!win.isDestroyed() && !win.isVisible()) {
        logDesktopBoot(
          "renderer:boot-ui-ready:fallback",
          `(after=${BOOT_UI_READY_FALLBACK_MS}ms)`,
        );
        void showMainWindowAfterBoot(win);
      }
    }, BOOT_UI_READY_FALLBACK_MS);
  });

  win.webContents.once(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (!isMainFrame) return;
      logDesktopBoot(
        "window:did-fail-load",
        `(code=${errorCode} message=${errorDescription} url=${validatedUrl})`,
      );
      void showMainWindowAfterBoot(win);
    },
  );

  win.webContents.on("did-stop-loading", () => {
    logDesktopBoot("window:did-stop-loading");
  });

  win.webContents.on("console-message", (event) => {
    const message = typeof event.message === "string" ? event.message : "";
    if (typeof message !== "string" || !message.startsWith("[boot]")) return;
    const levelLabel =
      event.level === "warning"
        ? "warn"
        : event.level === "error"
          ? "error"
          : "info";
    const logger =
      levelLabel === "warn"
        ? console.warn
        : levelLabel === "error"
          ? console.error
          : console.info;
    logger(`[renderer-console] ${message}`);
  });

  if (isDev) {
    logDesktopBoot("load-url", `(dev: ${devUrl})`);
    void win.loadURL(devUrl);
    return win;
  }

  logDesktopBoot("load-file", "(prod: dist/desktop/workbench.html)");
  void win.loadFile(path.join(__dirname, "../dist/desktop/workbench.html"));
  return win;
}

async function showMainWindowAfterBoot(win) {
  if (!win || win.isDestroyed()) return;
  if (mainWindowBootShown) return;

  logDesktopBoot("main-window:show:start");
  await prepareStartupGate();
  if (win.isDestroyed()) return;
  if (mainWindowBootShown) return;

  if (!win.isVisible()) {
    win.show();
  }

  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
  splashWindow = null;

  if (!win.isFocused()) {
    win.focus();
  }
  mainWindowBootShown = true;
  await new Promise((resolve) => setTimeout(resolve, BOOT_WINDOW_SETTLE_MS));
  logDesktopBoot("main-window:show:done");
}

function handleDesktopBootUiReady(event, payload) {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed() || win !== mainWindow) {
    return null;
  }

  const source =
    payload && typeof payload.source === "string" ? payload.source : "unknown";
  logDesktopBoot("renderer:boot-ui-ready", `(source=${source})`);

  if (!mainWindowBootExpansionPromise) {
    mainWindowBootExpansionPromise = showMainWindowAfterBoot(win).finally(() => {
      mainWindowBootExpansionPromise = null;
    });
  }

  return mainWindowBootExpansionPromise;
}

function handleDesktopCommand(event, payload) {
  const command =
    payload && typeof payload.command === "string" ? payload.command : "";
  if (!command) return;

  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;

  if (command === "toggle-devtools") {
    if (win.webContents.isDevToolsOpened()) {
      win.webContents.closeDevTools();
      return;
    }
    win.webContents.openDevTools({ mode: "detach" });
    return;
  }

  if (command === "reload-window") {
    win.webContents.reload();
    return;
  }

  if (command === "minimize-window") {
    win.minimize();
    updateTrayMenu();
    return;
  }

  if (command === "toggle-maximize-window") {
    if (win.isMaximized()) {
      win.unmaximize();
      return;
    }
    win.maximize();
    return;
  }

  if (command === "check-for-updates") {
    void checkForAutoUpdates({ manual: true });
    return;
  }

  if (command === "install-downloaded-update") {
    void installDownloadedUpdate();
    return;
  }

  if (command === "close-window") {
    if (shouldMinimizeToTrayOnWindowClose()) {
      hideMainWindowToTray(win, { showTrayHint: true });
      updateTrayMenu();
      return;
    }

    isAppQuitting = true;
    app.quit();
  }
}

function handleDesktopAutoUpdateStatusGet(event) {
  event.returnValue = cloneAutoUpdateStatus();
}

app.whenReady().then(() => {
  logDesktopBoot("app:ready");
  if (isWindows) {
    app.setAppUserModelId(DESKTOP_APP_USER_MODEL_ID);
  }
  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
  }
  configureRuntimeCachePath();
  cleanupRustExcelJobRoot();
  ensureDeviceAnalysisDemoFiles();
  createAppTray();

  ipcMain.on("desktop-command", handleDesktopCommand);
  ipcMain.on(ipcChannels.desktopMetaGet, handleDesktopMetaGet);
  ipcMain.on(ipcChannels.desktopAutoUpdateStatusGet, handleDesktopAutoUpdateStatusGet);
  ipcMain.on(ipcChannels.desktopBootSettingsGet, handleDesktopBootSettingsGet);
  ipcMain.handle(ipcChannels.desktopBootUiReady, handleDesktopBootUiReady);
  ipcMain.handle(ipcChannels.templatesGet, handleDeviceAnalysisTemplatesGet);
  ipcMain.handle(ipcChannels.templatesCreate, handleDeviceAnalysisTemplatesCreate);
  ipcMain.handle(ipcChannels.templatesDelete, handleDeviceAnalysisTemplatesDelete);
  ipcMain.handle(ipcChannels.settingsGet, handleDeviceAnalysisSettingsGet);
  ipcMain.handle(ipcChannels.settingsPatch, handleDeviceAnalysisSettingsPatch);
  ipcMain.handle(ipcChannels.persistencePathGet, handleDeviceAnalysisPersistencePathGet);
  ipcMain.handle(ipcChannels.persistencePathSet, handleDeviceAnalysisPersistencePathSet);
  ipcMain.handle(ipcChannels.persistencePathChoose, handleDeviceAnalysisPersistencePathChoose);
  ipcMain.handle(ipcChannels.excelConvertRust, handleExcelConvertRust);
  ipcMain.handle(ipcChannels.excelReadConvertedCsv, handleExcelReadConvertedCsv);
  ipcMain.handle(ipcChannels.deviceAnalysisDemoFilesGet, handleDeviceAnalysisDemoFilesGet);
  ipcMain.handle(
    ipcChannels.deviceAnalysisRustEngineOpen,
    handleDeviceAnalysisRustEngineOpen,
  );
  ipcMain.handle(
    ipcChannels.deviceAnalysisRustEnginePreviewMeta,
    handleDeviceAnalysisRustEnginePreviewMeta,
  );
  ipcMain.handle(
    ipcChannels.deviceAnalysisRustEnginePreviewRows,
    handleDeviceAnalysisRustEnginePreviewRows,
  );
  ipcMain.handle(
    ipcChannels.deviceAnalysisRustEngineReadCell,
    handleDeviceAnalysisRustEngineReadCell,
  );
  ipcMain.handle(
    ipcChannels.deviceAnalysisRustEngineReadCells,
    handleDeviceAnalysisRustEngineReadCells,
  );
  ipcMain.handle(
    ipcChannels.deviceAnalysisRustEngineInferAutoExtraction,
    handleDeviceAnalysisRustEngineInferAutoExtraction,
  );
  ipcMain.handle(
    ipcChannels.deviceAnalysisRustEngineProcessFile,
    handleDeviceAnalysisRustEngineProcessFile,
  );
  ipcMain.handle(
    ipcChannels.deviceAnalysisRustEngineDispose,
    handleDeviceAnalysisRustEngineDispose,
  );
  ipcMain.handle(ipcChannels.originExeGet, handleOriginExeGet);
  ipcMain.handle(ipcChannels.originExeSet, handleOriginExeSet);
  ipcMain.handle(ipcChannels.originExePick, handleOriginExePick);
  ipcMain.handle(ipcChannels.originHealthCheck, handleOriginHealthCheck);
  ipcMain.handle(ipcChannels.originRunCsv, handleOriginRunCsv);
  ipcMain.handle(
    ipcChannels.originRuntimeCleanupRun,
    handleOriginRuntimeCleanupRun,
  );
  createSplashWindow();
  void prepareStartupGate();
  const window = createMainWindow();
  window.webContents.once("did-finish-load", () => {
    logDesktopBoot("post-load:auto-updates:init");
    void setupAutoUpdates();
  });

  app.on("activate", () => {
    void ensureMainWindowVisible();
  });
});

app.on("window-all-closed", () => {
  if (process.platform === "darwin") return;
  if (appTray && !isAppQuitting) return;
  app.quit();
});

app.on("will-quit", () => {
  isAppQuitting = true;
  stopAutoUpdatePolling();
  isAutoUpdateConfigured = false;
  autoUpdateConfiguredFeedUrl = null;
  cleanupRustExcelJobRoot();
  stopRustDeviceAnalysisProcessingEngines();
  if (appTray) {
    appTray.destroy();
    appTray = null;
  }
  ipcMain.removeListener("desktop-command", handleDesktopCommand);
  ipcMain.removeListener(ipcChannels.desktopMetaGet, handleDesktopMetaGet);
  ipcMain.removeListener(
    ipcChannels.desktopAutoUpdateStatusGet,
    handleDesktopAutoUpdateStatusGet,
  );
  ipcMain.removeListener(ipcChannels.desktopBootSettingsGet, handleDesktopBootSettingsGet);
  ipcMain.removeHandler(ipcChannels.desktopBootUiReady);
  ipcMain.removeHandler(ipcChannels.templatesGet);
  ipcMain.removeHandler(ipcChannels.templatesCreate);
  ipcMain.removeHandler(ipcChannels.templatesDelete);
  ipcMain.removeHandler(ipcChannels.settingsGet);
  ipcMain.removeHandler(ipcChannels.settingsPatch);
  ipcMain.removeHandler(ipcChannels.persistencePathGet);
  ipcMain.removeHandler(ipcChannels.persistencePathSet);
  ipcMain.removeHandler(ipcChannels.persistencePathChoose);
  ipcMain.removeHandler(ipcChannels.excelConvertRust);
  ipcMain.removeHandler(ipcChannels.excelReadConvertedCsv);
  ipcMain.removeHandler(ipcChannels.deviceAnalysisDemoFilesGet);
  ipcMain.removeHandler(ipcChannels.deviceAnalysisRustEngineOpen);
  ipcMain.removeHandler(ipcChannels.deviceAnalysisRustEnginePreviewMeta);
  ipcMain.removeHandler(ipcChannels.deviceAnalysisRustEnginePreviewRows);
  ipcMain.removeHandler(ipcChannels.deviceAnalysisRustEngineReadCell);
  ipcMain.removeHandler(ipcChannels.deviceAnalysisRustEngineReadCells);
  ipcMain.removeHandler(ipcChannels.deviceAnalysisRustEngineInferAutoExtraction);
  ipcMain.removeHandler(ipcChannels.deviceAnalysisRustEngineProcessFile);
  ipcMain.removeHandler(ipcChannels.deviceAnalysisRustEngineDispose);
  ipcMain.removeHandler(ipcChannels.originExeGet);
  ipcMain.removeHandler(ipcChannels.originExeSet);
  ipcMain.removeHandler(ipcChannels.originExePick);
  ipcMain.removeHandler(ipcChannels.originHealthCheck);
  ipcMain.removeHandler(ipcChannels.originRunCsv);
  ipcMain.removeHandler(ipcChannels.originRuntimeCleanupRun);
  stopRustDeviceAnalysisEngine();
});
