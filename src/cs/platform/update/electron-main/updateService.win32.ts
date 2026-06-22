import crypto from "node:crypto";
import fs from "node:fs";
import http, { type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { App, BrowserWindow, Dialog, MessageBoxOptions } from "electron";
import { createRequire } from "node:module";
import path from "node:path";
import { Transform } from "node:stream";

export type DesktopUpdateChannel =
  | "github"
  | "generic"
  | "store"
  | "none"
  | "unsupported";

export type DesktopUpdateState =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "updating"
  | "error"
  | "disabled"
  | "unsupported";

export interface DesktopUpdateStatus {
  readonly status: DesktopUpdateState;
  readonly version: string | null;
  readonly channel: DesktopUpdateChannel;
  readonly isStoreManaged: boolean;
  readonly message: string | null;
  readonly progressPercent: number | null;
}

export interface Win32UpdateServiceOptions {
  readonly app: App;
  readonly appDisplayName: string;
  readonly dialog: Dialog;
  readonly isWindowsStorePackage: boolean;
  readonly packageJsonPath: string;
  readonly getDialogWindow: () => BrowserWindow | null;
  readonly onStatusChange: (status: DesktopUpdateStatus) => void;
  readonly prepareToQuitForUpdate?: () => void;
  readonly localize: (key: string, vars?: Record<string, unknown>) => string;
  readonly log: (message: string) => void;
  readonly warn: (message: string, error?: unknown) => void;
}

const AUTO_UPDATE_INITIAL_DELAY_MS = 15 * 1000;
const AUTO_UPDATE_INTERVAL_MS = 4 * 60 * 60 * 1000;
const AUTO_UPDATE_SUPPORTED_PLATFORMS = new Set(["win32"]);
const LOCAL_PACKAGE_FEED_DEFAULT_THROTTLE_KBPS = 4096;
const LOCAL_PACKAGE_FEED_THROTTLE_ENV = "CONDUCTOR_UPDATE_DEBUG_THROTTLE_KBPS";
const PACKAGED_AUTO_UPDATE_CONFIG = {
  provider: "github",
  owner: "chogng",
  repo: "conductor-update",
  releaseType: "release",
};

const require = createRequire(import.meta.url);

const normalizeAutoUpdateUrl = (value: unknown) => {
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
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error || "");

const normalizeProgressPercent = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
};

const getLocalPackageFeedThrottleBytesPerSecond = (): number => {
  const rawValue = process.env[LOCAL_PACKAGE_FEED_THROTTLE_ENV];
  if (rawValue === undefined || rawValue.trim() === "") {
    return LOCAL_PACKAGE_FEED_DEFAULT_THROTTLE_KBPS * 1024;
  }

  const kbps = Number(rawValue);
  if (!Number.isFinite(kbps) || kbps < 0) {
    return LOCAL_PACKAGE_FEED_DEFAULT_THROTTLE_KBPS * 1024;
  }

  return Math.round(kbps * 1024);
};

const createLocalPackageThrottleStream = (bytesPerSecond: number): Transform => {
  let nextChunkAt = Date.now();

  return new Transform({
    transform(chunk, _encoding, callback) {
      const now = Date.now();
      const chunkBytes = Buffer.isBuffer(chunk)
        ? chunk.byteLength
        : Buffer.byteLength(String(chunk));
      const delayMs = Math.max(0, nextChunkAt - now);
      nextChunkAt = Math.max(now, nextChunkAt) +
        Math.ceil((chunkBytes / bytesPerSecond) * 1000);

      setTimeout(() => callback(null, chunk), delayMs);
    },
  });
};

const resolveAutoUpdateFeedUrl = () =>
  normalizeAutoUpdateUrl(
    process.env.CONDUCTOR_UPDATE_URL ||
      process.env.ANALYSIS_UPDATE_URL ||
      process.env.APP_UPDATE_URL ||
      null,
  );

const readJsonFile = (filePath: string) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
};

export class Win32UpdateService {
  private autoUpdater: any = null;
  private autoUpdateTimer: NodeJS.Timeout | null = null;
  private autoUpdateConfiguredFeedUrl: string | null = null;
  private autoUpdateListenersRegistered = false;
  private isAutoUpdateConfigured = false;
  private autoUpdateInstallAfterDownloadRequested = false;
  private localPackageFeedServer: Server | null = null;
  private status: DesktopUpdateStatus = {
    status: "idle",
    version: null,
    channel: "none",
    isStoreManaged: false,
    message: null,
    progressPercent: null,
  };

  constructor(private readonly options: Win32UpdateServiceOptions) {}

