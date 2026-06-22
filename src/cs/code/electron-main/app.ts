import fs from "node:fs";
import os from "node:os";
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
  session,
  shell,
} from "electron";
import { product } from "../../../bootstrap-meta.js";
import type { IDisposable } from "../../base/common/lifecycle.js";
import type { URI } from "../../base/common/uri.js";
import { isLanguagePreference, resolveLanguageCode } from "../../base/common/platform.js";
import { Server as ElectronIPCServer } from "../../base/parts/ipc/electron-main/ipc.electron.js";
import { Event } from "../../base/common/event.js";
import type { IServerChannel } from "../../base/parts/ipc/common/ipc.js";
import { SyncDescriptor } from "../../platform/instantiation/common/descriptors.js";
import { InstantiationService } from "../../platform/instantiation/common/instantiationService.js";
import { ServiceCollection } from "../../platform/instantiation/common/serviceCollection.js";
import {
  DesktopWindowMain,
  type DesktopWindowStyleState,
} from "../../platform/window/electron-main/window.js";
import { ITrayMainService } from "../../platform/windows/electron-main/trayMainService.js";
import { TrayMainService } from "../../platform/windows/electron-main/trayMainServiceImpl.js";
import { IStorageService } from "../../platform/storage/common/storage.js";
import { createStorageMainService } from "../../platform/storage/electron-main/storageMainService.js";
import {
  StorageMainChannel,
  STORAGE_CHANNEL_NAME,
} from "../../platform/storage/electron-main/storageIpc.js";
import {
  ConfigurationTarget,
  IConfigurationService,
} from "../../platform/configuration/common/configuration.js";
import {
  applyStartupConductorDefaults,
  cloneConductorSettings,
  normalizeConductorSettings,
  type ConductorSettings,
} from "../../platform/configuration/common/configurationRegistry.js";
import { ConfigurationService } from "../../platform/configuration/common/configurationService.js";
import { getUserSettingsResource } from "../../platform/environment/common/environmentService.js";
import { workbenchIpcChannels as ipcChannels } from "../../workbench/common/ipcChannels.js";
import {
  runSharedProcessShutdownContributions,
  runSharedProcessStartupContributions,
} from "../electron-utility/sharedProcess/sharedProcessMain.js";
import { registerOriginMainHandlers } from "../../platform/origin/electron-main/originMainHandlers.js";
import { IOriginMainService } from "../../platform/origin/electron-main/originMainService.js";
import { OriginMainService } from "../../platform/origin/electron-main/originMainServiceImpl.js";
import { Win32UpdateService } from "../../platform/update/electron-main/updateService.win32.js";
import { DialogMainService } from "../../platform/dialogs/electron-main/dialogMainService.js";
import { NativeHostMainService } from "../../platform/native/electron-main/nativeHostMainService.js";
import { registerContextMenuListener } from "../../base/parts/contextmenu/electron-main/contextmenu.js";
import { IThemeMainService } from "../../platform/theme/electron-main/themeMainService.js";
import { ThemeMainService } from "../../platform/theme/electron-main/themeMainServiceImpl.js";
import {
  nativeHostBootstrapIpcChannels,
  workbenchBootstrapIpcChannels,
} from "../../base/parts/sandbox/common/sandboxTypes.js";
import { isNativeWindowCommand } from "../../platform/window/common/window.js";
import {
  resolveRustProcessingPoolSize,
  resolveRustWorkerExecutablePath,
  RustWorkerHost,
} from "../../platform/rust/electron-main/rustWorkerHost.js";
import { DiskFileSystemProviderChannel } from "../../platform/files/electron-main/diskFileSystemProviderServer.js";
import {
  type FileType,
  type IFileContent,
  LOCAL_FILE_SYSTEM_CHANNEL_NAME,
  type IFileStat,
  type IFileSystemProvider,
  type IReadFileOptions,
  type IWatchOptions,
} from "../../platform/files/common/files.js";
import { FileService } from "../../platform/files/common/fileService.js";
import { DiskFileSystemProvider } from "../../platform/files/node/diskFileSystemProvider.js";
import { registerRustHostChannels } from "./rustHostChannels.js";
import { RustHostService } from "./rustHostService.js";
import { mainProcessMessage } from "./mainNls.js";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// app.ts is compiled to desktop-dist/src/cs/code/electron-main.
const desktopPreloadPath = path.resolve(
  __dirname,
  "../../base/parts/sandbox/electron-browser/preload.js",
);

// Native desktop application body, equivalent in role to VS Code's code/electron-main/app.ts.
// Keep BrowserWindow, IPC registration, updater, tray, and local worker lifecycle here until a
// dedicated shared process takes over the long-running background services.
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

function mainMessage(key, vars = {}) {
  return mainProcessMessage(getMainLanguage(), key, vars);
}

function getMainLanguage() {
  const configured = mainConfigurationService.getValue<unknown>("language");
  return resolveLanguageCode(
    isLanguagePreference(configured) ? configured : "system",
    app.getLocale(),
  );
}

function isUpdateDebugBuild() {
  if (process.env.CONDUCTOR_UPDATE_DEBUG === "1") {
    return true;
  }

  return app.isPackaged &&
    process.platform === "win32" &&
    fs.existsSync(path.join(process.resourcesPath, UPDATE_DEBUG_BUILD_MARKER_FILE));
}

const isDev = !app.isPackaged;
const isWindows = process.platform === "win32";
const UPDATE_DEBUG_BUILD_MARKER_FILE = "update-debug-build";
// The desktop renderer follows VS Code's code/electron-browser/workbench entry shape.
// Main stays responsible for native windows, IPC, updater, tray, and worker processes.
const devUrl =
  process.env.ELECTRON_START_URL ||
  "http://127.0.0.1:5174/src/cs/code/electron-browser/workbench/workbench.html";
const isWindowsStorePackage =
  process.platform === "win32" && Reflect.get(process, "windowsStore") === true;
const APP_DISPLAY_NAME = product.nameLong;
const APP_USER_MODEL_ID = isDev
  ? `${product.appId}.dev`
  : isUpdateDebugBuild()
    ? `${product.appId}.updateDebug`
    : product.appId;
