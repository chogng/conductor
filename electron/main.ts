import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import { createDeviceAnalysisStore } from "./device-analysis-store.js";
import {
  assertOriginExePath,
  detectOriginExecutablePath,
  normalizeOriginExePath,
  pickOriginExecutable,
  runOriginBatchJob,
  runOriginRuntimeCleanup,
  runOriginHealthCheck,
  runOriginZipJob,
  runOriginCsvJob,
} from "./origin-runner.js";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let autoUpdater = null;
try {
  ({ autoUpdater } = require("electron-updater"));
} catch (error) {
  console.warn("[auto-update] electron-updater is unavailable:", error?.message || error);
}

const isDev = !app.isPackaged;
const isWindows = process.platform === "win32";
const devUrl = process.env.ELECTRON_START_URL || "http://127.0.0.1:5174/";
const AUTO_UPDATE_INITIAL_DELAY_MS = 15 * 1000;
const AUTO_UPDATE_INTERVAL_MS = 4 * 60 * 60 * 1000;
const AUTO_UPDATE_SUPPORTED_PLATFORMS = new Set(["win32"]);
let mainWindow = null;
let autoUpdateTimer = null;
let autoUpdateConfiguredFeedUrl = null;
let isAutoUpdateConfigured = false;
let isUpdateDownloadedPromptVisible = false;

function getResourcesPath() {
  const resourcesPath = Reflect.get(process, "resourcesPath");
  return typeof resourcesPath === "string" ? resourcesPath : process.cwd();
}
function resolveOriginWorkerScriptPath() {
  if (!app.isPackaged) {
    return path.join(__dirname, "..", "origin", "run_origin_job.ps1");
  }

  const unpackedPath = path.join(
    getResourcesPath(),
    "app.asar.unpacked",
    "origin",
    "run_origin_job.ps1",
  );
  if (fs.existsSync(unpackedPath)) {
    return unpackedPath;
  }

  return path.join(
    getResourcesPath(),
    "app.asar",
    "origin",
    "run_origin_job.ps1",
  );
}

function resolveOriginBatchScriptPath() {
  if (!app.isPackaged) {
    return path.join(__dirname, "..", "origin", "run_origin_batch.py");
  }

  const unpackedPath = path.join(
    getResourcesPath(),
    "app.asar.unpacked",
    "origin",
    "run_origin_batch.py",
  );
  if (fs.existsSync(unpackedPath)) {
    return unpackedPath;
  }

  return path.join(
    getResourcesPath(),
    "app.asar",
    "origin",
    "run_origin_batch.py",
  );
}