  getStatus(): DesktopUpdateStatus {
    return { ...this.status };
  }

  stopPolling(): void {
    if (this.autoUpdateTimer) {
      clearInterval(this.autoUpdateTimer);
      this.autoUpdateTimer = null;
    }
    this.stopLocalPackageFeedServer();
  }

  async setup(): Promise<void> {
    if (!this.options.app.isPackaged) {
      this.setStatus("disabled", null, "none", this.options.localize("update.disabledDevelopment"));
      return;
    }

    if (this.options.isWindowsStorePackage) {
      // Store builds must not use electron-updater. Microsoft Store/MSIX owns install,
      // download, verification, and replacement for packages acquired from the Store.
      this.setStatus(
        "idle",
        null,
        "store",
        this.options.localize("update.storeManagedMessage"),
      );
      this.options.log("[update] Microsoft Store package detected; Store manages updates.");
      return;
    }

    if (!AUTO_UPDATE_SUPPORTED_PLATFORMS.has(process.platform)) {
      this.setStatus("unsupported", null, "unsupported", this.options.localize("update.unsupportedWindowsOnly"));
      this.options.log(`[update] Skipped for unsupported platform: ${process.platform}`);
      return;
    }

    const updater = await this.ensureAutoUpdater();
    if (!updater || !this.autoUpdater) {
      this.setStatus("disabled", null, "none", "electron-updater is unavailable.");
      this.options.warn("[update] electron-updater dependency is missing.");
      return;
    }

    const feedUrl = resolveAutoUpdateFeedUrl();
    this.isAutoUpdateConfigured = true;
    this.autoUpdateConfiguredFeedUrl = feedUrl || "github-release";

    this.autoUpdater.autoDownload = true;
    this.autoUpdater.autoInstallOnAppQuit = true;

    if (feedUrl) {
      try {
        this.autoUpdater.setFeedURL({
          provider: "generic",
          url: feedUrl,
        });
        this.setStatus("idle", null, "generic", `Using update feed: ${feedUrl}`);
        this.options.log(`[update] Using custom generic feed URL: ${feedUrl}`);
      } catch (error) {
        this.isAutoUpdateConfigured = false;
        this.autoUpdateConfiguredFeedUrl = null;
        this.setStatus("disabled", null, "none", "Invalid custom update feed URL.");
        this.options.warn("[update] Invalid custom feed URL.", error);
        return;
      }
    } else {
      const packagedUpdateConfig = this.resolvePackagedAutoUpdateConfig();
      if (!packagedUpdateConfig) {
        this.isAutoUpdateConfigured = false;
        this.autoUpdateConfiguredFeedUrl = null;
        this.setStatus("disabled", null, "none", "Packaged update provider is missing.");
        this.options.warn("[update] Packaged updater provider configuration is missing.");
        return;
      }

      this.autoUpdater.setFeedURL(packagedUpdateConfig);
      this.autoUpdateConfiguredFeedUrl = `${packagedUpdateConfig.provider}:${packagedUpdateConfig.owner}/${packagedUpdateConfig.repo}`;
      this.setStatus("idle", null, "github", "Using GitHub Releases update channel.");
      this.options.log("[update] Using packaged GitHub updater provider configuration.");
    }

    this.registerUpdaterListeners();

    setTimeout(() => {
      void this.checkForUpdates();
    }, AUTO_UPDATE_INITIAL_DELAY_MS);

    this.stopPolling();
    this.autoUpdateTimer = setInterval(() => {
      void this.checkForUpdates();
    }, AUTO_UPDATE_INTERVAL_MS);
  }

  async checkForUpdates({ manual = false } = {}): Promise<unknown> {
    if (this.status.isStoreManaged) {
      if (manual) {
        await this.showStoreManagedDialog();
      }
      return null;
    }

    const updater = await this.ensureAutoUpdater();
    if (!updater || !this.autoUpdater) return null;

    if (!this.isAutoUpdateConfigured) {
      this.setStatus("disabled", null, "none", this.options.localize("update.notEnabled"));
      if (manual) {
        await this.showInfoDialog(this.options.localize("update.notEnabled"));
      }
      return null;
    }

    try {
      const result = await this.autoUpdater.checkForUpdates();
      if (manual && result && result.isUpdateAvailable === false) {
        await this.showInfoDialog(this.options.localize("update.alreadyLatest"));
      }
      return result;
    } catch (error) {
      this.options.warn("[update] Check failed.", error);
      this.setStatus("error", null, this.status.channel, this.options.localize("update.checkFailedMessage"));

      if (manual) {
        await this.showMessageBox({
          type: "error",
          title: this.options.appDisplayName,
          message: this.options.localize("update.checkFailedMessage"),
          detail: this.options.localize("update.checkFailedDetail", {
            reason: this.getFailureDetail(error),
          }),
          buttons: [this.options.localize("update.ok")],
          defaultId: 0,
          noLink: true,
        });
      }
      return null;
    }
  }