const DEFAULT_WORKBENCH_BACKGROUND_COLOR = "#f3f4f6";
const desktopWindowMain = new DesktopWindowMain(DEFAULT_WORKBENCH_BACKGROUND_COLOR);
const BOOT_WINDOW_SETTLE_MS = 80;
const BOOT_UI_READY_FALLBACK_MS = 3500;
const RUST_PROCESSING_POOL_SIZE = resolveRustProcessingPoolSize({
  availableParallelism: os.availableParallelism(),
  envValue: process.env.CONDUCTOR_RUST_PROCESSING_POOL_SIZE,
});
const TABLE_FOREGROUND_IDLE_GRACE_MS = 16;
const FILE_IMPORT_BACKGROUND_MAX_ACTIVE = Math.max(1, RUST_PROCESSING_POOL_SIZE);
const FILE_IMPORT_RUST_BATCH_MAX_ACTIVE = FILE_IMPORT_BACKGROUND_MAX_ACTIVE;
const FILE_IMPORT_RUST_BATCH_LARGE_MAX_ACTIVE = Math.max(
  1,
  Math.ceil(FILE_IMPORT_RUST_BATCH_MAX_ACTIVE / 2),
);
const FILE_IMPORT_RUST_BATCH_PARALLELISM = 1;
const FILE_IMPORT_RUST_BATCH_SMALL_COMMAND_SIZE = 4;
const FILE_IMPORT_RUST_BATCH_LARGE_COMMAND_SIZE = 2;
const FILE_IMPORT_RUST_BATCH_LARGE_THRESHOLD = 64;
const FILE_IMPORT_PREPARE_CACHE_MAX_ENTRIES = 4096;
const FILE_IMPORT_PREWARM_TIMEOUT_MS = 30000;
const rustWorkerHost = new RustWorkerHost({
  isWindows,
  processingPoolSize: RUST_PROCESSING_POOL_SIZE,
  resolveExecutablePath: () => resolveRustWorkerExecutablePath({
    appRootPath: getAppRootPath(),
    env: process.env,
    isDev,
    platform: process.platform,
    resourcesPath: getResourcesPath(),
  }),
});
const mainProcessServer = new ElectronIPCServer();
const localFileSystemProvider = new DiskFileSystemProvider(filePath => shell.trashItem(filePath));
const dialogMainService = new DialogMainService();
const nativeHostMainService = new NativeHostMainService(dialogMainService);
let mainWindow = null;
let rustHandlers = null;
let originHandlers = null;
let mainWindowBootExpansionPromise = null;
let mainWindowBootShown = false;
let startupGatePromise = null;
let updateService: Win32UpdateService | null = null;
let themeMainServiceListener: IDisposable | null = null;
const desktopProcessStartMs = Date.now();
const nativeHostChannelName = "nativeHost";

class RustPriorityGate {
  private activeBackground = 0;
  private activeForeground = 0;
  private foregroundIdleUntil = 0;
  private wakeTimer: NodeJS.Timeout | null = null;
  private readonly waiters: Array<() => void> = [];

  public constructor(
    private readonly options: {
      readonly backgroundMaxActive: number;
      readonly foregroundIdleGraceMs: number;
    },
  ) {}

  public async runForeground<T>(task: () => Promise<T>): Promise<T> {
    this.activeForeground += 1;
    this.foregroundIdleUntil = 0;
    try {
      return await task();
    } finally {
      this.activeForeground = Math.max(0, this.activeForeground - 1);
      this.foregroundIdleUntil = Date.now() + this.options.foregroundIdleGraceMs;
      this.scheduleBackgroundWake();
    }
  }

  public async runBackground<T>(task: () => Promise<T>): Promise<T> {
    await this.acquireBackgroundSlot();
    try {
      return await task();
    } finally {
      this.activeBackground = Math.max(0, this.activeBackground - 1);
      this.wakeBackgroundWaiters();
    }
  }

  private async acquireBackgroundSlot(): Promise<void> {
    while (!this.canStartBackground()) {
      await new Promise<void>(resolve => {
        this.waiters.push(resolve);
        this.scheduleBackgroundWake();
      });
    }

    this.activeBackground += 1;
  }

  private canStartBackground(): boolean {
    return this.activeForeground === 0 &&
      Date.now() >= this.foregroundIdleUntil &&
      this.activeBackground < this.options.backgroundMaxActive;
  }

  private scheduleBackgroundWake(): void {
    if (this.wakeTimer || this.activeForeground > 0 || !this.waiters.length) {
      return;
    }

    const delay = Math.max(0, this.foregroundIdleUntil - Date.now());
    this.wakeTimer = setTimeout(() => {
      this.wakeTimer = null;
      this.wakeBackgroundWaiters();
    }, delay);
  }

  private wakeBackgroundWaiters(): void {
    if (!this.waiters.length) {
      return;
    }

    const waiters = this.waiters.splice(0);
    for (const resolve of waiters) {
      resolve();
    }
  }
}

const rustPriorityGate = new RustPriorityGate({
  backgroundMaxActive: FILE_IMPORT_BACKGROUND_MAX_ACTIVE,
  foregroundIdleGraceMs: TABLE_FOREGROUND_IDLE_GRACE_MS,
});
const fileImportPrepareCache = new Map();
let rustProcessingPrewarmPromise = null;

class MainFileSystemProvider implements IFileSystemProvider {
  public readonly onDidFilesChange;

  public constructor(private readonly provider: DiskFileSystemProvider) {
    this.onDidFilesChange = provider.onDidFilesChange;
  }

  public exists(resource: URI): Promise<boolean> {
    return this.provider.exists(resource);
  }

  public readDir(resource: URI): Promise<readonly [string, FileType][]> {
    return this.provider.readDir(resource);
  }

  public readFile(resource: URI, options?: IReadFileOptions): Promise<IFileContent> {
    return this.provider.readFile(resource, options);
  }

  public writeFile(resource: URI, content: string): Promise<void> {
    return this.provider.writeFile(resource, content);
  }

  public deleteFile(resource: URI): Promise<void> {
    return this.provider.deleteFile(resource);
  }

  public moveFileToTrash(resource: URI): Promise<void> {
    return this.provider.moveFileToTrash(resource);
  }

  public realpath(resource: URI): Promise<URI> {
    return this.provider.realpath(resource);
  }

  public stat(resource: URI): Promise<IFileStat> {
    return this.provider.stat(resource);
  }

