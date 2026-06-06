import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  shell,
  Tray,
} from "electron";
import { product } from "../../../bootstrap-meta.js";
import { Server as ElectronIPCServer } from "../../base/parts/ipc/electron-main/ipc.electron.js";
import {
  applyWindowThemeSnapshot,
  getCurrentBootThemeSnapshot,
} from "../../platform/windows/electron-main/windowImpl.js";
import { defaultBrowserWindowOptions } from "../../platform/windows/electron-main/windows.js";
import { createAnalysisStorageMainService } from "../../workbench/services/storage/electron-main/analysisStorageMainService.js";
import {
  assertOriginExePath,
  normalizeOriginExePath,
} from "../../../../desktop/origin-runner/core.js";
import { workbenchIpcChannels as ipcChannels } from "../../workbench/common/ipcChannels.js";
import {
  DEFAULT_ORIGIN_PLOT_OPTIONS,
  normalizeNonEmptyString,
  normalizeOriginCommandList,
  normalizeOriginPlotOptions,
} from "../../../../desktop/origin-plot-options.js";
import {
  runSharedProcessShutdownContributions,
  runSharedProcessStartupContributions,
} from "../electron-utility/sharedProcess/sharedProcessMain.js";
import { Win32UpdateService } from "../../platform/update/electron-main/updateService.win32.js";
import { DialogMainService } from "../../platform/dialogs/electron-main/dialogMainService.js";
import { NativeHostMainService } from "../../platform/native/electron-main/nativeHostMainService.js";
import { registerContextMenuListener } from "../../base/parts/contextmenu/electron-main/contextmenu.js";
import { workbenchBootstrapIpcChannels } from "../../base/parts/sandbox/common/sandboxTypes.js";
import {
  nativeHostIpcChannels,
  nativeWindowCommands,
} from "../../platform/native/common/nativeIpc.js";
import {
  resolveRustWorkerExecutablePath,
  RustWorkerRuntime,
} from "../../platform/rust/electron-main/rustWorkerRuntime.js";
import { DiskFileSystemProviderChannel } from "../../platform/files/electron-main/diskFileSystemProviderServer.js";
import { LOCAL_FILE_SYSTEM_CHANNEL_NAME } from "../../platform/files/common/files.js";
import { DiskFileSystemProvider } from "../../platform/files/node/diskFileSystemProvider.js";
import { registerAnalysisRustHandlers } from "./analysisRustMain.js";
import { RustAnalysisService } from "./rustAnalysisService.js";
import { HelpWindowMainService } from "../../workbench/contrib/help/electron-main/helpWindowMainService.js";
import {
  normalizeHelpWindowKind,
} from "../../workbench/contrib/help/common/helpWindow.js";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// app.ts is compiled to desktop-dist/src/cs/code/electron-main, while preload
// and legacy desktop helper modules are still emitted under desktop-dist/desktop.
const desktopRuntimeDir = path.resolve(__dirname, "../../../../desktop");

// Native desktop application body, equivalent in role to VS Code's code/electron-main/app.ts.
// Keep BrowserWindow, IPC registration, updater, tray, and local worker lifecycle here until a
// dedicated shared process takes over the long-running background services.
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

let originRunnerModulePromise = null;

function getMainLanguage() {
  try {
    const language = analysisStore?.getAnalysisSettings?.()?.language;
    return language === "zh" ? "zh" : "en";
  } catch {
    return "en";
  }
}

function mainMessage(key, vars = {}) {
  const language = getMainLanguage();
  const messages = MAIN_MESSAGES[language] || MAIN_MESSAGES.en;
  const template = messages[key] || MAIN_MESSAGES.en[key] || key;
  return Object.entries(vars).reduce(
    (value, [name, replacement]) =>
      value.replaceAll(`{${name}}`, String(replacement ?? "")),
    template,
  );
}

const isDev = !app.isPackaged;
const isWindows = process.platform === "win32";
// The desktop renderer follows VS Code's code/electron-browser/workbench entry shape.
// Main stays responsible for native windows, IPC, updater, tray, and worker processes.
const devUrl =
  process.env.ELECTRON_START_URL ||
  "http://127.0.0.1:5174/src/cs/code/electron-browser/workbench/workbench.html";
const isWindowsStorePackage =
  process.platform === "win32" && Reflect.get(process, "windowsStore") === true;
const APP_DISPLAY_NAME = product.nameLong;
const APP_USER_MODEL_ID = product.appId;

