import fs from "node:fs";
import type { App, BrowserWindow, Dialog, MessageBoxOptions } from "electron";
import { createRequire } from "node:module";

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
  | "downloaded"
  | "error"
  | "disabled"
  | "unsupported";

export interface DesktopUpdateStatus {
  readonly status: DesktopUpdateState;
  readonly version: string | null;
  readonly channel: DesktopUpdateChannel;
  readonly isStoreManaged: boolean;
  readonly message: string | null;
}

export interface Win32UpdateServiceOptions {
  readonly app: App;
  readonly appDisplayName: string;
  readonly dialog: Dialog;
  readonly isWindowsStorePackage: boolean;
  readonly packageJsonPath: string;
  readonly getDialogWindow: () => BrowserWindow | null;
  readonly onStatusChange: (status: DesktopUpdateStatus) => void;
  readonly log: (message: string) => void;
  readonly warn: (message: string, error?: unknown) => void;
}

const AUTO_UPDATE_INITIAL_DELAY_MS = 15 * 1000;
const AUTO_UPDATE_INTERVAL_MS = 4 * 60 * 60 * 1000;
const AUTO_UPDATE_SUPPORTED_PLATFORMS = new Set(["win32"]);
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

const resolveAutoUpdateFeedUrl = () =>
  normalizeAutoUpdateUrl(
    process.env.CONDUCTOR_UPDATE_URL ||
      process.env.DEVICE_ANALYSIS_UPDATE_URL ||
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
  private isAutoUpdateConfigured = false;
  private autoUpdateInstallAfterDownloadRequested = false;
  private status: DesktopUpdateStatus = {
    status: "idle",
    version: null,
    channel: "none",
    isStoreManaged: false,
    message: null,
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
  }

  async setup(): Promise<void> {
    if (!this.options.app.isPackaged) {
      this.setStatus("disabled", null, "none", "Auto update is disabled in development.");
      return;
    }

    if (this.options.isWindowsStorePackage) {
      // Store builds must not use electron-updater. Microsoft Store/MSIX owns install,
      // download, verification, and replacement for packages acquired from the Store.
      this.setStatus(
        "idle",
        null,
        "store",
        "Updates are managed by Microsoft Store.",
      );
      this.options.log("[update] Microsoft Store package detected; Store manages updates.");
      return;
    }

    if (!AUTO_UPDATE_SUPPORTED_PLATFORMS.has(process.platform)) {
      this.setStatus("unsupported", null, "unsupported", "Auto update is Windows-only.");
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
      this.setStatus("disabled", null, "none", "Auto update is not enabled in this build.");
      if (manual) {
        await this.showInfoDialog("Auto update is not enabled in this build.");
      }
      return null;
    }

    try {
      const result = await this.autoUpdater.checkForUpdates();
      if (manual && result && result.isUpdateAvailable === false) {
        await this.showInfoDialog("You are already using the latest version.");
      }
      return result;
    } catch (error) {
      this.options.warn("[update] Check failed.", error);
      this.setStatus("error", null, this.status.channel, "Update check failed.");

      if (manual) {
        await this.showMessageBox({
          type: "error",
          title: this.options.appDisplayName,
          message: "检查更新失败",
          detail: `${this.getFailureDetail(error)}\n\n请确认网络或代理设置后重试。`,
          buttons: ["确定"],
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
    this.autoUpdater.quitAndInstall();
    return true;
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

    this.autoUpdater.on("checking-for-update", () => {
      this.setStatus("checking");
      this.options.log("[update] Checking for updates...");
    });

    this.autoUpdater.on("update-available", (info: any) => {
      this.setStatus("available", info?.version || null);
      this.options.log(`[update] Update ${info?.version || "unknown"} is available.`);
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
      this.setStatus("error", null, this.status.channel, "Auto update failed.");
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
  ): void {
    this.status = {
      status,
      version: typeof version === "string" && version.trim() ? version.trim() : null,
      channel,
      isStoreManaged: channel === "store",
      message: typeof message === "string" && message.trim() ? message.trim() : null,
    };
    this.options.onStatusChange(this.getStatus());
  }

  private async showInfoDialog(message: string): Promise<void> {
    await this.showMessageBox({
      type: "info",
      title: this.options.appDisplayName,
      message,
      buttons: ["OK"],
      defaultId: 0,
      noLink: true,
    });
  }

  private async showStoreManagedDialog(): Promise<void> {
    await this.showMessageBox({
      type: "info",
      title: this.options.appDisplayName,
      message: "更新由 Microsoft Store 管理",
      detail:
        "当前安装包来自 Microsoft Store。商店会负责检查、下载、校验和安装更新；也可以在 Microsoft Store 的库页面手动检查更新。",
      buttons: ["确定"],
      defaultId: 0,
      noLink: true,
    });
  }

  private getFailureDetail(error: unknown): string {
    const message = getErrorMessage(error).trim();
    if (!message) {
      return "请稍后重试，或确认当前网络可以访问更新服务器。";
    }

    return `原因：${message}`;
  }

  private async showMessageBox(options: MessageBoxOptions): Promise<void> {
    const win = this.options.getDialogWindow();
    if (win) {
      await this.options.dialog.showMessageBox(win, options);
      return;
    }

    await this.options.dialog.showMessageBox(options);
  }
}