  public watch(resource: URI, options: IWatchOptions = {}): IDisposable {
    return this.provider.watch(resource.toString(), resource, options);
  }
}

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
  let logDir;

  try {
    logDir = getConductorLogHomeDir();
  } catch {
    // Ignore logging path failures.
    return;
  }

  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, "desktop-renderer.log"), line, "utf8");
  } catch {
    // Logging must never block app startup.
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

function getWindowThemeFromStore() {
  return mainThemeService.getWindowTheme();
}

function syncBootWindowTheme() {
  const theme = getWindowThemeFromStore();
  sendDesktopOpaqueSurfaceState(mainWindow, desktopWindowMain.applyWindowStyle(mainWindow, {
    appearance: getAppearanceFromStore(),
    theme,
  }));
  return theme;
}

function getAppearanceFromStore() {
  return mainThemeService.getWindowAppearance();
}

function getOpaqueWindowSurfaceBackgroundColor() {
  return mainThemeService.getOpaqueSurfaceBackgroundColor();
}

function sendDesktopOpaqueSurfaceState(
  win: BrowserWindow | null | undefined,
  state: DesktopWindowStyleState | undefined,
) {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) {
    return;
  }

  win.webContents.send(ipcChannels.desktopOpaqueSurfaceChanged, {
    backgroundColor:
      state?.opaqueSurfaceBackgroundColor ?? getOpaqueWindowSurfaceBackgroundColor(),
    opaqueSurface: state?.opaqueSurface === true,
  });
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
  const platformResourceDir =
    process.platform === "win32"
      ? "win32"
      : process.platform === "darwin"
        ? "darwin"
        : "linux";
  const iconFileName =
    process.platform === "win32"
      ? "icon-150.png"
      : process.platform === "darwin"
        ? "icon.icns"
        : "icon.png";

  const resourcesPath = getResourcesPath();
  const candidates = app.isPackaged
    ? [
        path.join(resourcesPath, "resources", platformResourceDir, iconFileName),
        path.join(resourcesPath, "build", "icons", iconFileName),
        path.join(resourcesPath, "app.asar.unpacked", "build", "icons", iconFileName),
      ]
    : [
        path.join(resourcesPath, "resources", platformResourceDir, iconFileName),
        path.join(resourcesPath, "build", "icons", iconFileName),
      ];

  return resolveFirstExistingPath(candidates) ?? undefined;
}