const MAIN_MESSAGES = {
  en: {
    "dialog.allFiles": "All Files",
    "dialog.confirm": "Confirm",
    "dialog.save": "Save",
    "help.windowGuideTitle": "Conductor Studio User Guide",
    "help.windowUpdateLogTitle": "Conductor Studio Update Log",
    "originCsv.saveDialogTitle": "Save Origin CSV ZIP",
    "originCsv.zipFilter": "ZIP",
    "settings.selectUserConfigDialogTitle": "Select user config file path",
    "tray.backgroundContinueMessage": "The app is still running in the background. You can restore or quit it from the system tray.",
    "tray.checkForUpdates": "Check for Updates",
    "tray.hideWindow": "Hide Window",
    "tray.quit": "Quit",
    "tray.showWindow": "Show Window",
    "update.alreadyLatest": "You are already using the latest version.",
    "update.checkFailedDetail": "{reason}\n\nPlease check your network or proxy settings and try again.",
    "update.checkFailedMessage": "Update check failed",
    "update.disabledDevelopment": "Auto update is disabled in development.",
    "update.errorReasonPrefix": "Reason: {message}",
    "update.failed": "Auto update failed.",
    "update.notEnabled": "Auto update is not enabled in this build.",
    "update.ok": "OK",
    "update.retrySuggestion": "Please try again later, or confirm that the current network can access the update server.",
    "update.storeManagedDetail": "This package comes from Microsoft Store. The Store checks, downloads, verifies, and installs updates. You can also check for updates manually from the Microsoft Store library page.",
    "update.storeManagedMessage": "Updates are managed by Microsoft Store.",
    "update.unsupportedWindowsOnly": "Auto update is Windows-only.",
  },
  zh: {
    "dialog.allFiles": "所有文件",
    "dialog.confirm": "确定",
    "dialog.save": "保存",
    "help.windowGuideTitle": "Conductor Studio 用户指南",
    "help.windowUpdateLogTitle": "Conductor Studio 更新日志",
    "originCsv.saveDialogTitle": "保存 Origin CSV ZIP",
    "originCsv.zipFilter": "ZIP",
    "settings.selectUserConfigDialogTitle": "选择用户配置文件路径",
    "tray.backgroundContinueMessage": "应用仍在后台运行，可从系统托盘恢复或退出。",
    "tray.checkForUpdates": "检查更新",
    "tray.hideWindow": "隐藏窗口",
    "tray.quit": "退出",
    "tray.showWindow": "显示窗口",
    "update.alreadyLatest": "当前已是最新版本。",
    "update.checkFailedDetail": "{reason}\n\n请确认网络或代理设置后重试。",
    "update.checkFailedMessage": "检查更新失败",
    "update.disabledDevelopment": "开发环境已禁用自动更新。",
    "update.errorReasonPrefix": "原因：{message}",
    "update.failed": "自动更新失败。",
    "update.notEnabled": "当前构建未启用自动更新。",
    "update.ok": "确定",
    "update.retrySuggestion": "请稍后重试，或确认当前网络可以访问更新服务器。",
    "update.storeManagedDetail": "当前安装包来自 Microsoft Store。商店会负责检查、下载、校验和安装更新；也可以在 Microsoft Store 的库页面手动检查更新。",
    "update.storeManagedMessage": "更新由 Microsoft Store 管理",
    "update.unsupportedWindowsOnly": "自动更新仅支持 Windows。",
  },
};
const DEFAULT_WORKBENCH_BACKGROUND_COLOR = "#f3f4f6";
const WORKBENCH_BACKGROUND_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const DEMO_FILE_NAMES = [
  "demo-01.csv",
  "demo-02.csv",
  "demo-03.csv",
  "demo-04.csv",
  "demo-05.csv",
  "demo-06.csv",
];
const ORIGIN_DETECTION_CACHE_TTL_MS = 60 * 1000;
const BOOT_WINDOW_SETTLE_MS = 80;
const BOOT_UI_READY_FALLBACK_MS = 3500;
const RUST_PROCESSING_POOL_SIZE = Math.max(
  1,
  Math.min(
    4,
    Number(process.env.CONDUCTOR_RUST_PROCESSING_POOL_SIZE) || 2,
  ),
);
const rustWorkerRuntime = new RustWorkerRuntime({
  isWindows,
  processingPoolSize: RUST_PROCESSING_POOL_SIZE,
  resolveExecutablePath: () => resolveRustWorkerExecutablePath({
    desktopRuntimeDir,
    env: process.env,
    isDev,
    platform: process.platform,
    resourcesPath: getResourcesPath(),
  }),
});
const mainProcessServer = new ElectronIPCServer();
const localFileSystemProvider = new DiskFileSystemProvider();
const dialogMainService = new DialogMainService();
const nativeHostMainService = new NativeHostMainService(dialogMainService);
let mainWindow = null;
let appTray = null;
let analysisRustHandlers = null;
let mainWindowBootExpansionPromise = null;
let mainWindowBootShown = false;
let startupGatePromise = null;
let updateService: Win32UpdateService | null = null;
let helpWindowMainService: HelpWindowMainService | null = null;
let isAppQuitting = false;
let originDetectionCache = null;
let originDetectionPromise = null;
const desktopProcessStartMs = Date.now();

function isTruthyEnvFlag(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on"
  );
}

function isDesktopBootProfileEnabled() {
  return isTruthyEnvFlag(process.env.CONDUCTOR_BOOT_PROFILE);
}

function logDesktopBoot(stage, extra = "") {
  const elapsedMs = Date.now() - desktopProcessStartMs;
  const suffix = extra ? ` ${extra}` : "";
  const message = `[boot][main] +${elapsedMs}ms ${stage}${suffix}`;
  if (isDesktopBootProfileEnabled()) {
    console.info(message);
  }
  appendDesktopDiagnosticLog(message);
}

function appendDesktopDiagnosticLog(message) {
  const timestamp = new Date().toISOString();
  const line = `${timestamp} ${message}\n`;
  const candidateDirs = [
    path.join(process.cwd(), ".device"),
  ];

  try {
    if (app?.isReady?.()) {
      candidateDirs.push(app.getPath("userData"));
    }
  } catch {
    // Ignore logging path failures.
  }

  for (const dir of candidateDirs) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(path.join(dir, "desktop-renderer.log"), line, "utf8");
    } catch {
      // Logging must never block app startup.
    }
  }
}

function formatDiagnosticValue(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getThemeSnapshotFromStore() {
  const settings = analysisStore.getAnalysisSettings();
  return getCurrentBootThemeSnapshot(settings?.theme);
}

function syncBootWindowTheme() {
  const snapshot = getThemeSnapshotFromStore();
  applyWindowThemeSnapshot(mainWindow, snapshot);
  applyDesktopAppearanceToWindow(mainWindow, getAppearanceFromStore());
  helpWindowMainService?.applyTheme(snapshot);
  return snapshot;
}

function normalizeWorkbenchBackgroundColor(value) {
  if (typeof value !== "string") {
    return DEFAULT_WORKBENCH_BACKGROUND_COLOR;
  }

  const normalized = value.trim();
  return WORKBENCH_BACKGROUND_COLOR_PATTERN.test(normalized)
    ? normalized.toLowerCase()
    : DEFAULT_WORKBENCH_BACKGROUND_COLOR;
}

function getAppearanceFromStore() {
  const settings = analysisStore.getAnalysisSettings();
  return {
    backgroundColor: normalizeWorkbenchBackgroundColor(settings?.backgroundColor),
    transparentChrome: settings?.transparentChrome === true,
  };
}

function applyDesktopAppearanceToWindow(win, appearance) {
  if (!win || win.isDestroyed()) return;

  const backgroundColor = normalizeWorkbenchBackgroundColor(appearance?.backgroundColor);
  const transparentChrome = appearance?.transparentChrome === true;
  const canSetMaterial =
    process.platform === "win32" &&
    typeof win.setBackgroundMaterial === "function";

  if (canSetMaterial) {
    try {
      win.setBackgroundMaterial(transparentChrome ? "mica" : "none");
    } catch {
      // Native material is best-effort; CSS transparency remains available.
    }
  }

  win.setBackgroundColor(transparentChrome ? "#00000000" : backgroundColor);
}

function logDesktopDiagnostic(stage: string, payload: unknown = "") {
  const normalizedPayload =
    typeof payload === "string" ? payload : formatDiagnosticValue(payload);
  const message = `[desktop-diagnostic] ${stage}${
    normalizedPayload ? ` ${normalizedPayload}` : ""
  }`;
  if (isDesktopBootProfileEnabled()) {
    console.info(message);
  }
  appendDesktopDiagnosticLog(message);
}

const loadOriginRunnerModule = async () => {
  if (!originRunnerModulePromise) {
    originRunnerModulePromise = import("../../../../desktop/origin-runner.js");
  }

  return originRunnerModulePromise;
};

function getResourcesPath() {
  if (!app.isPackaged) {
    return app.getAppPath();
  }
  const resourcesPath = Reflect.get(process, "resourcesPath");
  return typeof resourcesPath === "string" ? resourcesPath : process.cwd();
}

function getAppRootPath() {
  return app.getAppPath();
}

function resolveDesktopWindowIconPath() {
  const iconFileName =
    process.platform === "win32"
      ? "icon-150.png"
      : process.platform === "darwin"
        ? "icon.icns"
        : "icon.png";

  const resourcesPath = getResourcesPath();
  const candidates = app.isPackaged
    ? [
        path.join(resourcesPath, "build", "icons", iconFileName),
        path.join(resourcesPath, "app.asar.unpacked", "build", "icons", iconFileName),
      ]
    : [path.join(resourcesPath, "build", "icons", iconFileName)];

  return resolveFirstExistingPath(candidates) ?? undefined;
}

function resolveTrayIconPath() {
  const iconFileName =
    process.platform === "win32"
      ? "icon.ico"
      : process.platform === "darwin"
        ? "icon.icns"
        : "icon.png";

  const resourcesPath = getResourcesPath();
  const candidates = app.isPackaged
    ? [
        path.join(resourcesPath, "build", "icons", iconFileName),
        path.join(resourcesPath, "app.asar.unpacked", "build", "icons", iconFileName),
      ]
    : [path.join(resourcesPath, "build", "icons", iconFileName)];

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
    return path.join(getAppRootPath(), "conductor-py", "run_origin_csv.py");
  }

  const unpackedPath = path.join(
    getResourcesPath(),
    "app.asar.unpacked",
    "conductor-py",
    "run_origin_csv.py",
  );
  if (fs.existsSync(unpackedPath)) {
    return unpackedPath;
  }

  return path.join(
    getResourcesPath(),
    "app.asar",
    "conductor-py",
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
      "workers",
      "py",
      "origin-csv-worker",
      "origin-csv-worker.exe",
    ),
    path.join(getResourcesPath(), "workers", "py", "origin-csv-worker.exe"),
    path.join(
      getResourcesPath(),
      "app.asar.unpacked",
      "workers",
      "py",
      "origin-csv-worker",
      "origin-csv-worker.exe",
    ),
    path.join(
      getResourcesPath(),
      "app.asar.unpacked",
      "workers",
      "py",
      "origin-csv-worker.exe",
    ),
  ]);
}