  async checkForUpdatesAndInstall(): Promise<boolean> {
    if (this.status.isStoreManaged) {
      await this.showStoreManagedDialog();
      return false;
    }

    if (this.getStatus().status === "downloaded") {
      return this.installDownloadedUpdate();
    }

    this.autoUpdateInstallAfterDownloadRequested = true;
    const result: any = await this.checkForUpdates({ manual: true });
    if (!result || result.isUpdateAvailable === false) {
      this.autoUpdateInstallAfterDownloadRequested = false;
      return false;
    }

    try {
      if (result.downloadPromise && typeof result.downloadPromise.then === "function") {
        await result.downloadPromise;
      }
    } catch (error) {
      this.autoUpdateInstallAfterDownloadRequested = false;
      this.setStatus("error", null, this.status.channel, "Update download failed.");
      this.options.warn("[update] Download before install failed.", error);
      return false;
    }

    if (this.status.status === "downloaded") {
      return this.installDownloadedUpdate();
    }

    return true;
  }

  async installDownloadedUpdate(): Promise<boolean> {
    if (this.status.isStoreManaged) {
      await this.showStoreManagedDialog();
      return false;
    }

    const updater = await this.ensureAutoUpdater();
    if (!updater || !this.autoUpdater) return false;
    if (this.status.status !== "downloaded") return false;

    this.autoUpdateInstallAfterDownloadRequested = false;
    this.setStatus("updating");
    this.prepareToQuitForUpdate();
    // Run the NSIS updater silently and relaunch the app when installation finishes.
    this.autoUpdater.quitAndInstall(true, true);
    return true;
  }

  async applySpecificUpdate(packagePath: string): Promise<boolean> {
    if (this.status.isStoreManaged) {
      await this.showStoreManagedDialog();
      return false;
    }

    if (!AUTO_UPDATE_SUPPORTED_PLATFORMS.has(process.platform)) {
      const message = this.options.localize("update.unsupportedWindowsOnly");
      this.setStatus("unsupported", null, "unsupported", message);
      await this.showInfoDialog(message);
      return false;
    }

    if (!this.options.app.isPackaged) {
      const message = this.options.localize("update.disabledDevelopment");
      this.setStatus("disabled", null, "none", message);
      await this.showInfoDialog(message);
      return false;
    }

    const resolvedPackagePath = path.resolve(packagePath.trim());
    if (path.extname(resolvedPackagePath).toLowerCase() !== ".exe") {
      await this.showInfoDialog(this.options.localize("update.localPackageInvalid"));
      return false;
    }

    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(resolvedPackagePath);
    } catch (error) {
      this.options.warn("[update] Local update package not found.", error);
      await this.showInfoDialog(this.options.localize("update.localPackageNotFound"));
      return false;
    }

    if (!stat.isFile()) {
      await this.showInfoDialog(this.options.localize("update.localPackageInvalid"));
      return false;
    }

    const updater = await this.ensureAutoUpdater();
    if (!updater || !this.autoUpdater) {
      this.setStatus("disabled", null, "none", "electron-updater is unavailable.");
      this.options.warn("[update] electron-updater dependency is missing.");
      return false;
    }

    const feed = await this.prepareLocalPackageFeed(resolvedPackagePath);
    this.registerUpdaterListeners();
    this.isAutoUpdateConfigured = true;
    this.autoUpdateConfiguredFeedUrl = feed.url;
    this.autoUpdateInstallAfterDownloadRequested = false;
    this.autoUpdater.autoDownload = true;
    this.autoUpdater.autoInstallOnAppQuit = true;
    this.autoUpdater.disableDifferentialDownload = true;
    this.autoUpdater.updateInfoAndProvider = null;
    this.autoUpdater.checkForUpdatesPromise = null;
    this.autoUpdater.downloadPromise = null;
    await this.clearDownloadedUpdateCache();
    this.autoUpdater.setFeedURL({
      provider: "generic",
      url: feed.url,
    });

