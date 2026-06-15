import electron, {
  type BrowserWindow,
  type Event as ElectronEvent,
  type Menu as ElectronMenu,
  type NativeImage,
  type Tray,
} from "electron";

import { Emitter } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import type { IConfigurationService } from "../../configuration/common/configuration.js";
import { StorageScope, StorageTarget, type IStorageService } from "../../storage/common/storage.js";
import type { ITrayMainService, WindowCloseBehavior } from "./trayMainService.js";

const TRAY_MINIMIZE_HINT_SHOWN_STORAGE_KEY = "window.trayMinimizeHintShown";

type TrayMenuItem = {
  readonly label?: string;
  readonly click?: () => void;
  readonly type?: "separator";
};

export type TrayMainServiceOptions = {
  readonly appDisplayName: string;
  readonly platform: NodeJS.Platform;
  readonly checkForUpdates: () => void;
  readonly ensureMainWindowVisible: () => Promise<BrowserWindow | null> | BrowserWindow | null;
  readonly getMainWindow: () => BrowserWindow | null;
  readonly logWarning?: (message: string, error?: unknown) => void;
  readonly quit: () => void;
  readonly resolveTrayIconPath: () => string | undefined | null;
  readonly showMessage: (key: string) => string;
  readonly trayFactory?: (image: NativeImage) => Tray;
  readonly imageFactory?: (path: string) => NativeImage;
  readonly menuFactory?: (items: readonly TrayMenuItem[]) => ElectronMenu;
};

export class TrayMainService extends Disposable implements ITrayMainService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidRequestQuitEmitter = this._register(new Emitter<void>());
  public readonly onDidRequestQuit = this.onDidRequestQuitEmitter.event;

  private tray: Tray | null = null;
  private quitRequested = false;

  public constructor(
    private readonly options: TrayMainServiceOptions,
    private readonly configurationService: IConfigurationService,
    private readonly storageService: IStorageService,
  ) {
    super();
  }

  public createTray(): Tray | null {
    if (this.tray) {
      this.updateTrayMenu();
      return this.tray;
    }

    const trayIconPath = this.options.resolveTrayIconPath();
    if (!trayIconPath) {
      this.warn("[tray] Tray icon is unavailable.");
      return null;
    }

    try {
      const trayIcon = (this.options.imageFactory ?? electron.nativeImage.createFromPath)(trayIconPath);
      if (this.options.platform === "darwin") {
        trayIcon.setTemplateImage(true);
      }
      this.tray = (this.options.trayFactory ?? ((image) => new electron.Tray(image)))(trayIcon);
    } catch (error) {
      this.warn("[tray] Failed to create tray icon.", error);
      return null;
    }

    this.tray.setToolTip(this.options.appDisplayName);
    this.tray.on("click", () => {
      void this.options.ensureMainWindowVisible();
    });
    this.tray.on("double-click", () => {
      void this.options.ensureMainWindowVisible();
    });
    this.updateTrayMenu();
    return this.tray;
  }

  public updateTrayMenu(): void {
    if (!this.tray) return;

    const mainWindow = this.options.getMainWindow();
    const hasVisibleWindow = Boolean(
      mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible(),
    );

    const menuFactory = this.options.menuFactory ?? (items => electron.Menu.buildFromTemplate([...items]));
    this.tray.setContextMenu(menuFactory([
      {
        label: hasVisibleWindow
          ? this.options.showMessage("tray.hideWindow")
          : this.options.showMessage("tray.showWindow"),
        click: () => {
          if (hasVisibleWindow) {
            this.hideWindowToTray(mainWindow);
            return;
          }
          void this.options.ensureMainWindowVisible();
        },
      },
      {
        label: this.options.showMessage("tray.checkForUpdates"),
        click: () => this.options.checkForUpdates(),
      },
      { type: "separator" },
      {
        label: this.options.showMessage("tray.quit"),
        click: () => this.requestQuit(),
      },
    ]));
  }

  public hideWindowToTray(
    win: BrowserWindow | null | undefined,
    options: { readonly showTrayHint?: boolean } = {},
  ): void {
    if (!win || win.isDestroyed()) return;
    win.hide();
    if (options.showTrayHint === true) {
      this.showTrayHint();
    }
  }

  public handleWindowClose(
    win: BrowserWindow | null | undefined,
    event: ElectronEvent,
  ): boolean {
    if (this.quitRequested) {
      return false;
    }

    if (this.shouldMinimizeToTrayOnWindowClose()) {
      event.preventDefault();
      this.hideWindowToTray(win, { showTrayHint: true });
      this.updateTrayMenu();
      return true;
    }

    event.preventDefault();
    this.requestQuit();
    return true;
  }

  public shouldMinimizeToTrayOnWindowClose(): boolean {
    return this.getWindowCloseBehavior() === "minimizeToTray";
  }

  public shouldKeepProcessAliveAfterAllWindowsClosed(): boolean {
    return this.options.platform === "darwin" || Boolean(this.tray && !this.quitRequested);
  }

  public requestQuit(): void {
    if (!this.quitRequested) {
      this.quitRequested = true;
      this.onDidRequestQuitEmitter.fire();
    }
    this.options.quit();
  }

  public markQuitRequested(): void {
    this.quitRequested = true;
  }

  public isQuitRequested(): boolean {
    return this.quitRequested;
  }

  public destroy(): void {
    this.tray?.destroy();
    this.tray = null;
  }

  public override dispose(): void {
    this.destroy();
    super.dispose();
  }

  private showTrayHint(): void {
    if (this.options.platform !== "win32" || !this.tray) return;
    if (typeof this.tray.displayBalloon !== "function") return;
    if (this.isTrayMinimizeHintShown()) return;

    this.tray.displayBalloon({
      title: this.options.appDisplayName,
      content: this.options.showMessage("tray.backgroundContinueMessage"),
      noSound: true,
    });
    this.storageService.store(
      TRAY_MINIMIZE_HINT_SHOWN_STORAGE_KEY,
      true,
      StorageScope.PROFILE,
      StorageTarget.USER,
    );
  }

  private isTrayMinimizeHintShown(): boolean {
    return this.storageService.getBoolean(
      TRAY_MINIMIZE_HINT_SHOWN_STORAGE_KEY,
      StorageScope.PROFILE,
      false,
    );
  }

  private getWindowCloseBehavior(): WindowCloseBehavior {
    return this.configurationService.getValue("windowCloseBehavior") === "quit"
      ? "quit"
      : "minimizeToTray";
  }

  private warn(message: string, error?: unknown): void {
    this.options.logWarning?.(message, error);
  }
}