function resolveTrayIconPath() {
  const platformResourceDir =
    process.platform === "win32"
      ? "win32"
      : process.platform === "darwin"
        ? "darwin"
        : "linux";
  const iconFileName =
    process.platform === "win32"
      ? "icon.ico"
      : process.platform === "darwin"
        ? "trayTemplate.png"
        : "icon.png";

  const resourcesPath = getResourcesPath();
  const candidates = app.isPackaged
    ? [
        path.join(resourcesPath, "resources", platformResourceDir, iconFileName),
        path.join(resourcesPath, "build", "icons", iconFileName),
        path.join(resourcesPath, "app.asar.unpacked", "build", "icons", iconFileName),
      ]
    : [
        path.join(resourcesPath, "resources", platformResourceDir, iconFileName),
        path.join(resourcesPath, "build", "icons", iconFileName),
      ];

  const trayIconPath = resolveFirstExistingPath(candidates);
  if (process.platform === "darwin") {
    return trayIconPath;
  }
  return trayIconPath ?? resolveDesktopWindowIconPath();
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
  const envPath = normalizeAbsoluteFilePath(process.env.ORIGIN_CSV_WORKER_PATH);
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

function getHomeDir() {
  return path.join(app.getPath("home"), ".device");
}

function getConductorUserDataHomeDir() {
  return path.join(app.getPath("userData"), "User");
}

function getConductorPersistenceHomeDir() {
  return getConductorUserDataHomeDir();
}

function getConductorLogHomeDir() {
  return path.join(app.getPath("userData"), "logs");
}

function getTempRootDir() {
  return path.join(app.getPath("temp"), "conductor");
}

function getOriginRuntimeRootDir() {
  return getTempRootDir();
}

function getOriginRuntimeStorageDir() {
  return path.join(getOriginRuntimeRootDir(), "origin");
}

function getRustExcelJobRootDir() {
  return path.join(getTempRootDir(), "rust-xls-jobs");
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

function isSupportedRustInputPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ext === ".csv";
}

function resolveRustExcelConverterPath() {
  return resolveRustWorkerExecutablePath({
    appRootPath: getAppRootPath(),
    env: process.env,
    isDev,
    platform: process.platform,
    resourcesPath: getResourcesPath(),
  });
}

function createRustProcessingResultTempDir(fileId) {
  const safeFileId = String(fileId || "file").replace(/[^a-zA-Z0-9._-]+/g, "_");
  const root = getTempRootDir();
  fs.mkdirSync(root, { recursive: true });
  return fs.mkdtempSync(path.join(root, `rust-process-${safeFileId}-`));
}

function createRustOriginExportTempPath(fileId, csvName) {
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

async function hydrateRustProcessingResultRefs(result, tempDir = null) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return result;

  const ref = result.calculationCacheRef;
  const refPath =
    ref && typeof ref === "object" && typeof ref.path === "string"
      ? normalizeAbsoluteFilePath(ref.path)
      : "";
  if (refPath && ref?.format === "json") {
    const text = await fs.promises.readFile(refPath, "utf8");
    result.analysisCache = JSON.parse(text);
    delete result.calculationCacheRef;
  }

  if (tempDir) {
    void fs.promises.rm(tempDir, { force: true, recursive: true }).catch(() => {});
  }
  return result;
}

function stopAllRustEngines() {
  rustWorkerHost.stop();
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
  const root = path.normalize(getRustExcelJobRootDir());
  const relative = path.relative(root, normalized);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function handleExcelReadConvertedCsv(_event, payload) {
  const rawPath = payload && typeof payload === "object" ? payload.path : payload;
  const maxRows =
    payload && typeof payload === "object" && Number.isFinite(Number(payload.maxRows))
      ? Math.max(0, Math.floor(Number(payload.maxRows)))
      : undefined;
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
    const csvText = fs.readFileSync(csvPath, "utf8");
    return {
      ok: true,
      csvText: limitCsvRows(csvText, maxRows),
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

function limitCsvRows(text, maxRows) {
  if (!Number.isFinite(maxRows) || maxRows < 0) {
    return text;
  }
  if (maxRows === 0) {
    return "";
  }

  let rowCount = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) !== 10) {
      continue;
    }
    rowCount += 1;
    if (rowCount >= maxRows) {
      return text.slice(0, index);
    }
  }
  return text;
}

const mainFileService = new FileService();
mainFileService.registerProvider("file", new MainFileSystemProvider(localFileSystemProvider));
const mainConfigurationService = new ConfigurationService(
  getUserSettingsResource(app.getPath("userData")),
  mainFileService,
);
const mainStorageService = createStorageMainService({
  getHomeDir: getConductorPersistenceHomeDir,
});
const mainServices = new ServiceCollection();
mainServices.set(IConfigurationService, mainConfigurationService);
mainServices.set(IStorageService, mainStorageService);
mainServices.set(
  IThemeMainService,
  new SyncDescriptor(ThemeMainService, [
    DEFAULT_WORKBENCH_BACKGROUND_COLOR,
    mainConfigurationService,
  ]),
);
mainServices.set(
  ITrayMainService,
  new SyncDescriptor(TrayMainService, [
    {
      appDisplayName: APP_DISPLAY_NAME,
      platform: process.platform,
      checkForUpdates: () => {
        void updateService?.checkForUpdates({ manual: true });
      },
      ensureMainWindowVisible: () => ensureMainWindowVisible(),
      getMainWindow: () => mainWindow,
      logWarning: (message, error) => console.warn(message, error),
      quit: () => {
        stopAllRustEngines();
        app.quit();
      },
      resolveTrayIconPath: () => resolveTrayIconPath(),
      showMessage: key => mainMessage(key),
    },
    mainConfigurationService,
    mainStorageService,
  ]),
);
mainServices.set(
  IOriginMainService,
  new SyncDescriptor(OriginMainService, [mainConfigurationService]),
);
const mainInstantiationService = new InstantiationService(mainServices, true);
const mainThemeService = mainInstantiationService.invokeFunction(accessor =>
  accessor.get(IThemeMainService),
);
const trayMainService = mainInstantiationService.invokeFunction(accessor =>
  accessor.get(ITrayMainService),
);
const originMainService = mainInstantiationService.invokeFunction(accessor =>
  accessor.get(IOriginMainService),
);

const conductorMainConfiguration = {
  getConductorSettings(): ConductorSettings {
    return cloneConductorSettings(applyStartupConductorDefaults(
      mainConfigurationService.getValue<Record<string, unknown>>() ?? {},
    ));
  },

  async patchConductorSettings(updates: Record<string, unknown>): Promise<ConductorSettings> {
    const patch = updates && typeof updates === "object" && !Array.isArray(updates)
      ? updates
      : {};
    const nextSettings = normalizeConductorSettings({
      ...this.getConductorSettings(),
      ...patch,
    });

    for (const key of Object.keys(patch)) {
      await mainConfigurationService.updateValue(
        key,
        nextSettings[key],
        ConfigurationTarget.USER,
      );
    }

    return this.getConductorSettings();
  },
};

function configureRuntimeCachePath() {
  const cacheDir = path.join(app.getPath("userData"), "Cache");
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  try {
    app.setPath("cache", cacheDir);
  } catch (error) {
    console.warn("[runtime] Failed to set cache path:", error?.message || error);
  }
}

function configureCodeCachePath() {
  const codeCachePath = process.env.CONDUCTOR_CODE_CACHE_PATH;
  if (!codeCachePath) {
    return;
  }

  const defaultSession = session.defaultSession;
  if (typeof defaultSession.setCodeCachePath !== "function") {
    return;
  }

  defaultSession.setCodeCachePath(path.join(codeCachePath, "chrome"));
}

function handleAnalysisDemoFilesGet() {
  return {
    files: [],
  };
}

function resolveNativeHostEnvironment(sender) {
  const win = BrowserWindow.fromWebContents(sender);
  return resolveNativeHostEnvironmentForWindow(win);
}

function resolveNativeHostEnvironmentForWindow(win) {
  if (!win || win.isDestroyed()) {
    return null;
  }

  return {
    isDesktop: true,
    platform: process.platform,
    isPackaged: app.isPackaged,
    appVersion: app.getVersion(),
    userDataPath: app.getPath("userData"),
  };
}

function handleNativeHostEnvironmentGet(event) {
  event.returnValue = resolveNativeHostEnvironment(event.sender);
}

function getNativeHostChannelWindow(ctx) {
  const windowIdMatch = /^window:(\d+)$/.exec(String(ctx ?? ""));
  if (!windowIdMatch) {
    return null;
  }

  const windowId = Number(windowIdMatch[1]);
  const win = windowId > 0 ? BrowserWindow.fromId(windowId) : null;
  return win && !win.isDestroyed() ? win : null;
}

function getNativeHostChannelArgs(arg: unknown): readonly unknown[] {
  if (Array.isArray(arg)) {
    return arg;
  }

  return typeof arg === "undefined" ? [] : [arg];
}

function createNativeHostChannel(): IServerChannel<string> {
  return {
    call: async <T>(ctx: string, command: string, arg?: unknown): Promise<T> => {
      const win = getNativeHostChannelWindow(ctx);
      const args = getNativeHostChannelArgs(arg);

      if (command === "getEnvironment") {
        return resolveNativeHostEnvironmentForWindow(win) as T;
      }

      if (command === "showOpenDialog") {
        if (!win) {
          return { canceled: true, filePaths: [] } as T;
        }
        const importTraceFolder = process.env.CONDUCTOR_IMPORT_TRACE_FOLDER;
        if (process.env.CONDUCTOR_DEV === "1" && importTraceFolder) {
          return {
            canceled: false,
            filePaths: [importTraceFolder],
          } as T;
        }
        return nativeHostMainService.showOpenDialogForWindow(win, args[0]) as Promise<T>;
      }

      if (command === "showMessageBox") {
        return nativeHostMainService.showMessageBoxForWindow(win, args[0]) as Promise<T>;
      }

      if (command === "showItemInFolder") {
        if (!win) {
          return undefined as T;
        }
        nativeHostMainService.showItemInFolder(args[0]);
        return undefined as T;
      }

      if (command === "isMaximized") {
        return (!!win && win.isMaximized()) as unknown as T;
      }

      if (command === "updateWindowControls") {
        const rawOptions = args[0];
        if (win && rawOptions && typeof rawOptions === "object") {
          const options = rawOptions as Record<string, unknown>;
          desktopWindowMain.updateWindowControls(win, {
            height: typeof options.height === "number" && Number.isFinite(options.height)
              ? Math.max(0, Math.round(options.height))
              : undefined,
            backgroundColor: typeof options.backgroundColor === "string"
              ? options.backgroundColor
              : undefined,
            foregroundColor: typeof options.foregroundColor === "string"
              ? options.foregroundColor
              : undefined,
          });
        }
        return undefined as T;
      }

      if (isNativeWindowCommand(command)) {
        runWindowCommand(win, command);
        return undefined as T;
      }

      throw new Error(`Unknown native host command: ${command}`);
    },
    listen: <T>() => Event.None as Event<T>,
  };
}

function handleWorkbenchBootstrapSettingsGet(event) {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) {
    event.returnValue = null;
    return;
  }

  try {
    event.returnValue = conductorMainConfiguration.getConductorSettings();
  } catch (error) {
    console.warn("[boot] Failed to load initial desktop settings:", error?.message || error);
    event.returnValue = null;
  }
}