function resolveOriginZipScriptPath() {
  if (!app.isPackaged) {
    return path.join(__dirname, "..", "origin", "run_origin_zip.py");
  }

  const unpackedPath = path.join(
    getResourcesPath(),
    "app.asar.unpacked",
    "origin",
    "run_origin_zip.py",
  );
  if (fs.existsSync(unpackedPath)) {
    return unpackedPath;
  }

  return path.join(
    getResourcesPath(),
    "app.asar",
    "origin",
    "run_origin_zip.py",
  );
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

function resolveOriginBatchWorkerPath() {
  const envPath = normalizeOriginExePath(process.env.ORIGIN_BATCH_WORKER_PATH);
  if (!app.isPackaged) {
    return resolveFirstExistingPath([
      envPath,
      path.join(__dirname, "..", "origin", "bin", "origin-batch-worker.exe"),
      path.join(__dirname, "..", "origin", "dist", "origin-batch-worker.exe"),
    ]);
  }

  return resolveFirstExistingPath([
    envPath,
    path.join(getResourcesPath(), "origin", "bin", "origin-batch-worker.exe"),
    path.join(
      getResourcesPath(),
      "app.asar.unpacked",
      "origin",
      "bin",
      "origin-batch-worker.exe",
    ),
  ]);
}

function resolveOriginZipWorkerPath() {
  const envPath = normalizeOriginExePath(process.env.ORIGIN_ZIP_WORKER_PATH);
  if (!app.isPackaged) {
    return resolveFirstExistingPath([
      envPath,
      path.join(__dirname, "..", "origin", "bin", "origin-zip-worker.exe"),
      path.join(__dirname, "..", "origin", "dist", "origin-zip-worker.exe"),
    ]);
  }

  return resolveFirstExistingPath([
    envPath,
    path.join(getResourcesPath(), "origin", "bin", "origin-zip-worker.exe"),
    path.join(
      getResourcesPath(),
      "app.asar.unpacked",
      "origin",
      "bin",
      "origin-zip-worker.exe",
    ),
  ]);
}

const ORIGIN_WORKER_SCRIPT_PATH = resolveOriginWorkerScriptPath();
const ORIGIN_BATCH_SCRIPT_PATH = resolveOriginBatchScriptPath();
const ORIGIN_ZIP_SCRIPT_PATH = resolveOriginZipScriptPath();
const ORIGIN_CSV_SCRIPT_PATH = resolveOriginCsvScriptPath();
const ORIGIN_BATCH_WORKER_PATH = resolveOriginBatchWorkerPath();
const ORIGIN_ZIP_WORKER_PATH = resolveOriginZipWorkerPath();

const ipcChannels = {
  templatesGet: "device-analysis-store:templates:get",
  templatesCreate: "device-analysis-store:templates:create",
  templatesDelete: "device-analysis-store:templates:delete",
  settingsGet: "device-analysis-store:settings:get",
  settingsPatch: "device-analysis-store:settings:patch",
  persistencePathGet: "device-analysis-store:persistence-path:get",
  persistencePathSet: "device-analysis-store:persistence-path:set",
  persistencePathChoose: "device-analysis-store:persistence-path:choose",
  originExeGet: "device-analysis-origin:exe:get",
  originExeSet: "device-analysis-origin:exe:set",
  originExePick: "device-analysis-origin:exe:pick",
  originHealthCheck: "device-analysis-origin:health-check",
  originRunBatch: "device-analysis-origin:run-batch",
  originRunZip: "device-analysis-origin:run-zip",
  originRunCsv: "device-analysis-origin:run-csv",
  originRuntimeCleanupRun: "device-analysis-origin:runtime-cleanup:run",
};

/** @typedef {{plotType: number, xyPairs: string, plotCommand: string, postPlotCommands: string[]}} OriginPlotOptions */
/**
 * @typedef {{
 *   import?: {workbookLongName?: string, preCommands?: string[], postCommands?: string[]},
 *   plot?: {command?: string, preCommands?: string[], postCommands?: string[]},
 *   graph?: {preCommands?: string[], postCommands?: string[]},
 *   style?: {commands?: string[]},
 *   axis?: {commands?: string[]},
 *   commands?: {preCommands?: string[], postCommands?: string[]},
 * }} OriginCapabilitiesOptions
 */
const DEFAULT_ORIGIN_PLOT_OPTIONS = Object.freeze(
  /** @type {OriginPlotOptions} */ ({
    plotType: 202,
    xyPairs: "((1,2))",
    plotCommand: "",
    postPlotCommands: [],
  }),
);

function normalizeNonEmptyString(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function normalizeBoundedInt(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(num)));
}