const ORIGIN_CSV_SCRIPT_PATH = isDev ? resolveOriginCsvScriptPath() : null;
const ORIGIN_CSV_WORKER_PATH = resolveOriginCsvWorkerPath();

/**
 * @typedef {{
 *   import?: {workbookLongName?: string, columnLabels?: {longNames?: string[], units?: string[], comments?: string[], designations?: string[]}, preCommands?: string[], postCommands?: string[]},
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
    ["longNames", "units", "comments", "designations"],
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
  assertOriginCapabilitiesStringList(importColumnLabels.comments, "capabilities.import.columnLabels.comments");
  assertOriginCapabilitiesStringList(importColumnLabels.designations, "capabilities.import.columnLabels.designations");
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
  const importColumnComments = Array.isArray(importColumnLabelsRaw.comments)
    ? importColumnLabelsRaw.comments
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
    : [];
  const importColumnDesignations = Array.isArray(importColumnLabelsRaw.designations)
    ? importColumnLabelsRaw.designations
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
    importColumnComments.length ||
    importColumnDesignations.length ||
    importPreCommands.length ||
    importPostCommands.length
  ) {
    normalized.import = {};
    if (importWorkbookLongName) normalized.import.workbookLongName = importWorkbookLongName;
    if (importColumnLongNames.length || importColumnUnits.length || importColumnComments.length || importColumnDesignations.length) {
      normalized.import.columnLabels = {};
      if (importColumnLongNames.length) normalized.import.columnLabels.longNames = importColumnLongNames;
      if (importColumnUnits.length) normalized.import.columnLabels.units = importColumnUnits;
      if (importColumnComments.length) normalized.import.columnLabels.comments = importColumnComments;
      if (importColumnDesignations.length) normalized.import.columnLabels.designations = importColumnDesignations;
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
    "origin.csv",
  );
  const csvPath = normalizeOriginExePath(raw.csvPath ?? csv.path);
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
  const sheetShortName = normalizeNonEmptyString(
    raw.sheetShortName ?? sheet.name,
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
  const rawPlotCommand = plot.command ?? plot.plotCommand ?? raw.plotCommand;
  if (typeof rawPlotCommand === "string" && rawPlotCommand.trim()) {
    normalizedPlot.plotCommand = rawPlotCommand.trim();
  }

  return {
    csvName,
    csvPath,
    csvText,
    importMode,
    workbookKey,
    workbookName,
    sheetName,
    sheetShortName,
    capabilities,
    skipPlot: plot.skip === true || plot.skipPlot === true || raw.skipPlot === true,
    ...normalizedPlot,
  };
}

function normalizeOriginCsvBatchPayload(payload, plotDefaults = undefined) {
  const raw = payload && typeof payload === "object" ? payload : {};
  const jobs = Array.isArray(raw.jobs) ? raw.jobs : [];
  if (!jobs.length) return [];
  return jobs.map((job) => normalizeOriginCsvPayload(job, plotDefaults));
}

function getAnalysisHomeDir() {
  return path.join(app.getPath("home"), ".device");
}

function getAnalysisTempRootDir() {
  return path.join(app.getPath("temp"), "conductor");
}

function getOriginRuntimeRootDir() {
  return getAnalysisTempRootDir();
}

function getOriginRuntimeStorageDir() {
  return path.join(getOriginRuntimeRootDir(), "origin");
}

function getRustExcelJobRootDir() {
  return path.join(getAnalysisHomeDir(), "rust-xls-jobs");
}

function getAnalysisDemoDir() {
  return path.join(getAnalysisHomeDir(), "demo");
}

function resolveAnalysisDemoSourceDir() {
  const appRootPath = getAppRootPath();
  const candidates = app.isPackaged
    ? [
        path.join(getResourcesPath(), "demo"),
        path.join(appRootPath, "dist", "demo"),
      ]
    : [
        path.join(appRootPath, "public", "demo"),
        path.join(appRootPath, "dist", "demo"),
      ];

  return resolveFirstExistingPath(candidates);
}

function ensureAnalysisDemoFiles() {
  const sourceDir = resolveAnalysisDemoSourceDir();
  if (!sourceDir) {
    console.warn("[demo] Demo source directory was not found.");
    return { demoDir: getAnalysisDemoDir(), filePaths: [] };
  }

  const demoDir = getAnalysisDemoDir();
  fs.mkdirSync(demoDir, { recursive: true });

  const filePaths = [];
  for (const fileName of DEMO_FILE_NAMES) {
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

function isSupportedRustAnalysisInputPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ext === ".csv";
}

function resolveRustExcelConverterPath() {
  return resolveRustWorkerExecutablePath({
    desktopRuntimeDir,
    env: process.env,
    isDev,
    platform: process.platform,
    resourcesPath: getResourcesPath(),
  });
}

function createRustAnalysisResultTempDir(fileId) {
  const safeFileId = String(fileId || "file").replace(/[^a-zA-Z0-9._-]+/g, "_");
  const root = getAnalysisTempRootDir();
  fs.mkdirSync(root, { recursive: true });
  return fs.mkdtempSync(path.join(root, `${safeFileId}-`));
}

function createRustAnalysisOriginExportTempPath(fileId, csvName) {
  const safeFileId = String(fileId || "file").replace(/[^a-zA-Z0-9._-]+/g, "_");
  const safeCsvName = String(csvName || "origin.csv")
    .replace(/[/\\?%*:|"<>]+/g, "_")
    .trim() || "origin.csv";
  const root = path.join(getOriginRuntimeStorageDir(), "stream-jobs");
  fs.mkdirSync(root, { recursive: true });
  const jobDir = fs.mkdtempSync(path.join(root, `${safeFileId}-`));
  return path.join(jobDir, safeCsvName);
}

function sanitizeZipEntryName(name, fallback = "origin.csv") {
  const raw = String(name || fallback)
    .replace(/[/\\?%*:|"<>\x00-\x1f]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return raw || fallback;
}

function dedupeZipEntryName(name, seen) {
  const safeName = sanitizeZipEntryName(name);
  const ext = path.extname(safeName);
  const base = ext ? safeName.slice(0, -ext.length) : safeName;
  let candidate = safeName;
  let index = 2;
  while (seen.has(candidate.toLowerCase())) {
    candidate = `${base}_${index}${ext}`;
    index += 1;
  }
  seen.add(candidate.toLowerCase());
  return candidate;
}

function isPathInsideDirectory(parentDir, targetPath) {
  const parent = path.resolve(parentDir);
  const target = path.resolve(targetPath);
  const relative = path.relative(parent, target);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function isReadableOriginStreamExportPath(filePath) {
  if (!filePath) return false;
  const streamRoot = path.join(getOriginRuntimeStorageDir(), "stream-jobs");
  if (!isPathInsideDirectory(streamRoot, filePath)) return false;
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function hydrateRustAnalysisResultRefs(result, tempDir = null) {
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

function stopAllRustAnalysisEngines() {
  rustWorkerRuntime.stop();
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
  const root = path.normalize(path.join(getAnalysisHomeDir(), "rust-xls-jobs"));
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

const analysisStore = createAnalysisStorageMainService({
  getHomeDir: getAnalysisHomeDir,
});

function configureRuntimeCachePath() {
  const cacheDir = path.join(getAnalysisHomeDir(), "cache");
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  try {
    app.setPath("cache", cacheDir);
  } catch (error) {
    console.warn("[runtime] Failed to set cache path:", error?.message || error);
  }
}

function handleAnalysisTemplatesGet() {
  return analysisStore.getAnalysisTemplates();
}

function handleAnalysisTemplatesCreate(_event, payload) {
  return analysisStore.upsertAnalysisTemplate(payload);
}

function handleAnalysisTemplatesDelete(_event, id) {
  return analysisStore.deleteAnalysisTemplate(id);
}

function handleAnalysisSettingsGet() {
  return analysisStore.getAnalysisSettings();
}

function handleAnalysisDemoFilesGet() {
  const { demoDir, filePaths } = ensureAnalysisDemoFiles();
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

function resolveNativeHostEnvironment(sender) {
  const win = BrowserWindow.fromWebContents(sender);
  if (!win || win.isDestroyed()) {
    return null;
  }

  return {
    isDesktop: true,
    platform: process.platform,
    isPackaged: app.isPackaged,
    appVersion: app.getVersion(),
  };
}

function handleNativeHostEnvironmentGet(event) {
  event.returnValue = resolveNativeHostEnvironment(event.sender);
}

function handleWorkbenchBootstrapSettingsGet(event) {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) {
    event.returnValue = null;
    return;
  }

  try {
    event.returnValue = analysisStore.getAnalysisSettings();
  } catch (error) {
    console.warn("[boot] Failed to load initial desktop settings:", error?.message || error);
    event.returnValue = null;
  }
}

function createSharedProcessContributionContext() {
  return {
    analysisHomeDir: getAnalysisHomeDir(),
    analysisTempRootDir: getAnalysisTempRootDir(),
    originRuntimeStorageDir: getOriginRuntimeStorageDir(),
    rustExcelJobRootDir: getRustExcelJobRootDir(),
    log: (message: string) => {
      if (isDesktopBootProfileEnabled()) {
        console.info(message);
      }
      appendDesktopDiagnosticLog(message);
    },
    warn: (message: string, error?: unknown) => {
      console.warn(message, error);
      appendDesktopDiagnosticLog(
        `${message}${error instanceof Error ? ` ${error.message}` : ""}`,
      );
    },
  };
}

function ensureRustExcelJobRoot() {
  const jobRoot = getRustExcelJobRootDir();
  fs.mkdirSync(jobRoot, { recursive: true });
  return jobRoot;
}

function handleAnalysisSettingsPatch(_event, updates) {
  const updated = analysisStore.patchAnalysisSettings(updates);
  if (
    updates &&
    typeof updates === "object" &&
    "theme" in updates
  ) {
    syncBootWindowTheme();
  }
  if (
    updates &&
    typeof updates === "object" &&
    ("backgroundColor" in updates || "transparentChrome" in updates)
  ) {
    const appearance = {
      backgroundColor: updated?.backgroundColor,
      transparentChrome: updated?.transparentChrome,
    };
    applyDesktopAppearanceToWindow(mainWindow, appearance);
    helpWindowMainService?.applyTheme(getThemeSnapshotFromStore());
  }
  return updated;
}

function handleDesktopAppearanceSet(event, payload) {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) {
    return null;
  }

  applyDesktopAppearanceToWindow(win, {
    backgroundColor:
      payload && typeof payload === "object"
        ? payload.backgroundColor
        : undefined,
    transparentChrome:
      payload && typeof payload === "object" && payload.transparentChrome === true,
  });

  return { ok: true };
}

function handleHelpWindowOpen(_event, payload) {
  const kind = normalizeHelpWindowKind(
    payload && typeof payload === "object" ? payload.kind : payload,
  );
  helpWindowMainService?.open(kind);
  return { ok: true };
}

function handleAnalysisPersistencePathGet() {
  return analysisStore.getStorePersistenceInfo();
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

async function handleImportPrepareRust(_event, payload) {
  const rawPath = payload && typeof payload === "object" ? payload.path : payload;
  const inputPath = normalizeAbsoluteFilePath(rawPath);
  const fileName =
    payload && typeof payload.fileName === "string" && payload.fileName.trim()
      ? payload.fileName.trim()
      : inputPath
        ? path.basename(inputPath)
        : "";

  if (!inputPath) {
    return {
      ok: false,
      code: "INVALID_IMPORT_PATH",
      message: "Invalid import file path.",
    };
  }

  let stat;
  try {
    stat = fs.statSync(inputPath);
    if (!stat.isFile()) {
      return {
        ok: false,
        code: "INVALID_IMPORT_PATH",
        message: "Import path is not a file.",
      };
    }
  } catch (error) {
    return {
      ok: false,
      code: "IMPORT_FILE_NOT_FOUND",
      message: error?.message || "Import file not found.",
    };
  }

  const startedAt = Date.now();
  if (isSupportedRustExcelInputPath(inputPath)) {
    const conversion = await handleExcelConvertRust(_event, {
      path: inputPath,
      returnCsvText: false,
    });
    if (!conversion?.ok || !conversion.assessment) {
      return {
        ok: false,
        code: conversion?.code || "RUST_IMPORT_PREPARE_FAILED",
        durationMs: Date.now() - startedAt,
        message: conversion?.message || "Rust import preparation failed.",
      };
    }
    return {
      ok: true,
      assessment: conversion.assessment,
      durationMs: Date.now() - startedAt,
      manifest: conversion.manifest,
      normalizedCsvPath: conversion.csvPath ?? null,
      normalizedSizeBytes: conversion.normalizedSizeBytes,
      sourceName: fileName,
      sourcePath: inputPath,
      sourceSizeBytes: stat.size,
      source: "rust",
    };
  }

  if (!isSupportedRustAnalysisInputPath(inputPath)) {
    return {
      ok: false,
      code: "UNSUPPORTED_IMPORT_FORMAT",
      durationMs: Date.now() - startedAt,
      message: "Unsupported import file format.",
    };
  }

  try {
    const result = await rustWorkerRuntime.sendProcessingCommand("assessImport", {
      fileName,
      path: inputPath,
    }) as { assessment?: unknown };
    const assessment = normalizeRustImportAssessment(result.assessment);
    if (!assessment) {
      return {
        ok: false,
        code: "RUST_IMPORT_ASSESSMENT_FAILED",
        durationMs: Date.now() - startedAt,
        message: "Rust import assessment failed.",
      };
    }
    return {
      ok: true,
      assessment,
      durationMs: Date.now() - startedAt,
      normalizedCsvPath: null,
      normalizedSizeBytes: stat.size,
      sourceName: fileName,
      sourcePath: inputPath,
      sourceSizeBytes: stat.size,
      source: "rust",
    };
  } catch (error) {
    return {
      ok: false,
      code: "RUST_IMPORT_PREPARE_FAILED",
      durationMs: Date.now() - startedAt,
      message: error?.message || "Rust import preparation failed.",
    };
  }
}

async function handleAnalysisOriginZipSave(event, payload) {
  const raw = payload && typeof payload === "object" ? payload : {};
  const entries = Array.isArray(raw.entries) ? raw.entries : [];
  if (!entries.length) {
    return {
      ok: false,
      code: "ORIGIN_ZIP_EMPTY",
      message: "No Origin CSV entries were provided.",
    };
  }

  const seenNames = new Set();
  const normalizedEntries = [];
  for (const entry of entries) {
    const rawEntry = entry && typeof entry === "object" ? entry : {};
    const name = dedupeZipEntryName(rawEntry.name, seenNames);
    const entryPath = normalizeAbsoluteFilePath(rawEntry.path);
    const text = typeof rawEntry.text === "string" ? rawEntry.text : "";
    if (entryPath) {
      if (!isReadableOriginStreamExportPath(entryPath)) {
        return {
          ok: false,
          code: "ORIGIN_ZIP_INVALID_ENTRY_PATH",
          message: "Origin ZIP entry path is not readable.",
        };
      }
      normalizedEntries.push({ name, path: entryPath });
    } else if (text) {
      normalizedEntries.push({ name, text });
    } else {
      return {
        ok: false,
        code: "ORIGIN_ZIP_EMPTY_ENTRY",
        message: "Origin ZIP entry is missing CSV content.",
      };
    }
  }

  const defaultName = sanitizeZipEntryName(raw.defaultName, "origin.zip")
    .replace(/\.csv$/i, ".zip")
    .replace(/\.zip$/i, "") + ".zip";
  const win = BrowserWindow.fromWebContents(event.sender) ?? null;
  const result = await dialog.showSaveDialog(win || undefined, {
    title: mainMessage("originCsv.saveDialogTitle"),
    defaultPath: defaultName,
    buttonLabel: mainMessage("dialog.save"),
    filters: [
      { name: mainMessage("originCsv.zipFilter"), extensions: ["zip"] },
      { name: mainMessage("dialog.allFiles"), extensions: ["*"] },
    ],
    properties: ["createDirectory", "showOverwriteConfirmation"],
  });

  if (result.canceled || !result.filePath) {
    return { ok: true, cancelled: true };
  }

  const zipPath = result.filePath.replace(/\.zip$/i, "") + ".zip";
  try {
    const JSZip = require("jszip");
    const zip = new JSZip();
    for (const entry of normalizedEntries) {
      if (entry.path) {
        zip.file(entry.name, fs.createReadStream(entry.path));
      } else {
        zip.file(entry.name, entry.text);
      }
    }
    await pipeline(
      zip.generateNodeStream({
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
        streamFiles: true,
        type: "nodebuffer",
      }),
      fs.createWriteStream(zipPath),
    );
    try {
      await tryRunOriginRuntimeCleanup();
    } catch (cleanupError) {
      console.warn("[origin-cleanup] ZIP cleanup failed:", cleanupError);
    }
    return {
      ok: true,
      entryCount: normalizedEntries.length,
      zipPath,
    };
  } catch (error) {
    return {
      ok: false,
      code: "ORIGIN_ZIP_SAVE_FAILED",
      message: error?.message || "Failed to save Origin CSV ZIP.",
    };
  }
}

function handleAnalysisPersistencePathSet(_event, payload) {
  const rawPath =
    payload && typeof payload === "object" ? payload.path : payload;
  return analysisStore.setPersistencePath(rawPath);
}

async function handleNativeHostOpenDialog(event, options) {
  return nativeHostMainService.showOpenDialog(event.sender, options);
}

async function handleAnalysisPersistencePathChoose(event) {
  const currentInfo = analysisStore.getStorePersistenceInfo();
  const win = BrowserWindow.fromWebContents(event.sender) ?? null;

  const result = await dialog.showSaveDialog(win || undefined, {
    title: mainMessage("settings.selectUserConfigDialogTitle"),
    defaultPath: currentInfo.currentPath,
    buttonLabel: mainMessage("dialog.confirm"),
    filters: [
      { name: "JSON", extensions: ["json"] },
      { name: mainMessage("dialog.allFiles"), extensions: ["*"] },
    ],
    properties: ["createDirectory", "showOverwriteConfirmation"],
  });

  if (result.canceled || !result.filePath) {
    return { ...currentInfo, cancelled: true };
  }

  const updated = analysisStore.setPersistencePath(result.filePath);
  return { ...updated, cancelled: false };
}

function getOriginExePathFromSettings() {
  const settings = analysisStore.getAnalysisSettings();
  return normalizeOriginExePath(settings?.originExePath);
}

function saveOriginExePathToSettings(originExePath) {
  originDetectionCache = null;
  originDetectionPromise = null;
  const normalizedPath = normalizeOriginExePath(originExePath);
  const settings = analysisStore.patchAnalysisSettings({
    originExePath: normalizedPath,
  });
  return settings.originExePath ?? null;
}

function getOriginRuntimeCleanupPolicyFromSettings() {
  const settings = analysisStore.getAnalysisSettings();
  return {
    enabled: Boolean(settings?.originRuntimeCleanupEnabled),
    keepSuccessJobs: Number(settings?.originRuntimeKeepSuccessJobs),
    failedRetentionDays: Number(settings?.originRuntimeFailedRetentionDays),
  };
}

function getOriginPlotOptionsFromSettings() {
  const settings = analysisStore.getAnalysisSettings();
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
    const message =
      `[origin-detect] ${context}: detected '${result.path}'` +
      `${result.source ? ` via ${result.source}` : ""}` +
      `${probeSummary ? ` (${probeSummary})` : ""}`;
    if (isDesktopBootProfileEnabled()) {
      console.info(message);
    }
    appendDesktopDiagnosticLog(message);
    return;
  }

  const message =
    `[origin-detect] ${context}: no Origin executable detected` +
    `${probeSummary ? ` (${probeSummary})` : ""}`;
  if (isDesktopBootProfileEnabled()) {
    console.warn(message);
  }
  appendDesktopDiagnosticLog(message);
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
    runtimeRootDir: getOriginRuntimeRootDir(),
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
      runtimeRootDir: getOriginRuntimeRootDir(),
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
        runtimeRootDir: getOriginRuntimeRootDir(),
      });
    }

    const {
      csvName,
      csvPath,
      csvText,
      importMode,
      workbookKey,
      workbookName,
      sheetName,
      sheetShortName,
      plotType,
      xyPairs,
      plotCommand,
      postPlotCommands,
      lineWidth,
      capabilities,
    } =
      normalizedPayload;

    if (!csvPath && !csvText.trim()) {
      throw new Error("CSV payload is missing.");
    }

    return await runOriginCsvJob({
      csvName,
      csvPath,
      csvText,
      importMode,
      workbookKey,
      workbookName,
      sheetName,
      sheetShortName,
      plotType,
      xyPairs,
      plotCommand,
      postPlotCommands,
      lineWidth,
      capabilities,
      originExePath,
      workerScriptPath: ORIGIN_CSV_SCRIPT_PATH,
      workerExecutablePath: ORIGIN_CSV_WORKER_PATH,
      runtimeRootDir: getOriginRuntimeRootDir(),
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

function broadcastAutoUpdateStatus() {
  const payload = updateService?.getStatus() ?? {
    status: "idle",
    version: null,
    channel: "none",
    isStoreManaged: false,
    message: null,
  };
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    win.webContents.send(ipcChannels.desktopAutoUpdateStatusChanged, payload);
  }
}

function createUpdateService() {
  return new Win32UpdateService({
    app,
    appDisplayName: APP_DISPLAY_NAME,
    dialog,
    getDialogWindow: getAutoUpdateDialogWindow,
    isWindowsStorePackage,
    packageJsonPath: path.join(getAppRootPath(), "package.json"),
    onStatusChange: broadcastAutoUpdateStatus,
    localize: mainMessage,
    log: (message: string) => {
      if (isDesktopBootProfileEnabled()) {
        console.info(message);
      }
      appendDesktopDiagnosticLog(message);
    },
    warn: (message: string, error?: unknown) => {
      console.warn(message, error);
      appendDesktopDiagnosticLog(
        `${message}${error instanceof Error ? ` ${error.message}` : ""}`,
      );
    },
  });
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
  const settings = analysisStore.getAnalysisSettings();
  if (settings?.trayMinimizeHintShown) return;

  appTray.displayBalloon({
    title: APP_DISPLAY_NAME,
    content: mainMessage("tray.backgroundContinueMessage"),
    noSound: true,
  });
  analysisStore.patchAnalysisSettings({
    trayMinimizeHintShown: true,
  });
}

function getWindowCloseBehaviorFromSettings() {
  const settings = analysisStore.getAnalysisSettings();
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
        label: hasVisibleWindow ? mainMessage("tray.hideWindow") : mainMessage("tray.showWindow"),
        click: () => {
          if (hasVisibleWindow) {
            hideMainWindowToTray(mainWindow);
            return;
          }
          void ensureMainWindowVisible();
        },
      },
      {
        label: mainMessage("tray.checkForUpdates"),
        click: () => {
          void updateService?.checkForUpdates({ manual: true });
        },
      },
      { type: "separator" },
      {
        label: mainMessage("tray.quit"),
        click: () => {
          isAppQuitting = true;
          stopAllRustAnalysisEngines();
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
  appTray.setToolTip(APP_DISPLAY_NAME);
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

  const win = createMainWindow();
  await revealMainWindow(win);
  updateTrayMenu();
  return win;
}

function createMainWindow() {
  logDesktopBoot("create-window:start");
  const windowIcon = resolveDesktopWindowIconPath();
  mainWindowBootShown = false;
  const themeSnapshot = syncBootWindowTheme();
  const preloadPath = path.join(desktopRuntimeDir, "preload.js");

  const win = new BrowserWindow(defaultBrowserWindowOptions({
    icon: windowIcon,
    isDev,
    preload: preloadPath,
    themeSnapshot,
  }));
  logDesktopDiagnostic("window:create", {
    isDev,
    isPackaged: app.isPackaged,
    preload: preloadPath,
    cwd: process.cwd(),
    dirname: __dirname,
    desktopRuntimeDir,
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
  applyWindowThemeSnapshot(mainWindow, themeSnapshot);
  applyDesktopAppearanceToWindow(mainWindow, getAppearanceFromStore());
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
  });

  win.webContents.once("dom-ready", () => {
    logDesktopBoot("window:dom-ready");
    logDesktopDiagnostic("window:dom-ready", {
      url: win.webContents.getURL(),
    });
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
    logDesktopDiagnostic("window:did-start-loading", {
      url: win.webContents.getURL(),
    });
  });

  win.webContents.once("did-finish-load", () => {
    logDesktopBoot("window:did-finish-load");
    logDesktopDiagnostic("window:did-finish-load", {
      url: win.webContents.getURL(),
    });
    void showMainWindowAfterBoot(win);
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
      logDesktopDiagnostic("window:did-fail-load", {
        errorCode,
        errorDescription,
        validatedUrl,
        isMainFrame,
      });
      if (!isMainFrame) return;
      logDesktopBoot(
        "window:did-fail-load",
        `(code=${errorCode} message=${errorDescription} url=${validatedUrl})`,
      );
      void showMainWindowAfterBoot(win);
    },
  );

  win.webContents.on(
    "did-fail-provisional-load",
    (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      logDesktopDiagnostic("window:did-fail-provisional-load", {
        errorCode,
        errorDescription,
        validatedUrl,
        isMainFrame,
      });
    },
  );

  win.webContents.on("did-stop-loading", () => {
    logDesktopBoot("window:did-stop-loading");
    logDesktopDiagnostic("window:did-stop-loading", {
      url: win.webContents.getURL(),
    });
  });

  win.webContents.on("preload-error", (_event, preloadPath, error) => {
    logDesktopDiagnostic("window:preload-error", {
      preloadPath,
      message: error?.message,
      stack: error?.stack,
    });
  });

  win.webContents.on("render-process-gone", (_event, details) => {
    logDesktopDiagnostic("window:render-process-gone", details);
  });

  win.webContents.on("unresponsive", () => {
    logDesktopDiagnostic("window:unresponsive", {
      url: win.webContents.getURL(),
    });
  });

  win.webContents.on("responsive", () => {
    logDesktopDiagnostic("window:responsive", {
      url: win.webContents.getURL(),
    });
  });

  win.webContents.on("console-message", (event) => {
    const message = typeof event.message === "string" ? event.message : "";
    const levelLabel =
      event.level === "warning"
        ? "warn"
        : event.level === "error"
          ? "error"
          : "info";
    if (levelLabel !== "info" || isDesktopBootProfileEnabled()) {
      logDesktopDiagnostic("renderer-console", {
        level: levelLabel,
        line: event.lineNumber,
        sourceId: event.sourceId,
        message,
      });
    }
    if (typeof message !== "string" || !message.startsWith("[boot]")) return;
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

  logDesktopBoot(
    "load-file",
    "(prod: dist/src/cs/code/electron-browser/workbench/workbench.html)",
  );
  void win.loadFile(
    path.join(
      getAppRootPath(),
      "dist",
      "src",
      "cs",
      "code",
      "electron-browser",
      "workbench",
      "workbench.html",
    ),
  );
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

  if (!win.isFocused()) {
    win.focus();
  }
  mainWindowBootShown = true;
  await new Promise((resolve) => setTimeout(resolve, BOOT_WINDOW_SETTLE_MS));
  logDesktopBoot("main-window:show:done");
}

function handleWorkbenchBootstrapUiReady(event, payload) {
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

function runWindowCommand(win, command) {
  if (!win || win.isDestroyed()) return;

  if (command === nativeWindowCommands.toggleDevTools) {
    if (win.webContents.isDevToolsOpened()) {
      win.webContents.closeDevTools();
      return;
    }
    win.webContents.openDevTools({ mode: "detach" });
    return;
  }

  if (command === nativeWindowCommands.reloadWindow) {
    win.webContents.reload();
    return;
  }

  if (command === nativeWindowCommands.minimizeWindow) {
    win.minimize();
    updateTrayMenu();
    return;
  }

  if (command === nativeWindowCommands.toggleWindowMaximized) {
    if (win.isMaximized()) {
      win.unmaximize();
      return;
    }
    win.maximize();
    return;
  }

  if (command === nativeWindowCommands.closeWindow) {
    if (shouldMinimizeToTrayOnWindowClose()) {
      hideMainWindowToTray(win, { showTrayHint: true });
      updateTrayMenu();
      return;
    }

    isAppQuitting = true;
    stopAllRustAnalysisEngines();
    app.quit();
  }
}

function normalizeLegacyWindowCommand(command) {
  if (command === "toggle-devtools") return nativeWindowCommands.toggleDevTools;
  if (command === "reload-window") return nativeWindowCommands.reloadWindow;
  if (command === "minimize-window") return nativeWindowCommands.minimizeWindow;
  if (command === "toggle-maximize-window") return nativeWindowCommands.toggleWindowMaximized;
  if (command === "close-window") return nativeWindowCommands.closeWindow;
  return command;
}

function handleNativeWindowCommand(event, payload) {
  const command =
    payload && typeof payload.command === "string" ? payload.command : "";
  if (!command) return;

  runWindowCommand(BrowserWindow.fromWebContents(event.sender), command);
}

function handleDesktopCommand(event, payload) {
  const command =
    payload && typeof payload.command === "string" ? payload.command : "";
  if (!command) return;

  const normalizedWindowCommand = normalizeLegacyWindowCommand(command);
  if (normalizedWindowCommand !== command) {
    runWindowCommand(BrowserWindow.fromWebContents(event.sender), normalizedWindowCommand);
    return;
  }

  if (command === "check-for-updates") {
    void updateService?.checkForUpdates({ manual: true });
    return;
  }

  if (command === "check-for-updates-and-install") {
    void updateService?.checkForUpdatesAndInstall();
    return;
  }

  if (command === "install-downloaded-update") {
    void updateService?.installDownloadedUpdate();
    return;
  }
}

function handleDesktopAutoUpdateStatusGet(event) {
  event.returnValue = updateService?.getStatus() ?? {
    status: "idle",
    version: null,
    channel: "none",
    isStoreManaged: false,
    message: null,
  };
}

function handleNativeHostShowItemInFolder(_event, payload) {
  const filePath =
    payload && typeof payload === "object" && typeof payload.path === "string"
      ? payload.path
      : typeof payload === "string"
        ? payload
        : "";
  nativeHostMainService.showItemInFolder(filePath);
}

if (hasSingleInstanceLock) {
  app.on("second-instance", () => {
    if (app.isReady()) {
      void ensureMainWindowVisible();
      return;
    }

    void app.whenReady().then(() => ensureMainWindowVisible());
  });

  app.whenReady().then(() => {
  logDesktopBoot("app:ready");
  if (isWindows) {
    app.setAppUserModelId(APP_USER_MODEL_ID);
  }
  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
  }
  configureRuntimeCachePath();
  runSharedProcessStartupContributions(createSharedProcessContributionContext());
  ensureAnalysisDemoFiles();
  createAppTray();
  updateService = createUpdateService();
  helpWindowMainService = new HelpWindowMainService({
    applyAppearance: applyDesktopAppearanceToWindow,
    applyTheme: applyWindowThemeSnapshot,
    desktopRuntimeDir,
    getAppearance: getAppearanceFromStore,
    getAppRootPath,
    getThemeSnapshot: getThemeSnapshotFromStore,
    getWindowTitle: kind => mainMessage(kind === "guide" ? "help.windowGuideTitle" : "help.windowUpdateLogTitle"),
    iconPath: resolveDesktopWindowIconPath(),
    isDev,
    loadBaseUrl: devUrl,
  });
  mainProcessServer.registerChannel(
    LOCAL_FILE_SYSTEM_CHANNEL_NAME,
    new DiskFileSystemProviderChannel(localFileSystemProvider),
  );

  ipcMain.on("desktop-command", handleDesktopCommand);
  ipcMain.on(nativeHostIpcChannels.windowCommand, handleNativeWindowCommand);
  registerContextMenuListener();
  ipcMain.handle(nativeHostIpcChannels.environmentGet, event =>
    resolveNativeHostEnvironment(event.sender),
  );
  ipcMain.handle(nativeHostIpcChannels.openDialog, handleNativeHostOpenDialog);
  ipcMain.on(nativeHostIpcChannels.showItemInFolder, handleNativeHostShowItemInFolder);
  ipcMain.on(nativeHostIpcChannels.environmentGet, handleNativeHostEnvironmentGet);
  ipcMain.on(ipcChannels.desktopAutoUpdateStatusGet, handleDesktopAutoUpdateStatusGet);
  ipcMain.on(workbenchBootstrapIpcChannels.settingsGet, handleWorkbenchBootstrapSettingsGet);
  ipcMain.handle(workbenchBootstrapIpcChannels.uiReady, handleWorkbenchBootstrapUiReady);
  ipcMain.handle(ipcChannels.desktopAutoUpdateCheck, () =>
    updateService?.checkForUpdates({ manual: true }),
  );
  ipcMain.handle(ipcChannels.desktopAutoUpdateCheckAndInstall, () =>
    updateService?.checkForUpdatesAndInstall(),
  );
  ipcMain.handle(ipcChannels.desktopAutoUpdateInstallDownloaded, () =>
    updateService?.installDownloadedUpdate(),
  );
  ipcMain.handle(ipcChannels.desktopAppearanceSet, handleDesktopAppearanceSet);
  ipcMain.handle(ipcChannels.helpWindowOpen, handleHelpWindowOpen);
  ipcMain.handle(ipcChannels.templatesGet, handleAnalysisTemplatesGet);
  ipcMain.handle(ipcChannels.templatesCreate, handleAnalysisTemplatesCreate);
  ipcMain.handle(ipcChannels.templatesDelete, handleAnalysisTemplatesDelete);
  ipcMain.handle(ipcChannels.settingsGet, handleAnalysisSettingsGet);
  ipcMain.handle(ipcChannels.settingsPatch, handleAnalysisSettingsPatch);
  ipcMain.handle(ipcChannels.persistencePathGet, handleAnalysisPersistencePathGet);
  ipcMain.handle(ipcChannels.persistencePathSet, handleAnalysisPersistencePathSet);
  ipcMain.handle(ipcChannels.persistencePathChoose, handleAnalysisPersistencePathChoose);
  ipcMain.handle(ipcChannels.importPrepareRust, handleImportPrepareRust);
  ipcMain.handle(ipcChannels.excelConvertRust, handleExcelConvertRust);
  ipcMain.handle(ipcChannels.excelReadConvertedCsv, handleExcelReadConvertedCsv);
  ipcMain.handle(ipcChannels.analysisDemoFilesGet, handleAnalysisDemoFilesGet);
  analysisRustHandlers = registerAnalysisRustHandlers({
    ipcChannels,
    ipcMain,
    rustAnalysisService: new RustAnalysisService({
      createRustAnalysisOriginExportTempPath,
      createRustAnalysisResultTempDir,
      hydrateRustAnalysisResultRefs,
      isRustProcessFileConfigSupported,
      isSupportedRustAnalysisInputPath,
      rustWorkerRuntime,
    }),
  });
  ipcMain.handle(
    ipcChannels.analysisOriginZipSave,
    handleAnalysisOriginZipSave,
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
  nativeTheme.on("updated", syncBootWindowTheme);
  void prepareStartupGate();
  const window = createMainWindow();
  window.webContents.once("did-finish-load", () => {
    logDesktopBoot("post-load:auto-updates:init");
    void updateService?.setup();
  });

  app.on("activate", () => {
    void ensureMainWindowVisible();
  });
});

app.on("window-all-closed", () => {
  if (process.platform === "darwin") return;
  if (appTray && !isAppQuitting) return;
  stopAllRustAnalysisEngines();
  app.quit();
});

app.on("before-quit", () => {
  isAppQuitting = true;
  stopAllRustAnalysisEngines();
});

app.on("will-quit", () => {
  isAppQuitting = true;
  updateService?.stopPolling();
  nativeTheme.removeListener("updated", syncBootWindowTheme);
  runSharedProcessShutdownContributions(createSharedProcessContributionContext());
  stopAllRustAnalysisEngines();
  analysisRustHandlers?.dispose();
  analysisRustHandlers = null;
  if (appTray) {
    appTray.destroy();
    appTray = null;
  }
  ipcMain.removeListener("desktop-command", handleDesktopCommand);
  ipcMain.removeListener(nativeHostIpcChannels.windowCommand, handleNativeWindowCommand);
  ipcMain.removeHandler(nativeHostIpcChannels.environmentGet);
  ipcMain.removeHandler(nativeHostIpcChannels.openDialog);
  ipcMain.removeListener(nativeHostIpcChannels.showItemInFolder, handleNativeHostShowItemInFolder);
  ipcMain.removeListener(nativeHostIpcChannels.environmentGet, handleNativeHostEnvironmentGet);
  ipcMain.removeListener(
    ipcChannels.desktopAutoUpdateStatusGet,
    handleDesktopAutoUpdateStatusGet,
  );
  ipcMain.removeListener(workbenchBootstrapIpcChannels.settingsGet, handleWorkbenchBootstrapSettingsGet);
  ipcMain.removeHandler(workbenchBootstrapIpcChannels.uiReady);
  ipcMain.removeHandler(ipcChannels.desktopAutoUpdateCheck);
  ipcMain.removeHandler(ipcChannels.desktopAutoUpdateCheckAndInstall);
  ipcMain.removeHandler(ipcChannels.desktopAutoUpdateInstallDownloaded);
  ipcMain.removeHandler(ipcChannels.desktopAppearanceSet);
  ipcMain.removeHandler(ipcChannels.helpWindowOpen);
  ipcMain.removeHandler(ipcChannels.templatesGet);
  ipcMain.removeHandler(ipcChannels.templatesCreate);
  ipcMain.removeHandler(ipcChannels.templatesDelete);
  ipcMain.removeHandler(ipcChannels.settingsGet);
  ipcMain.removeHandler(ipcChannels.settingsPatch);
  ipcMain.removeHandler(ipcChannels.persistencePathGet);
  ipcMain.removeHandler(ipcChannels.persistencePathSet);
  ipcMain.removeHandler(ipcChannels.persistencePathChoose);
  ipcMain.removeHandler(ipcChannels.importPrepareRust);
  ipcMain.removeHandler(ipcChannels.excelConvertRust);
  ipcMain.removeHandler(ipcChannels.excelReadConvertedCsv);
  ipcMain.removeHandler(ipcChannels.analysisDemoFilesGet);
  ipcMain.removeHandler(ipcChannels.analysisOriginZipSave);
  ipcMain.removeHandler(ipcChannels.originExeGet);
  ipcMain.removeHandler(ipcChannels.originExeSet);
  ipcMain.removeHandler(ipcChannels.originExePick);
  ipcMain.removeHandler(ipcChannels.originHealthCheck);
  ipcMain.removeHandler(ipcChannels.originRunCsv);
  ipcMain.removeHandler(ipcChannels.originRuntimeCleanupRun);
  helpWindowMainService?.dispose();
  helpWindowMainService = null;
});
}
