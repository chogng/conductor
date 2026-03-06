const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require("electron");
const {
  assertOriginExePath,
  detectOriginExecutablePath,
  normalizeOriginExePath,
  pickOriginExecutable,
  runOriginBatchJob,
  runOriginHealthCheck,
  runOriginZipJob,
} = require("./origin-runner.cjs");

const isDev = !app.isPackaged;
const isWindows = process.platform === "win32";
const devUrl = process.env.ELECTRON_START_URL || "http://127.0.0.1:5174/";
const DEVICE_ANALYSIS_STORE_FILENAME = "config.json";
const DEVICE_ANALYSIS_STORE_CONFIG_FILENAME = "store-path.json";
const DEVICE_ANALYSIS_SETTINGS_FILENAME_SUFFIX = ".settings.json";
const DEVICE_ANALYSIS_SS_METHODS = new Set(["auto", "manual", "idWindow", "legacy"]);
const DEVICE_ANALYSIS_Y_UNITS = new Set(["A", "uA", "nA"]);

const DEVICE_ANALYSIS_DEFAULT_SETTINGS = {
  defaultTemplate: null,
  lastTemplateId: null,
  stopOnErrorDefault: false,
  yUnit: "A",
  ssMethodDefault: "auto",
  ssDiagnosticsEnabled: true,
  ssShowFitLine: true,
  ssIdLow: 1e-11,
  ssIdHigh: 1e-9,
  originExePath: null,
};

let deviceAnalysisStoreConfigCache = null;
let deviceAnalysisStoreCache = null;
let deviceAnalysisStoreCachePath = null;
let deviceAnalysisSettingsCache = null;
let deviceAnalysisSettingsCachePath = null;

function cloneStoreConfig(config) {
  return normalizeStoreConfig(config);
}

function cloneStoreData(store) {
  return normalizeStoreData(store);
}

function cloneDeviceAnalysisSettings(settings) {
  return normalizeDeviceAnalysisSettings(settings);
}

function clearDeviceAnalysisStoreCache() {
  deviceAnalysisStoreCache = null;
  deviceAnalysisStoreCachePath = null;
}

function clearDeviceAnalysisSettingsCache() {
  deviceAnalysisSettingsCache = null;
  deviceAnalysisSettingsCachePath = null;
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
function resolveOriginWorkerScriptPath() {
  if (!app.isPackaged) {
    return path.join(__dirname, "..", "origin", "run_origin_job.ps1");
  }

  const unpackedPath = path.join(
    process.resourcesPath,
    "app.asar.unpacked",
    "origin",
    "run_origin_job.ps1",
  );
  if (fs.existsSync(unpackedPath)) {
    return unpackedPath;
  }

  return path.join(
    process.resourcesPath,
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
    process.resourcesPath,
    "app.asar.unpacked",
    "origin",
    "run_origin_batch.py",
  );
  if (fs.existsSync(unpackedPath)) {
    return unpackedPath;
  }

  return path.join(
    process.resourcesPath,
    "app.asar",
    "origin",
    "run_origin_batch.py",
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
    path.join(process.resourcesPath, "origin", "bin", "origin-batch-worker.exe"),
    path.join(
      process.resourcesPath,
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
    path.join(process.resourcesPath, "origin", "bin", "origin-zip-worker.exe"),
    path.join(
      process.resourcesPath,
      "app.asar.unpacked",
      "origin",
      "bin",
      "origin-zip-worker.exe",
    ),
  ]);
}

const ORIGIN_WORKER_SCRIPT_PATH = resolveOriginWorkerScriptPath();
const ORIGIN_BATCH_SCRIPT_PATH = resolveOriginBatchScriptPath();
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
};

function normalizePositiveNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function normalizeDeviceAnalysisSettings(raw) {
  const next = raw && typeof raw === "object" ? { ...raw } : {};

  const ssMethodDefault = DEVICE_ANALYSIS_SS_METHODS.has(next.ssMethodDefault)
    ? next.ssMethodDefault
    : DEVICE_ANALYSIS_SS_METHODS.has(next.ssMethod)
      ? next.ssMethod
      : DEVICE_ANALYSIS_DEFAULT_SETTINGS.ssMethodDefault;

  const yUnit = DEVICE_ANALYSIS_Y_UNITS.has(next.yUnit)
    ? next.yUnit
    : DEVICE_ANALYSIS_DEFAULT_SETTINGS.yUnit;

  const ssDiagnosticsEnabled =
    typeof next.ssDiagnosticsEnabled === "boolean"
      ? next.ssDiagnosticsEnabled
      : DEVICE_ANALYSIS_DEFAULT_SETTINGS.ssDiagnosticsEnabled;

  const ssShowFitLine =
    typeof next.ssShowFitLine === "boolean"
      ? next.ssShowFitLine
      : DEVICE_ANALYSIS_DEFAULT_SETTINGS.ssShowFitLine;

  const stopOnErrorDefault =
    typeof next.stopOnErrorDefault === "boolean"
      ? next.stopOnErrorDefault
      : DEVICE_ANALYSIS_DEFAULT_SETTINGS.stopOnErrorDefault;

  const ssIdLow = normalizePositiveNumber(
    next.ssIdLow ?? next.ssIdWindowLow,
    DEVICE_ANALYSIS_DEFAULT_SETTINGS.ssIdLow,
  );
  const ssIdHigh = normalizePositiveNumber(
    next.ssIdHigh ?? next.ssIdWindowHigh,
    DEVICE_ANALYSIS_DEFAULT_SETTINGS.ssIdHigh,
  );
  const originExePath = normalizeOriginExePath(next.originExePath);

  return {
    ...DEVICE_ANALYSIS_DEFAULT_SETTINGS,
    ...next,
    defaultTemplate: next.defaultTemplate ?? null,
    lastTemplateId: next.lastTemplateId ?? null,
    stopOnErrorDefault,
    yUnit,
    ssMethodDefault,
    ssDiagnosticsEnabled,
    ssShowFitLine,
    ssIdLow,
    ssIdHigh,
    originExePath,
  };
}