function createSharedProcessContributionContext() {
  return {
    analysisHomeDir: getHomeDir(),
    analysisTempRootDir: getTempRootDir(),
    conductorUserDataHomeDir: getConductorUserDataHomeDir(),
    conductorLogHomeDir: getConductorLogHomeDir(),
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

function handleDesktopAppearanceSet(event, payload) {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) {
    return null;
  }

  const styleState = desktopWindowMain.applyWindowStyle(win, {
    appearance: mainThemeService.getWindowAppearance(payload),
  });
  sendDesktopOpaqueSurfaceState(win, styleState);

  return {
    backgroundColor:
      styleState?.opaqueSurfaceBackgroundColor ?? getOpaqueWindowSurfaceBackgroundColor(),
    ok: true,
    opaqueSurface: styleState?.opaqueSurface === true,
  };
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
    return {
      ok: true,
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

function normalizeFileConversionPreparePayload(payload) {
  const rawPath = payload && typeof payload === "object" ? payload.path : payload;
  const inputPath = normalizeAbsoluteFilePath(rawPath);
  const fileName =
    payload && typeof payload.fileName === "string" && payload.fileName.trim()
      ? payload.fileName.trim()
      : inputPath
        ? path.basename(inputPath)
        : "";
  const sourceMtimeMs = payload && typeof payload === "object"
    ? readOptionalNonNegativeNumber(payload.sourceMtimeMs)
    : null;
  const sourceSizeBytes = payload && typeof payload === "object"
    ? readOptionalNonNegativeNumber(payload.sourceSizeBytes)
    : null;

  return {
    fileName,
    inputPath,
    sourceMtimeMs,
    sourceSizeBytes,
  };
}

function createFileConversionPrepareFailure(code, message, durationMs = null) {
  return {
    ok: false,
    code,
    ...(durationMs !== null ? { durationMs } : {}),
    message,
  };
}

function readNonNegativeDurationMs(value, fallback) {
  const durationMs = Number(value);
  return Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : fallback;
}

function readOptionalNonNegativeNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function cloneFileImportPrepareValue(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return value && typeof value === "object"
    ? JSON.parse(JSON.stringify(value))
    : value;
}

function createFileImportPrepareCacheKey(metadata) {
  const inputPath = typeof metadata?.inputPath === "string"
    ? path.normalize(metadata.inputPath)
    : "";
  const sourceSizeBytes = Number(metadata?.sourceSizeBytes);
  const sourceMtimeMs = Number(metadata?.sourceMtimeMs);
  if (!inputPath || !Number.isFinite(sourceSizeBytes) || !Number.isFinite(sourceMtimeMs)) {
    return null;
  }

  return `${inputPath}::${sourceSizeBytes}::${sourceMtimeMs}`;
}

function readFileImportPrepareCache(metadata, startedAt) {
  const key = createFileImportPrepareCacheKey(metadata);
  if (!key || !fileImportPrepareCache.has(key)) {
    return null;
  }

  const cached = fileImportPrepareCache.get(key);
  fileImportPrepareCache.delete(key);
  fileImportPrepareCache.set(key, cached);
  return {
    ...cloneFileImportPrepareValue(cached),
    cacheHit: true,
    durationMs: Date.now() - startedAt,
  };
}

function writeFileImportPrepareCache(metadata, result) {
  if (!result?.ok) {
    return;
  }

  const key = createFileImportPrepareCacheKey(metadata);
  if (!key) {
    return;
  }

  fileImportPrepareCache.set(key, cloneFileImportPrepareValue({
    ...result,
    cacheHit: false,
  }));
  while (fileImportPrepareCache.size > FILE_IMPORT_PREPARE_CACHE_MAX_ENTRIES) {
    const firstKey = fileImportPrepareCache.keys().next().value;
    if (firstKey === undefined) {
      break;
    }
    fileImportPrepareCache.delete(firstKey);
  }
}

function prewarmRustProcessingPool() {
  if (rustProcessingPrewarmPromise) {
    return rustProcessingPrewarmPromise;
  }

  rustProcessingPrewarmPromise = Promise.allSettled(
    Array.from({ length: FILE_IMPORT_BACKGROUND_MAX_ACTIVE }, () =>
      rustPriorityGate.runBackground(() =>
        rustWorkerHost.sendProcessingCommand(
          "clear",
          {},
          { timeoutMs: FILE_IMPORT_PREWARM_TIMEOUT_MS },
        )
      )
    ),
  ).then(() => undefined).catch((error) => {
    console.warn("[rust] processing pool prewarm failed:", error);
  });
  return rustProcessingPrewarmPromise;
}

async function statFileConversionInput(inputPath) {
  try {
    const stat = await fs.promises.stat(inputPath);
    if (!stat.isFile()) {
      return {
        ok: false,
        result: createFileConversionPrepareFailure(
          "INVALID_IMPORT_PATH",
          "Import path is not a file.",
        ),
      };
    }

    return {
      ok: true,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    };
  } catch (error) {
    return {
      ok: false,
      result: createFileConversionPrepareFailure(
        "IMPORT_FILE_NOT_FOUND",
        error?.message || "Import file not found.",
      ),
    };
  }
}

async function resolveFileConversionInputMetadata(payload) {
  const {
    fileName,
    inputPath,
    sourceMtimeMs,
    sourceSizeBytes,
  } = normalizeFileConversionPreparePayload(payload);

  if (!inputPath) {
    return {
      metadata: null,
      ok: false,
      result: createFileConversionPrepareFailure(
        "INVALID_IMPORT_PATH",
        "Invalid import file path.",
      ),
    };
  }

  if (sourceMtimeMs !== null && sourceSizeBytes !== null) {
    return {
      metadata: {
        fileName,
        inputPath,
        sourceMtimeMs,
        sourceSizeBytes,
      },
      ok: true,
      result: null,
    };
  }

  const stat = await statFileConversionInput(inputPath);
  if (!stat.ok) {
    return {
      metadata: null,
      ok: false,
      result: stat.result,
    };
  }

  return {
    metadata: {
      fileName,
      inputPath,
      sourceMtimeMs: stat.mtimeMs,
      sourceSizeBytes: stat.size,
    },
    ok: true,
    result: null,
  };
}

function createPreparedCsvImportResult({
  batchCommandSize = undefined,
  batchDurationMs = undefined,
  batchParallelism = undefined,
  batchWorkerCount = undefined,
  fileName,
  inputPath,
  result,
  sourceMtimeMs,
  sourceSizeBytes,
  startedAt,
}) {
  const durationMs = readNonNegativeDurationMs(
    result?.durationMs,
    Date.now() - startedAt,
  );

  return {
    ok: true,
    assessment: result?.assessment,
    ...(batchCommandSize !== undefined ? { batchCommandSize } : {}),
    ...(batchDurationMs !== undefined ? { batchDurationMs } : {}),
    ...(batchParallelism !== undefined ? { batchParallelism } : {}),
    ...(batchWorkerCount !== undefined ? { batchWorkerCount } : {}),
    columnCount: Number(result?.columnCount) || 0,
    durationMs,
    health: result?.health,
    maxCellLengths: Array.isArray(result?.maxCellLengths)
      ? result.maxCellLengths.map(value => Number(value) || 0)
      : [],
    normalizedCsvPath: inputPath,
    normalizedSizeBytes: sourceSizeBytes,
    rowCount: Number(result?.rowCount) || 0,
    sourceLastModified: sourceMtimeMs,
    sourceName: fileName,
    sourcePath: inputPath,
    sourceSizeBytes,
    source: "rust",
    templateEligibility: typeof result?.templateEligibility === "string"
      ? result.templateEligibility
      : undefined,
  };
}

async function prepareFileConversionFromMetadata(metadata) {
  const { fileName, inputPath, sourceMtimeMs, sourceSizeBytes } = metadata;
  const startedAt = Date.now();

  if (isSupportedRustExcelInputPath(inputPath)) {
    const conversion = await rustPriorityGate.runBackground(() =>
      handleExcelConvertRust(null, {
        path: inputPath,
        returnCsvText: false,
      })
    );
    if (!conversion?.ok) {
      return createFileConversionPrepareFailure(
        conversion?.code || "RUST_IMPORT_PREPARE_FAILED",
        conversion?.message || "Rust import preparation failed.",
        Date.now() - startedAt,
      );
    }
    return {
      ok: true,
      durationMs: Date.now() - startedAt,
      health: {
        state: "ok",
        message: "",
      },
      manifest: conversion.manifest,
      normalizedCsvPath: conversion.csvPath ?? null,
      normalizedSizeBytes: conversion.normalizedSizeBytes,
      sourceName: fileName,
      sourcePath: inputPath,
      sourceSizeBytes,
      source: "rust",
    };
  }

  if (!isSupportedRustInputPath(inputPath)) {
    return createFileConversionPrepareFailure(
      "UNSUPPORTED_IMPORT_FORMAT",
      "Unsupported import file format.",
      Date.now() - startedAt,
    );
  }

  try {
    const cached = readFileImportPrepareCache(metadata, startedAt);
    if (cached) {
      return cached;
    }

    const result = await rustPriorityGate.runBackground(() =>
      rustWorkerHost.sendProcessingCommand("assessImport", {
        fileName,
        path: inputPath,
      })
    );
    const prepared = createPreparedCsvImportResult({
      fileName,
      inputPath,
      result,
      sourceMtimeMs,
      sourceSizeBytes,
      startedAt,
    });
    writeFileImportPrepareCache(metadata, prepared);
    return prepared;
  } catch (error) {
    return createFileConversionPrepareFailure(
      "RUST_IMPORT_PREPARE_FAILED",
      error?.message || "Rust import preparation failed.",
      Date.now() - startedAt,
    );
  }
}

async function prepareFileConversionFromPath(payload) {
  const resolved = await resolveFileConversionInputMetadata(payload);
  if (!resolved.ok || !resolved.metadata) {
    return resolved.result;
  }

  return prepareFileConversionFromMetadata(resolved.metadata);
}

function chunkFileConversionEntries(entries, chunkSize) {
  const chunks = [];
  for (let index = 0; index < entries.length; index += chunkSize) {
    chunks.push(entries.slice(index, index + chunkSize));
  }
  return chunks;
}

function getFileImportRustBatchCommandSize(entryCount) {
  return entryCount > FILE_IMPORT_RUST_BATCH_LARGE_THRESHOLD
    ? FILE_IMPORT_RUST_BATCH_LARGE_COMMAND_SIZE
    : FILE_IMPORT_RUST_BATCH_SMALL_COMMAND_SIZE;
}

function getFileImportRustBatchMaxActive(entryCount) {
  return entryCount > FILE_IMPORT_RUST_BATCH_LARGE_THRESHOLD
    ? Math.min(FILE_IMPORT_RUST_BATCH_MAX_ACTIVE, FILE_IMPORT_RUST_BATCH_LARGE_MAX_ACTIVE)
    : FILE_IMPORT_RUST_BATCH_MAX_ACTIVE;
}

function readBatchImportResults(response) {
  if (Array.isArray(response)) {
    return response;
  }
  if (response && typeof response === "object" && Array.isArray(response.results)) {
    return response.results;
  }
  return [];
}

async function prepareCsvFileConversionBatchChunk(entries, setResult, scheduler) {
  const startedAt = Date.now();
  let response;
  try {
    response = await rustPriorityGate.runBackground(() =>
      rustWorkerHost.sendProcessingCommand("assessImportBatch", {
        entries: entries.map(entry => ({
          fileName: entry.fileName,
          path: entry.inputPath,
        })),
        threads: FILE_IMPORT_RUST_BATCH_PARALLELISM,
      })
    );
  } catch (error) {
    for (const entry of entries) {
      setResult(entry.index, createFileConversionPrepareFailure(
        "RUST_IMPORT_PREPARE_FAILED",
        error?.message || "Rust import preparation failed.",
        Date.now() - startedAt,
      ));
    }
    return;
  }

  const batchResults = readBatchImportResults(response);
  const batchDurationMs = response && typeof response === "object"
    ? readNonNegativeDurationMs(response.durationMs, Date.now() - startedAt)
    : undefined;
  const batchParallelism = response && typeof response === "object" && Number.isFinite(Number(response.parallelism))
    ? Number(response.parallelism)
    : undefined;
  for (let offset = 0; offset < entries.length; offset += 1) {
    const entry = entries[offset];
    const result = batchResults[offset];
    if (!result?.ok) {
      setResult(entry.index, createFileConversionPrepareFailure(
        typeof result?.code === "string" ? result.code : "RUST_IMPORT_PREPARE_FAILED",
        typeof result?.message === "string" && result.message.trim()
          ? result.message
          : "Rust import preparation failed.",
        readNonNegativeDurationMs(result?.durationMs, Date.now() - startedAt),
      ));
      continue;
    }

    const prepared = createPreparedCsvImportResult({
      batchCommandSize: scheduler.batchCommandSize,
      batchDurationMs,
      batchParallelism,
      batchWorkerCount: scheduler.workerCount,
      fileName: entry.fileName,
      inputPath: entry.inputPath,
      result,
      sourceMtimeMs: entry.sourceMtimeMs,
      sourceSizeBytes: entry.sourceSizeBytes,
      startedAt,
    });
    setResult(entry.index, prepared);
    writeFileImportPrepareCache(entry, prepared);
  }
}

async function prepareCsvFileConversionBatchEntries(entries, setResult) {
  if (!entries.length) {
    return;
  }

  const startedAt = Date.now();
  const uncachedEntries = [];
  for (const entry of entries) {
    const cached = readFileImportPrepareCache(entry, startedAt);
    if (cached) {
      setResult(entry.index, cached);
    } else {
      uncachedEntries.push(entry);
    }
  }
  if (!uncachedEntries.length) {
    return;
  }

  const batchCommandSize = getFileImportRustBatchCommandSize(uncachedEntries.length);
  const chunks = chunkFileConversionEntries(
    uncachedEntries,
    batchCommandSize,
  );
  let nextChunkIndex = 0;
  const workerCount = Math.min(
    getFileImportRustBatchMaxActive(uncachedEntries.length),
    chunks.length,
  );

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (true) {
      const chunkIndex = nextChunkIndex;
      nextChunkIndex += 1;
      const chunk = chunks[chunkIndex];
      if (!chunk) {
        return;
      }

      await prepareCsvFileConversionBatchChunk(chunk, setResult, {
        batchCommandSize,
        workerCount,
      });
    }
  }));
}