function normalizeOriginPostPlotCommands(value) {
  if (Array.isArray(value)) {
    const normalized = [];
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

function normalizeOriginCommandList(value) {
  return normalizeOriginPostPlotCommands(value);
}

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
    ["workbookLongName", "longName", "preCommands", "beforeCommands", "postCommands", "afterCommands"],
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
    ["commands", "postCommands"],
    "capabilities.axis",
  );
  const commandsSection = assertOriginCapabilitiesAllowedKeys(
    root.commands,
    ["preCommands", "beforeCommands", "postCommands", "afterCommands"],
    "capabilities.commands",
  );

  assertOriginCapabilitiesString(importSection.workbookLongName, "capabilities.import.workbookLongName");
  assertOriginCapabilitiesString(importSection.longName, "capabilities.import.longName");
  assertOriginCapabilitiesString(plotSection.command, "capabilities.plot.command");
  assertOriginCapabilitiesString(plotSection.plotCommand, "capabilities.plot.plotCommand");

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

  if (importWorkbookLongName || importPreCommands.length || importPostCommands.length) {
    normalized.import = {};
    if (importWorkbookLongName) normalized.import.workbookLongName = importWorkbookLongName;
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

  if (axisCommands.length) {
    normalized.axis = { commands: axisCommands };
  }

  if (globalPreCommands.length || globalPostCommands.length) {
    normalized.commands = {};
    if (globalPreCommands.length) normalized.commands.preCommands = globalPreCommands;
    if (globalPostCommands.length) normalized.commands.postCommands = globalPostCommands;
  }

  return Object.keys(normalized).length ? normalized : null;
}

/**
 * @param {unknown} rawOptions
 * @param {OriginPlotOptions} [fallbackOptions]
 * @returns {OriginPlotOptions}
 */
function normalizeOriginPlotOptions(rawOptions, fallbackOptions = undefined) {
  const raw = rawOptions && typeof rawOptions === "object" ? rawOptions : {};
  const fallbackBase = fallbackOptions ?? DEFAULT_ORIGIN_PLOT_OPTIONS;
  const fallback =
    fallbackBase && typeof fallbackBase === "object"
      ? {
          ...DEFAULT_ORIGIN_PLOT_OPTIONS,
          ...fallbackBase,
        }
      : DEFAULT_ORIGIN_PLOT_OPTIONS;

  const plotType = normalizeBoundedInt(raw.plotType ?? raw.type, fallback.plotType, 0, 9999);
  const xyPairs = normalizeNonEmptyString(raw.xyPairs, fallback.xyPairs);
  const plotCommand = normalizeNonEmptyString(
    raw.plotCommand ?? raw.command,
    fallback.plotCommand,
  );
  const postPlotCommands = normalizeOriginPostPlotCommands(
    Object.prototype.hasOwnProperty.call(raw, "postPlotCommands")
      ? raw.postPlotCommands
      : Object.prototype.hasOwnProperty.call(raw, "postCommands")
        ? raw.postCommands
        : fallback.postPlotCommands,
  );

  return {
    plotType,
    xyPairs,
    plotCommand,
    postPlotCommands,
  };
}

/**
 * @param {unknown} payload
 * @param {OriginPlotOptions} [plotDefaults]
 */
function normalizeOriginCsvPayload(payload, plotDefaults = undefined) {
  const raw = payload && typeof payload === "object" ? payload : {};
  const csv = raw.csv && typeof raw.csv === "object" ? raw.csv : {};
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
  const seriesName = normalizeNonEmptyString(raw.seriesName ?? sheet.longName, "");
  const normalizedPlot = normalizeOriginPlotOptions(
    {
      plotCommand: plot.command ?? plot.plotCommand ?? raw.plotCommand,
      plotType: plot.type ?? plot.plotType ?? raw.plotType,
      postPlotCommands: plot.postCommands ?? plot.postPlotCommands ?? raw.postPlotCommands,
      xyPairs: plot.xyPairs ?? raw.xyPairs,
    },
    resolvedPlotDefaults,
  );

  return {
    csvName,
    csvText,
    seriesName,
    capabilities,
    ...normalizedPlot,
  };
}

function getDeviceAnalysisHomeDir() {
  return path.join(app.getPath("home"), ".device");
}

const deviceAnalysisStore = createDeviceAnalysisStore({
  getHomeDir: getDeviceAnalysisHomeDir,
  normalizeOriginExePath,
  normalizeOriginPlotOptions,
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

function handleDeviceAnalysisSettingsPatch(_event, updates) {
  return deviceAnalysisStore.patchDeviceAnalysisSettings(updates);
}

function handleDeviceAnalysisPersistencePathGet() {
  return deviceAnalysisStore.getStorePersistenceInfo();
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
    title: "Select persistence file path",
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
    xyPairs: settings?.originPlotXyPairsDefault,
  });
}

async function tryRunOriginRuntimeCleanup({ force = false } = {}) {
  return runOriginRuntimeCleanup({
    runtimeRootDir: getDeviceAnalysisHomeDir(),
    policy: getOriginRuntimeCleanupPolicyFromSettings(),
    force,
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

  const detected = await detectOriginExecutablePath();
  if (detected) {
    return saveOriginExePathToSettings(detected);
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

  const detected = await detectOriginExecutablePath();
  if (detected) {
    return saveOriginExePathToSettings(detected);
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

  try {
    return await runOriginHealthCheck({
      originExePath,
      workerScriptPath: ORIGIN_WORKER_SCRIPT_PATH,
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

async function pickOriginBatchInputDir(event, defaultPath) {
  const win = BrowserWindow.fromWebContents(event.sender) ?? null;
  const result = await dialog.showOpenDialog(win || undefined, {
    title: "Select CSV folder for Origin batch",
    defaultPath: defaultPath || undefined,
    properties: ["openDirectory"],
  });

  if (result.canceled || !Array.isArray(result.filePaths) || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
}

async function resolveOriginBatchInputDir(event, payload) {
  const rawInputDir =
    payload &&
    typeof payload === "object" &&
    typeof payload.inputDir === "string" &&
    payload.inputDir.trim()
      ? payload.inputDir.trim()
      : null;

  if (rawInputDir) {
    return rawInputDir;
  }

  const allowPickInputDir = Boolean(
    payload && typeof payload === "object" && payload.allowPickInputDir,
  );
  if (!allowPickInputDir) {
    throw new Error("__ORIGIN_BATCH_INPUT_DIR_REQUIRED__");
  }

  const picked = await pickOriginBatchInputDir(event, app.getPath("documents"));
  if (!picked) {
    throw new Error("__ORIGIN_BATCH_INPUT_DIR_REQUIRED__");
  }
  return picked;
}

async function handleOriginRunBatch(event, payload) {
  if (!isWindows) {
    throw new Error("Origin integration is only available on Windows desktop.");
  }

  const inputDir = await resolveOriginBatchInputDir(event, payload);
  const plotOptions = normalizeOriginPlotOptions(
    payload && typeof payload === "object" ? payload.plot : null,
    getOriginPlotOptionsFromSettings(),
  );
  const originExePath = await resolveOriginExePath(event);
  if (!originExePath) {
    throw new Error("__ORIGIN_EXE_REQUIRED__");
  }

  try {
    return await runOriginBatchJob({
      inputDir,
      originExePath,
      batchScriptPath: ORIGIN_BATCH_SCRIPT_PATH,
      batchWorkerPath: ORIGIN_BATCH_WORKER_PATH,
      plotType: plotOptions.plotType,
      xyPairs: plotOptions.xyPairs,
      plotCommand: plotOptions.plotCommand,
      postPlotCommands: plotOptions.postPlotCommands,
      runtimeRootDir: getDeviceAnalysisHomeDir(),
    });
  } finally {
    try {
      await tryRunOriginRuntimeCleanup();
    } catch (cleanupError) {
      console.warn("[origin-cleanup] Batch cleanup failed:", cleanupError);
    }
  }
}

async function handleOriginRunZip(event, payload) {
  if (!isWindows) {
    throw new Error("Origin integration is only available on Windows desktop.");
  }

  const zipName =
    payload && typeof payload.zipName === "string"
      ? payload.zipName
      : "device_analysis_origin.zip";
  const bytes =
    payload && Object.prototype.hasOwnProperty.call(payload, "bytes")
      ? payload.bytes
      : null;
  const plotOptions = normalizeOriginPlotOptions(
    payload && typeof payload === "object" ? payload.plot : null,
    getOriginPlotOptionsFromSettings(),
  );
  const capabilities = normalizeOriginCapabilitiesPayload(
    payload && typeof payload === "object"
      ? payload.capabilities ?? payload.originCapabilities
      : null,
  );

  if (!bytes) {
    throw new Error("ZIP payload is missing.");
  }

  const originExePath = await resolveOriginExePath(event);
  if (!originExePath) {
    throw new Error("__ORIGIN_EXE_REQUIRED__");
  }

  try {
    return await runOriginZipJob({
      zipName,
      bytes,
      originExePath,
      workerScriptPath: ORIGIN_ZIP_SCRIPT_PATH,
      workerExecutablePath: ORIGIN_ZIP_WORKER_PATH,
      plotType: plotOptions.plotType,
      xyPairs: plotOptions.xyPairs,
      plotCommand: plotOptions.plotCommand,
      postPlotCommands: plotOptions.postPlotCommands,
      capabilities,
      runtimeRootDir: getDeviceAnalysisHomeDir(),
    });
  } finally {
    try {
      await tryRunOriginRuntimeCleanup();
    } catch (cleanupError) {
      console.warn("[origin-cleanup] ZIP cleanup failed:", cleanupError);
    }
  }
}

async function handleOriginRunCsv(event, payload) {
  if (!isWindows) {
    throw new Error("Origin integration is only available on Windows desktop.");
  }

  const normalizedPayload = normalizeOriginCsvPayload(
    payload,
    getOriginPlotOptionsFromSettings(),
  );
  const {
    csvName,
    csvText,
    seriesName,
    plotType,
    xyPairs,
    plotCommand,
    postPlotCommands,
    capabilities,
  } =
    normalizedPayload;

  if (!csvText.trim()) {
    throw new Error("CSV payload is missing.");
  }

  const originExePath = await resolveOriginExePath(event);
  if (!originExePath) {
    throw new Error("__ORIGIN_EXE_REQUIRED__");
  }

  try {
    return await runOriginCsvJob({
      csvName,
      csvText,
      seriesName,
      plotType,
      xyPairs,
      plotCommand,
      postPlotCommands,
      capabilities,
      originExePath,
      workerScriptPath: ORIGIN_CSV_SCRIPT_PATH,
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

  return tryRunOriginRuntimeCleanup({ force: true });
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
    process.env.DEVICE_ANALYSIS_UPDATE_URL || process.env.APP_UPDATE_URL || null,
  );
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

function stopAutoUpdatePolling() {
  if (autoUpdateTimer) {
    clearInterval(autoUpdateTimer);
    autoUpdateTimer = null;
  }
}

async function promptInstallDownloadedUpdate(updateInfo) {
  if (!autoUpdater) return;
  if (isUpdateDownloadedPromptVisible) return;

  isUpdateDownloadedPromptVisible = true;
  try {
    const windowForDialog = getAutoUpdateDialogWindow();
    const result = await dialog.showMessageBox(windowForDialog || undefined, {
      type: "info",
      title: "Device Analysis Studio",
      message: "An update has been downloaded.",
      detail: `Version ${updateInfo?.version || "unknown"} is ready to install.`,
      buttons: ["Restart and Install", "Later"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });

    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  } finally {
    isUpdateDownloadedPromptVisible = false;
  }
}

async function checkForAutoUpdates({ manual = false } = {}) {
  if (!autoUpdater) return null;

  if (!isAutoUpdateConfigured) {
    if (manual) {
      const windowForDialog = getAutoUpdateDialogWindow();
      await dialog.showMessageBox(windowForDialog || undefined, {
        type: "info",
        title: "Device Analysis Studio",
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
        title: "Device Analysis Studio",
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

    if (manual) {
      const windowForDialog = getAutoUpdateDialogWindow();
      await dialog.showMessageBox(windowForDialog || undefined, {
        type: "error",
        title: "Device Analysis Studio",
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

function setupAutoUpdates() {
  if (!app.isPackaged) return;
  if (!AUTO_UPDATE_SUPPORTED_PLATFORMS.has(process.platform)) {
    console.info("[auto-update] Skipped for unsupported platform:", process.platform);
    return;
  }
  if (!autoUpdater) {
    console.warn("[auto-update] electron-updater dependency is missing.");
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
      console.warn("[auto-update] Invalid custom feed URL:", error?.message || error);
      return;
    }
  } else {
    console.info("[auto-update] Using packaged updater provider configuration.");
  }

  autoUpdater.on("checking-for-update", () => {
    console.info("[auto-update] Checking for updates...");
  });

  autoUpdater.on("update-available", (info) => {
    console.info(`[auto-update] Update ${info?.version || "unknown"} is available.`);
  });

  autoUpdater.on("update-not-available", (info) => {
    console.info(
      `[auto-update] No update available. Current=${app.getVersion()}, latest=${info?.version || "unknown"}.`,
    );
  });

  autoUpdater.on("error", (error) => {
    console.warn("[auto-update] Error:", error?.message || error);
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.info(
      `[auto-update] Update ${info?.version || "unknown"} downloaded from ${autoUpdateConfiguredFeedUrl}.`,
    );
    void promptInstallDownloadedUpdate(info);
  });

  setTimeout(() => {
    void checkForAutoUpdates();
  }, AUTO_UPDATE_INITIAL_DELAY_MS);

  stopAutoUpdatePolling();
  autoUpdateTimer = setInterval(() => {
    void checkForAutoUpdates();
  }, AUTO_UPDATE_INTERVAL_MS);
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 700,
    autoHideMenuBar: true,
    frame: !isWindows,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.platform !== "darwin") {
    win.removeMenu();
    win.setAutoHideMenuBar(true);
    win.setMenuBarVisibility(false);
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow = win;
  win.on("closed", () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  if (isDev) {
    void win.loadURL(devUrl);
    return win;
  }

  void win.loadFile(path.join(__dirname, "../dist/index.html"));
  return win;
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

  if (command === "close-window") {
    win.close();
  }
}

app.whenReady().then(() => {
  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
  }
  configureRuntimeCachePath();

  ipcMain.on("desktop-command", handleDesktopCommand);
  ipcMain.handle(ipcChannels.templatesGet, handleDeviceAnalysisTemplatesGet);
  ipcMain.handle(ipcChannels.templatesCreate, handleDeviceAnalysisTemplatesCreate);
  ipcMain.handle(ipcChannels.templatesDelete, handleDeviceAnalysisTemplatesDelete);
  ipcMain.handle(ipcChannels.settingsGet, handleDeviceAnalysisSettingsGet);
  ipcMain.handle(ipcChannels.settingsPatch, handleDeviceAnalysisSettingsPatch);
  ipcMain.handle(ipcChannels.persistencePathGet, handleDeviceAnalysisPersistencePathGet);
  ipcMain.handle(ipcChannels.persistencePathSet, handleDeviceAnalysisPersistencePathSet);
  ipcMain.handle(ipcChannels.persistencePathChoose, handleDeviceAnalysisPersistencePathChoose);
  ipcMain.handle(ipcChannels.originExeGet, handleOriginExeGet);
  ipcMain.handle(ipcChannels.originExeSet, handleOriginExeSet);
  ipcMain.handle(ipcChannels.originExePick, handleOriginExePick);
  ipcMain.handle(ipcChannels.originHealthCheck, handleOriginHealthCheck);
  ipcMain.handle(ipcChannels.originRunBatch, handleOriginRunBatch);
  ipcMain.handle(ipcChannels.originRunZip, handleOriginRunZip);
  ipcMain.handle(ipcChannels.originRunCsv, handleOriginRunCsv);
  ipcMain.handle(
    ipcChannels.originRuntimeCleanupRun,
    handleOriginRuntimeCleanupRun,
  );
  createMainWindow();
  setupAutoUpdates();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  stopAutoUpdatePolling();
  isAutoUpdateConfigured = false;
  autoUpdateConfiguredFeedUrl = null;
  ipcMain.removeListener("desktop-command", handleDesktopCommand);
  ipcMain.removeHandler(ipcChannels.templatesGet);
  ipcMain.removeHandler(ipcChannels.templatesCreate);
  ipcMain.removeHandler(ipcChannels.templatesDelete);
  ipcMain.removeHandler(ipcChannels.settingsGet);
  ipcMain.removeHandler(ipcChannels.settingsPatch);
  ipcMain.removeHandler(ipcChannels.persistencePathGet);
  ipcMain.removeHandler(ipcChannels.persistencePathSet);
  ipcMain.removeHandler(ipcChannels.persistencePathChoose);
  ipcMain.removeHandler(ipcChannels.originExeGet);
  ipcMain.removeHandler(ipcChannels.originExeSet);
  ipcMain.removeHandler(ipcChannels.originExePick);
  ipcMain.removeHandler(ipcChannels.originHealthCheck);
  ipcMain.removeHandler(ipcChannels.originRunBatch);
  ipcMain.removeHandler(ipcChannels.originRunZip);
  ipcMain.removeHandler(ipcChannels.originRunCsv);
  ipcMain.removeHandler(ipcChannels.originRuntimeCleanupRun);
});