    this.setStatus(
      "idle",
      feed.version,
      "generic",
      this.options.localize("update.localPackageFeedMessage", { path: resolvedPackagePath }),
    );
    this.options.log(`[update] Using local update package: ${resolvedPackagePath}`);
    const result: any = await this.checkForUpdates({ manual: true });
    return !!result && result.isUpdateAvailable !== false;
  }

  private async clearDownloadedUpdateCache(): Promise<void> {
    if (!this.autoUpdater) return;

    try {
      const helper = typeof this.autoUpdater.getOrCreateDownloadHelper === "function"
        ? await this.autoUpdater.getOrCreateDownloadHelper()
        : this.autoUpdater.downloadedUpdateHelper;
      if (helper && typeof helper.clear === "function") {
        await helper.clear();
      }
    } catch (error) {
      this.options.warn("[update] Failed to clear local update package cache.", error);
    }
  }

  private prepareToQuitForUpdate(): void {
    try {
      this.options.prepareToQuitForUpdate?.();
    } catch (error) {
      this.options.warn("[update] Failed to prepare app quit for update install.", error);
    }
    this.stopPolling();
  }

  private async ensureAutoUpdater() {
    if (this.autoUpdater) return this.autoUpdater;

    try {
      ({ autoUpdater: this.autoUpdater } = require("electron-updater"));
    } catch (error) {
      this.options.warn("[update] electron-updater is unavailable.", error);
      this.autoUpdater = null;
    }

    return this.autoUpdater;
  }

  private resolvePackagedAutoUpdateConfig() {
    const packageJson = readJsonFile(this.options.packageJsonPath);
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
  }

  private registerUpdaterListeners(): void {
    if (!this.autoUpdater) return;
    if (this.autoUpdateListenersRegistered) return;
    this.autoUpdateListenersRegistered = true;

    this.autoUpdater.on("checking-for-update", () => {
      this.setStatus("checking");
      this.options.log("[update] Checking for updates...");
    });

    this.autoUpdater.on("update-available", (info: any) => {
      this.setStatus("available", info?.version || null);
      this.options.log(`[update] Update ${info?.version || "unknown"} is available.`);
    });

    this.autoUpdater.on("download-progress", (progress: any) => {
      const progressPercent = normalizeProgressPercent(progress?.percent);
      this.setStatus(
        "downloading",
        this.status.version,
        this.status.channel,
        this.status.message,
        progressPercent,
      );
      this.options.log(
        progressPercent === null
          ? "[update] Downloading update..."
          : `[update] Downloading update... ${progressPercent}%`,
      );
    });

    this.autoUpdater.on("update-not-available", (info: any) => {
      this.autoUpdateInstallAfterDownloadRequested = false;
      this.setStatus("idle", info?.version || null);
      this.options.log(
        `[update] No update available. Current=${this.options.app.getVersion()}, latest=${info?.version || "unknown"}.`,
      );
    });

    this.autoUpdater.on("error", (error: unknown) => {
      this.autoUpdateInstallAfterDownloadRequested = false;
      this.setStatus("error", null, this.status.channel, this.options.localize("update.failed"));
      this.options.warn("[update] Error.", error);
    });

    this.autoUpdater.on("update-downloaded", (info: any) => {
      this.setStatus("downloaded", info?.version || null);
      this.options.log(
        `[update] Update ${info?.version || "unknown"} downloaded from ${this.autoUpdateConfiguredFeedUrl}.`,
      );
      if (this.autoUpdateInstallAfterDownloadRequested) {
        void this.installDownloadedUpdate();
      }
    });
  }

  private setStatus(
    status: DesktopUpdateState,
    version = this.status.version,
    channel = this.status.channel,
    message = this.status.message,
    progressPercent: number | null = null,
  ): void {
    this.status = {
      status,
      version: typeof version === "string" && version.trim() ? version.trim() : null,
      channel,
      isStoreManaged: channel === "store",
      message: typeof message === "string" && message.trim() ? message.trim() : null,
      progressPercent: normalizeProgressPercent(progressPercent),
    };
    this.options.onStatusChange(this.getStatus());
  }

  private async showInfoDialog(message: string): Promise<void> {
    await this.showMessageBox({
      type: "info",
      title: this.options.appDisplayName,
      message,
      buttons: [this.options.localize("update.ok")],
      defaultId: 0,
      noLink: true,
    });
  }

  private async showStoreManagedDialog(): Promise<void> {
    await this.showMessageBox({
      type: "info",
      title: this.options.appDisplayName,
      message: this.options.localize("update.storeManagedMessage"),
      detail: this.options.localize("update.storeManagedDetail"),
      buttons: [this.options.localize("update.ok")],
      defaultId: 0,
      noLink: true,
    });
  }

  private getFailureDetail(error: unknown): string {
    const message = getErrorMessage(error).trim();
    if (!message) {
      return this.options.localize("update.retrySuggestion");
    }

    return this.options.localize("update.errorReasonPrefix", { message });
  }

  private async showMessageBox(options: MessageBoxOptions): Promise<void> {
    const win = this.options.getDialogWindow();
    if (win) {
      await this.options.dialog.showMessageBox(win, options);
      return;
    }

    await this.options.dialog.showMessageBox(options);
  }

  private async prepareLocalPackageFeed(packagePath: string): Promise<{ readonly url: string; readonly version: string }> {
    const feedDir = path.join(this.options.app.getPath("userData"), "update-debug-feed");
    await fs.promises.rm(feedDir, { force: true, recursive: true });
    await fs.promises.mkdir(feedDir, { recursive: true });

    const packageName = path.basename(packagePath);
    const feedPackagePath = path.join(feedDir, packageName);
    await fs.promises.copyFile(packagePath, feedPackagePath);
    const packageStat = await fs.promises.stat(feedPackagePath);
    const sha512 = await this.computeFileSha512(feedPackagePath);
    const version = this.getNextDebugUpdateVersion();
    const releaseDate = new Date().toISOString();
    const latestYml = [
      `version: ${version}`,
      "files:",
      `  - url: ${JSON.stringify(packageName)}`,
      `    sha512: ${sha512}`,
      `    size: ${packageStat.size}`,
      `path: ${JSON.stringify(packageName)}`,
      `sha512: ${sha512}`,
      `releaseDate: '${releaseDate}'`,
      "",
    ].join("\n");

    await fs.promises.writeFile(path.join(feedDir, "latest.yml"), latestYml, "utf8");
    const url = await this.startLocalPackageFeedServer(feedDir);
    return { url, version };
  }

  private async startLocalPackageFeedServer(feedDir: string): Promise<string> {
    this.stopLocalPackageFeedServer();

    const server = http.createServer((request, response) => {
      this.serveLocalPackageFeedFile(feedDir, request, response);
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });

    this.localPackageFeedServer = server;
    const address = server.address();
    if (!address || typeof address === "string") {
      this.stopLocalPackageFeedServer();
      throw new Error("Failed to start local update package feed.");
    }

    return `http://127.0.0.1:${address.port}`;
  }

  private stopLocalPackageFeedServer(): void {
    const server = this.localPackageFeedServer;
    if (!server) return;

    this.localPackageFeedServer = null;
    server.close(error => {
      if (error) {
        this.options.warn("[update] Failed to stop local update package feed.", error);
      }
    });
  }

  private serveLocalPackageFeedFile(
    feedDir: string,
    request: IncomingMessage,
    response: ServerResponse,
  ): void {
    const pathname = decodeURIComponent(
      new URL(request.url || "/", "http://127.0.0.1").pathname,
    );
    const target = path.resolve(feedDir, `.${pathname.replace(/\//g, path.sep)}`);
    if (!this.isPathInside(feedDir, target)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    fs.promises.stat(target).then(stat => {
      if (!stat.isFile()) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      response.writeHead(200, {
        "Content-Length": stat.size,
        "Content-Type": path.extname(target).toLowerCase() === ".yml"
          ? "text/yaml; charset=utf-8"
          : "application/octet-stream",
      });

      const stream = fs.createReadStream(target);
      stream.on("error", error => response.destroy(error));
      const throttleBytesPerSecond = path.extname(target).toLowerCase() === ".yml"
        ? 0
        : getLocalPackageFeedThrottleBytesPerSecond();
      if (throttleBytesPerSecond > 0) {
        stream.pipe(createLocalPackageThrottleStream(throttleBytesPerSecond)).pipe(response);
        return;
      }

      stream.pipe(response);
    }, () => {
      response.writeHead(404);
      response.end("Not found");
    });
  }

  private isPathInside(root: string, target: string): boolean {
    const relative = path.relative(root, target);
    return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
  }

  private computeFileSha512(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash("sha512");
      const stream = fs.createReadStream(filePath);
      stream.on("error", reject);
      stream.on("data", chunk => hash.update(chunk));
      stream.on("end", () => resolve(hash.digest("base64")));
    });
  }

  private getNextDebugUpdateVersion(): string {
    const match = /^(\d+)\.(\d+)\.(\d+)/.exec(this.options.app.getVersion());
    if (!match) {
      return "999.999.999";
    }

    return `${Number(match[1])}.${Number(match[2])}.${Number(match[3]) + 1}`;
  }
}