async function prepareFileConversionsFromPathEntries(entries, onResult = undefined) {
  const results = new Array(entries.length);
  const csvEntries = [];
  const setResult = (index, result) => {
    results[index] = result;
    onResult?.(index, result);
  };

  await Promise.all(entries.map(async (entry, index) => {
    const resolved = await resolveFileConversionInputMetadata(entry);
    if (!resolved.ok || !resolved.metadata) {
      setResult(index, resolved.result);
      return;
    }

    const metadata = {
      ...resolved.metadata,
      index,
    };
    if (isSupportedRustInputPath(metadata.inputPath) && !isSupportedRustExcelInputPath(metadata.inputPath)) {
      csvEntries.push(metadata);
      return;
    }

    const result = await prepareFileConversionFromMetadata(metadata);
    setResult(index, result);
  }));

  csvEntries.sort((a, b) => a.index - b.index);
  await prepareCsvFileConversionBatchEntries(csvEntries, setResult);

  return results;
}

async function handleFileConversionPrepare(_event, payload) {
  return prepareFileConversionFromPath(payload);
}

async function handleFileConversionPrepareBatch(_event, payload) {
  const entries = Array.isArray(payload) ? payload : [];
  if (!entries.length) {
    return [];
  }

  return prepareFileConversionsFromPathEntries(entries);
}

