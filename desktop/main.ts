import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
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
import type { OriginPlotOptions } from "./origin-plot-options.js";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let autoUpdater = null;
let originRunnerModulePromise = null;

const isDev = !app.isPackaged;
const isWindows = process.platform === "win32";
const DESKTOP_BOOTSTRAP_ARG_PREFIX = "--conductor-bootstrap=";
const devUrl =
  process.env.ELECTRON_START_URL ||
  "http://127.0.0.1:5174/desktop/workbench.html";
const AUTO_UPDATE_INITIAL_DELAY_MS = 15 * 1000;
const AUTO_UPDATE_INTERVAL_MS = 4 * 60 * 60 * 1000;
const AUTO_UPDATE_SUPPORTED_PLATFORMS = new Set(["win32"]);
let mainWindow = null;
let autoUpdateTimer = null;
let autoUpdateConfiguredFeedUrl = null;
let isAutoUpdateConfigured = false;
let isUpdateDownloadedPromptVisible = false;
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
    return resolveFirstExistingPath([
      envPath,
      path.join(__dirname, "..", "origin", "bin", "origin-csv-worker.exe"),
      path.join(__dirname, "..", "origin", "dist", "origin-csv-worker.exe"),
    ]);
  }

  return resolveFirstExistingPath([
    envPath,
    path.join(getResourcesPath(), "origin", "bin", "origin-csv-worker.exe"),
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
 *   import?: {workbookLongName?: string, preCommands?: string[], postCommands?: string[]},
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

function getDeviceAnalysisHomeDir() {
  return path.join(app.getPath("home"), ".device");
}

const deviceAnalysisStore = createDeviceAnalysisStore({
  getHomeDir: getDeviceAnalysisHomeDir,
});

function buildDesktopBootstrapArgument() {
  try {
    const payload = {
      initialDeviceAnalysisSettings:
        deviceAnalysisStore.getDeviceAnalysisSettings(),
    };

    return (
      DESKTOP_BOOTSTRAP_ARG_PREFIX +
      encodeURIComponent(JSON.stringify(payload))
    );
  } catch (error) {
    console.warn(
      "[bootstrap] Failed to serialize initial device analysis settings:",
      error?.message || error,
    );
    return null;
  }
}

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

  const { detectOriginExecutablePathDetailed } = await loadOriginRunnerModule();
  const detectResult = await detectOriginExecutablePathDetailed();
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

  const { detectOriginExecutablePathDetailed } = await loadOriginRunnerModule();
  const detectResult = await detectOriginExecutablePathDetailed();
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

  const normalizedPayload = normalizeOriginCsvPayload(
    payload,
    getOriginPlotOptionsFromSettings(),
  );
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

  const originExePath = await resolveOriginExePath(event);
  if (!originExePath) {
    throw new Error("__ORIGIN_EXE_REQUIRED__");
  }

  const { runOriginCsvJob } = await loadOriginRunnerModule();

  try {
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
  const updater = await ensureAutoUpdater();
  if (!updater) return;
  if (!autoUpdater) return;
  if (isUpdateDownloadedPromptVisible) return;

  isUpdateDownloadedPromptVisible = true;
  try {
    const windowForDialog = getAutoUpdateDialogWindow();
    const result = await dialog.showMessageBox(windowForDialog || undefined, {
      type: "info",
      title: "conductor",
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
  const updater = await ensureAutoUpdater();
  if (!updater) return null;
  if (!autoUpdater) return null;

  if (!isAutoUpdateConfigured) {
    if (manual) {
      const windowForDialog = getAutoUpdateDialogWindow();
      await dialog.showMessageBox(windowForDialog || undefined, {
        type: "info",
        title: "conductor",
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
        title: "conductor",
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
        title: "conductor",
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
    return;
  }
  const updater = await ensureAutoUpdater();
  if (!updater) {
    console.warn("[auto-update] electron-updater dependency is missing.");
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
  const bootstrapArgument = buildDesktopBootstrapArgument();
  logDesktopBoot("create-window:start");

  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: "#f5f4ef",
    autoHideMenuBar: true,
    frame: !isWindows,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: bootstrapArgument ? [bootstrapArgument] : [],
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
  win.on("closed", () => {
    if (mainWindow === win) {
      mainWindow = null;
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
  });

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
  logDesktopBoot("app:ready");
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
  ipcMain.handle(ipcChannels.originRunCsv, handleOriginRunCsv);
  ipcMain.handle(
    ipcChannels.originRuntimeCleanupRun,
    handleOriginRuntimeCleanupRun,
  );
  const window = createMainWindow();
  window.webContents.once("did-finish-load", () => {
    logDesktopBoot("post-load:auto-updates:init");
    void setupAutoUpdates();
  });

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
  ipcMain.removeHandler(ipcChannels.originRunCsv);
  ipcMain.removeHandler(ipcChannels.originRuntimeCleanupRun);
});