function normalizeDeviceAnalysisTemplate(template) {
  if (!template || typeof template !== "object") return null;

  return {
    ...template,
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

function getDeviceAnalysisHomeDir() {
  return path.join(app.getPath("home"), ".device");
}

function getDefaultDeviceAnalysisStorePath() {
  return path.join(getDeviceAnalysisHomeDir(), DEVICE_ANALYSIS_STORE_FILENAME);
}

function getDeviceAnalysisStoreConfigPath() {
  return path.join(getDeviceAnalysisHomeDir(), DEVICE_ANALYSIS_STORE_CONFIG_FILENAME);
}

function getDeviceAnalysisSettingsPath() {
  const storePath = getDeviceAnalysisStorePath();
  const parsed = path.parse(storePath);
  return path.join(parsed.dir, `${parsed.name}${DEVICE_ANALYSIS_SETTINGS_FILENAME_SUFFIX}`);
}

function normalizeStoreConfig(raw) {
  const next = raw && typeof raw === "object" ? raw : {};
  const customStorePath =
    typeof next.customStorePath === "string" && next.customStorePath.trim()
      ? next.customStorePath.trim()
      : null;

  return { customStorePath };
}

function readStoreConfig() {
  if (deviceAnalysisStoreConfigCache) {
    return cloneStoreConfig(deviceAnalysisStoreConfigCache);
  }

  const configPath = getDeviceAnalysisStoreConfigPath();
  if (!fs.existsSync(configPath)) {
    deviceAnalysisStoreConfigCache = { customStorePath: null };
    return cloneStoreConfig(deviceAnalysisStoreConfigCache);
  }

  try {
    const raw = fs.readFileSync(configPath, "utf8");
    if (!raw) {
      deviceAnalysisStoreConfigCache = { customStorePath: null };
      return cloneStoreConfig(deviceAnalysisStoreConfigCache);
    }
    deviceAnalysisStoreConfigCache = normalizeStoreConfig(JSON.parse(raw));
  } catch {
    deviceAnalysisStoreConfigCache = { customStorePath: null };
  }

  return cloneStoreConfig(deviceAnalysisStoreConfigCache);
}

function writeStoreConfig(nextConfig) {
  const normalized = normalizeStoreConfig(nextConfig);
  const configPath = getDeviceAnalysisStoreConfigPath();
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(normalized, null, 2), "utf8");
  deviceAnalysisStoreConfigCache = normalized;
  clearDeviceAnalysisStoreCache();
  clearDeviceAnalysisSettingsCache();
  return cloneStoreConfig(normalized);
}

function getStorePersistenceInfo() {
  const { customStorePath } = readStoreConfig();
  const defaultPath = getDefaultDeviceAnalysisStorePath();
  const currentPath = customStorePath || defaultPath;

  return {
    currentPath,
    defaultPath,
    isCustom: Boolean(customStorePath),
    isConfigurable: true,
  };
}

function getDeviceAnalysisStorePath() {
  return getStorePersistenceInfo().currentPath;
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

function tryReadDeviceAnalysisSettingsFile() {
  const settingsPath = getDeviceAnalysisSettingsPath();
  if (
    deviceAnalysisSettingsCache &&
    deviceAnalysisSettingsCachePath === settingsPath
  ) {
    return cloneDeviceAnalysisSettings(deviceAnalysisSettingsCache);
  }

  if (!fs.existsSync(settingsPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(settingsPath, "utf8");
    const parsed = raw ? JSON.parse(raw) : {};
    deviceAnalysisSettingsCache = normalizeDeviceAnalysisSettings(parsed);
    deviceAnalysisSettingsCachePath = settingsPath;
    return cloneDeviceAnalysisSettings(deviceAnalysisSettingsCache);
  } catch {
    return null;
  }
}

function writeDeviceAnalysisSettings(nextSettings) {
  const settingsPath = getDeviceAnalysisSettingsPath();
  const settingsDir = path.dirname(settingsPath);
  if (!fs.existsSync(settingsDir)) {
    fs.mkdirSync(settingsDir, { recursive: true });
  }

  const normalized = normalizeDeviceAnalysisSettings(nextSettings);
  fs.writeFileSync(settingsPath, JSON.stringify(normalized, null, 2), "utf8");
  deviceAnalysisSettingsCache = normalized;
  deviceAnalysisSettingsCachePath = settingsPath;
  return cloneDeviceAnalysisSettings(normalized);
}

function readDeviceAnalysisSettings() {
  const direct = tryReadDeviceAnalysisSettingsFile();
  if (direct) return direct;

  const defaults = normalizeDeviceAnalysisSettings(DEVICE_ANALYSIS_DEFAULT_SETTINGS);
  deviceAnalysisSettingsCache = defaults;
  deviceAnalysisSettingsCachePath = getDeviceAnalysisSettingsPath();
  return cloneDeviceAnalysisSettings(defaults);
}

function readDeviceAnalysisStore() {
  const storePath = getDeviceAnalysisStorePath();
  if (deviceAnalysisStoreCache && deviceAnalysisStoreCachePath === storePath) {
    return cloneStoreData(deviceAnalysisStoreCache);
  }

  if (!fs.existsSync(storePath)) {
    const defaults = buildDefaultStoreData();
    writeDeviceAnalysisStore(defaults);
    return cloneStoreData(defaults);
  }

  try {
    const raw = fs.readFileSync(storePath, "utf8");
    if (!raw) {
      deviceAnalysisStoreCache = buildDefaultStoreData();
      deviceAnalysisStoreCachePath = storePath;
      return cloneStoreData(deviceAnalysisStoreCache);
    }
    const parsed = JSON.parse(raw);
    deviceAnalysisStoreCache = normalizeStoreData(parsed);
  } catch {
    deviceAnalysisStoreCache = buildDefaultStoreData();
  }

  deviceAnalysisStoreCachePath = storePath;
  return cloneStoreData(deviceAnalysisStoreCache);
}

function writeDeviceAnalysisStore(nextStore) {
  const storePath = getDeviceAnalysisStorePath();
  const storeDir = path.dirname(storePath);
  if (!fs.existsSync(storeDir)) {
    fs.mkdirSync(storeDir, { recursive: true });
  }
  const normalized = normalizeStoreData(nextStore);
  fs.writeFileSync(storePath, JSON.stringify(normalized, null, 2), "utf8");
  deviceAnalysisStoreCache = normalized;
  deviceAnalysisStoreCachePath = storePath;
  return cloneStoreData(normalized);
}

function handleDeviceAnalysisTemplatesGet() {
  return readDeviceAnalysisStore().templates;
}

function handleDeviceAnalysisTemplatesCreate(_event, payload) {
  const input = normalizeDeviceAnalysisTemplate(payload);
  if (!input) throw new Error("Invalid template payload.");
  const inputNameKey = toTemplateNameKey(input.name);
  if (!inputNameKey) throw new Error("Template name is required.");

  const store = readDeviceAnalysisStore();
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
  writeDeviceAnalysisStore(store);
  return saved;
}

function handleDeviceAnalysisTemplatesDelete(_event, id) {
  const templateId = String(id || "").trim();
  if (!templateId) throw new Error("Invalid template id.");

  const store = readDeviceAnalysisStore();
  store.templates = store.templates.filter((tpl) => String(tpl?.id || "") !== templateId);
  writeDeviceAnalysisStore(store);
  return { success: true };
}

function handleDeviceAnalysisSettingsGet() {
  return readDeviceAnalysisSettings();
}

function handleDeviceAnalysisSettingsPatch(_event, updates) {
  const patch = updates && typeof updates === "object" ? updates : {};

  const nextSettings = normalizeDeviceAnalysisSettings({
    ...readDeviceAnalysisSettings(),
    ...patch,
  });
  writeDeviceAnalysisSettings(nextSettings);
  return nextSettings;
}

function handleDeviceAnalysisPersistencePathGet() {
  return getStorePersistenceInfo();
}

function handleDeviceAnalysisPersistencePathSet(_event, payload) {
  const rawPath =
    payload && typeof payload === "object" ? payload.path : payload;
  const nextPath =
    typeof rawPath === "string" && rawPath.trim() ? rawPath.trim() : null;

  const previousPath = getDeviceAnalysisStorePath();
  const previousSettingsPath = getDeviceAnalysisSettingsPath();
  if (!nextPath) {
    writeStoreConfig({ customStorePath: null });
  } else {
    if (!path.isAbsolute(nextPath)) {
      throw new Error("Persistence path must be an absolute file path.");
    }
    writeStoreConfig({ customStorePath: nextPath });
  }

  const currentPath = getDeviceAnalysisStorePath();
  const currentSettingsPath = getDeviceAnalysisSettingsPath();
  migratePersistenceFile(previousPath, currentPath, "device-analysis-store");
  migratePersistenceFile(
    previousSettingsPath,
    currentSettingsPath,
    "device-analysis-settings",
  );

  return getStorePersistenceInfo();
}

async function handleDeviceAnalysisPersistencePathChoose(event) {
  const currentInfo = getStorePersistenceInfo();
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

  const updated = handleDeviceAnalysisPersistencePathSet(null, { path: result.filePath });
  return { ...updated, cancelled: false };
}

function getOriginExePathFromSettings() {
  const settings = readDeviceAnalysisSettings();
  return normalizeOriginExePath(settings?.originExePath);
}

function saveOriginExePathToSettings(originExePath) {
  const normalizedPath = normalizeOriginExePath(originExePath);
  const settings = normalizeDeviceAnalysisSettings({
    ...readDeviceAnalysisSettings(),
    originExePath: normalizedPath,
  });
  writeDeviceAnalysisSettings(settings);
  return settings.originExePath ?? null;
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

  return runOriginHealthCheck({
    originExePath,
    workerScriptPath: ORIGIN_WORKER_SCRIPT_PATH,
  });
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
  const originExePath = await resolveOriginExePath(event);
  if (!originExePath) {
    throw new Error("__ORIGIN_EXE_REQUIRED__");
  }

  return runOriginBatchJob({
    inputDir,
    originExePath,
    batchScriptPath: ORIGIN_BATCH_SCRIPT_PATH,
    batchWorkerPath: ORIGIN_BATCH_WORKER_PATH,
  });
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

  if (!bytes) {
    throw new Error("ZIP payload is missing.");
  }

  const originExePath = await resolveOriginExePath(event);
  if (!originExePath) {
    throw new Error("__ORIGIN_EXE_REQUIRED__");
  }

  return runOriginZipJob({
    zipName,
    bytes,
    originExePath,
    workerScriptPath: ORIGIN_WORKER_SCRIPT_PATH,
    workerExecutablePath: ORIGIN_ZIP_WORKER_PATH,
  });
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
      preload: path.join(__dirname, "preload.cjs"),
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

  if (isDev) {
    void win.loadURL(devUrl);
    return;
  }

  void win.loadFile(path.join(__dirname, "../dist/index.html"));
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

  if (command === "close-window") {
    win.close();
  }
}

app.whenReady().then(() => {
  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
  }

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
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
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
});