async function handleFileConversionPrepareStream(event, payload) {
  const raw = payload && typeof payload === "object" ? payload : {};
  const entries = Array.isArray(raw.entries) ? raw.entries : [];
  if (!entries.length) {
    return [];
  }

  const requestId = String(raw.requestId ?? "").trim();
  const progressChannel = /^[a-z0-9-]+$/i.test(requestId)
    ? `${ipcChannels.fileConversionPrepareStreamProgress}:${requestId}`
    : null;
  return prepareFileConversionsFromPathEntries(entries, (index, result) => {
    if (progressChannel && !event.sender.isDestroyed()) {
      event.sender.send(progressChannel, {
        index,
        result,
      });
    }
  });
}

async function handleOriginZipSave(event, payload) {
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
      await originHandlers?.runRuntimeCleanup();
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
    prepareToQuitForUpdate: () => {
      trayMainService.markQuitRequested();
      stopAllRustEngines();
    },
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

async function ensureMainWindowVisible() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    await revealMainWindow(mainWindow);
    trayMainService.updateTrayMenu();
    return mainWindow;
  }

  const win = createMainWindow();
  await revealMainWindow(win);
  trayMainService.updateTrayMenu();
  return win;
}

function createMainWindow() {
  logDesktopBoot("create-window:start");
  const windowIcon = resolveDesktopWindowIconPath();
  mainWindowBootShown = false;
  const theme = syncBootWindowTheme();
  const preloadPath = desktopPreloadPath;

  const win = new BrowserWindow(desktopWindowMain.createBrowserWindowOptions({
    appearance: getAppearanceFromStore(),
    icon: windowIcon,
    isDev,
    preload: preloadPath,
    theme,
  }));
  logDesktopDiagnostic("window:create", {
    isDev,
    isPackaged: app.isPackaged,
    preload: preloadPath,
    cwd: process.cwd(),
    dirname: __dirname,
    desktopPreloadPath,
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
  sendDesktopOpaqueSurfaceState(mainWindow, desktopWindowMain.applyWindowStyle(mainWindow, {
    appearance: getAppearanceFromStore(),
    theme,
  }));
  win.on("close", (event) => {
    trayMainService.handleWindowClose(win, event);
  });
  const syncWindowAppearance = () => {
    sendDesktopOpaqueSurfaceState(win, desktopWindowMain.applyWindowStyle(win, {
      appearance: getAppearanceFromStore(),
    }));
  };
  win.on("show", () => {
    syncWindowAppearance();
    trayMainService.updateTrayMenu();
  });
  win.on("hide", () => {
    syncWindowAppearance();
    trayMainService.updateTrayMenu();
  });
  win.on("focus", syncWindowAppearance);
  win.on("blur", syncWindowAppearance);
  win.on("minimize", () => {
    trayMainService.updateTrayMenu();
  });
  win.on("restore", () => {
    trayMainService.updateTrayMenu();
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
  if (!isNativeWindowCommand(command)) return;

  desktopWindowMain.runCommand(win, command, {
    minimizeToTray: (targetWindow) => {
      trayMainService.hideWindowToTray(targetWindow, { showTrayHint: true });
      trayMainService.updateTrayMenu();
    },
    onDidMinimize: () => trayMainService.updateTrayMenu(),
    quit: () => trayMainService.requestQuit(),
    shouldMinimizeToTrayOnClose: () => trayMainService.shouldMinimizeToTrayOnWindowClose(),
  });
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

  if (command === "apply-specific-update") {
    const packagePath =
      payload && typeof payload.packagePath === "string" ? payload.packagePath : "";
    if (packagePath) {
      void updateService?.applySpecificUpdate(packagePath);
    }
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

if (hasSingleInstanceLock) {
  app.on("second-instance", () => {
    if (app.isReady()) {
      void ensureMainWindowVisible();
      return;
    }

    void app.whenReady().then(() => ensureMainWindowVisible());
  });

  app.whenReady().then(async () => {
  logDesktopBoot("app:ready");
  if (isWindows) {
    app.setAppUserModelId(APP_USER_MODEL_ID);
  }
  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
  }
  configureRuntimeCachePath();
  configureCodeCachePath();
  await mainConfigurationService.initialize();
  runSharedProcessStartupContributions(createSharedProcessContributionContext());
  trayMainService.createTray();
  updateService = createUpdateService();
  mainProcessServer.registerChannel(
    LOCAL_FILE_SYSTEM_CHANNEL_NAME,
    new DiskFileSystemProviderChannel(localFileSystemProvider),
  );
  mainProcessServer.registerChannel(
    STORAGE_CHANNEL_NAME,
    new StorageMainChannel(mainStorageService),
  );
  mainProcessServer.registerChannel(nativeHostChannelName, createNativeHostChannel());

  ipcMain.on("desktop-command", handleDesktopCommand);
  ipcMain.on(nativeHostBootstrapIpcChannels.windowCommand, handleNativeWindowCommand);
  registerContextMenuListener();
  ipcMain.handle(nativeHostBootstrapIpcChannels.environmentGet, event =>
    resolveNativeHostEnvironment(event.sender),
  );
  ipcMain.on(nativeHostBootstrapIpcChannels.environmentGet, handleNativeHostEnvironmentGet);
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
  ipcMain.handle(ipcChannels.desktopAutoUpdateApplySpecific, (_event, packagePath: unknown) =>
    typeof packagePath === "string" && packagePath.trim()
      ? updateService?.applySpecificUpdate(packagePath)
      : undefined,
  );
  ipcMain.handle(ipcChannels.desktopAppearanceSet, handleDesktopAppearanceSet);
  ipcMain.handle(ipcChannels.fileConversionPrepare, handleFileConversionPrepare);
  ipcMain.handle(ipcChannels.fileConversionPrepareBatch, handleFileConversionPrepareBatch);
  ipcMain.handle(ipcChannels.fileConversionPrepareStream, handleFileConversionPrepareStream);
  ipcMain.handle(ipcChannels.excelConvertRust, (event, payload) =>
    rustPriorityGate.runBackground(() => handleExcelConvertRust(event, payload)),
  );
  ipcMain.handle(ipcChannels.excelReadConvertedCsv, handleExcelReadConvertedCsv);
  ipcMain.handle(ipcChannels.demoFilesGet, handleAnalysisDemoFilesGet);
  rustHandlers = registerRustHostChannels({
    ipcChannels,
    ipcMain,
    runForeground: task => rustPriorityGate.runForeground(task),
    rustService: new RustHostService({
      createOriginExportTempPath: createRustOriginExportTempPath,
      createRustProcessingResultTempDir,
      hydrateRustProcessingResultRefs,
      isRustProcessFileConfigSupported,
      isSupportedInputPath: isSupportedRustInputPath,
      rustWorkerHost,
    }),
  });
  ipcMain.handle(
    ipcChannels.originZipSave,
    handleOriginZipSave,
  );
  originHandlers = registerOriginMainHandlers({
    dialog,
    ipcChannels,
    ipcMain,
    isWindows,
    logDetectionResult: logOriginDetectionResult,
    originMainService,
    originCsvScriptPath: ORIGIN_CSV_SCRIPT_PATH,
    originCsvWorkerPath: ORIGIN_CSV_WORKER_PATH,
    runtimeRootDir: getOriginRuntimeRootDir,
  });
  void prewarmRustProcessingPool();
  themeMainServiceListener = mainThemeService.onDidChangeColorScheme(() => syncBootWindowTheme());
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
  if (trayMainService.shouldKeepProcessAliveAfterAllWindowsClosed()) return;
  stopAllRustEngines();
  app.quit();
});

app.on("before-quit", () => {
  trayMainService.markQuitRequested();
  stopAllRustEngines();
});

app.on("will-quit", () => {
  trayMainService.markQuitRequested();
  updateService?.stopPolling();
  themeMainServiceListener?.dispose();
  themeMainServiceListener = null;
  mainInstantiationService.dispose();
  runSharedProcessShutdownContributions(createSharedProcessContributionContext());
  stopAllRustEngines();
  rustHandlers?.dispose();
  rustHandlers = null;
  originHandlers?.dispose();
  originHandlers = null;
  trayMainService.destroy();
  ipcMain.removeListener("desktop-command", handleDesktopCommand);
  ipcMain.removeListener(nativeHostBootstrapIpcChannels.windowCommand, handleNativeWindowCommand);
  ipcMain.removeHandler(nativeHostBootstrapIpcChannels.environmentGet);
  ipcMain.removeListener(nativeHostBootstrapIpcChannels.environmentGet, handleNativeHostEnvironmentGet);
  ipcMain.removeListener(
    ipcChannels.desktopAutoUpdateStatusGet,
    handleDesktopAutoUpdateStatusGet,
  );
  ipcMain.removeListener(workbenchBootstrapIpcChannels.settingsGet, handleWorkbenchBootstrapSettingsGet);
  ipcMain.removeHandler(workbenchBootstrapIpcChannels.uiReady);
  ipcMain.removeHandler(ipcChannels.desktopAutoUpdateCheck);
  ipcMain.removeHandler(ipcChannels.desktopAutoUpdateCheckAndInstall);
  ipcMain.removeHandler(ipcChannels.desktopAutoUpdateInstallDownloaded);
  ipcMain.removeHandler(ipcChannels.desktopAutoUpdateApplySpecific);
  ipcMain.removeHandler(ipcChannels.desktopAppearanceSet);
  ipcMain.removeHandler(ipcChannels.fileConversionPrepare);
  ipcMain.removeHandler(ipcChannels.fileConversionPrepareBatch);
  ipcMain.removeHandler(ipcChannels.fileConversionPrepareStream);
  ipcMain.removeHandler(ipcChannels.excelConvertRust);
  ipcMain.removeHandler(ipcChannels.excelReadConvertedCsv);
  ipcMain.removeHandler(ipcChannels.demoFilesGet);
  ipcMain.removeHandler(ipcChannels.originZipSave);
});
}
