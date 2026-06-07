import { localize } from "src/cs/nls";
import { formatOriginBridgeError } from "src/cs/workbench/contrib/origin/common/originBridgeError";
import { conductorStoreClient } from "src/cs/workbench/services/conductorStore/electron-browser/conductorStoreClient";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  getDesktopOriginBridge,
  getErrorMessage,
  getOriginExePathWithTimeout,
  normalizeTrimmedString,
  toPersistencePathInfo,
  type ConductorSettings,
  type OriginCleanupResult,
  type OriginHealthResult,
  type PersistencePathInfo,
} from "src/cs/workbench/contrib/settings/settingsShared";
import {
  ISettingsService,
  type ISettingsService as ISettingsServiceType,
  type SettingsServiceOptions,
} from "src/cs/workbench/contrib/settings/common/settings";

const defaultOptions: SettingsServiceOptions = {
  updateConductorSettings: async () => null,
  isWindowsDesktopShell: false,
  mergeConductorSettings: () => {},
};

export class BrowserSettingsService implements ISettingsServiceType {
  public declare readonly _serviceBrand: undefined;

  private options: SettingsServiceOptions = defaultOptions;

  update(options: SettingsServiceOptions): void {
    this.options = options;
  }

  public canManageOrigin(): boolean {
    return this.options.isWindowsDesktopShell && Boolean(getDesktopOriginBridge());
  }

  public canCheckOriginHealth(): boolean {
    const bridge = getDesktopOriginBridge();
    return this.options.isWindowsDesktopShell && typeof bridge?.checkOriginHealth === "function";
  }

  public canRunOriginCleanup(): boolean {
    const bridge = getDesktopOriginBridge();
    return this.options.isWindowsDesktopShell && typeof bridge?.runOriginRuntimeCleanup === "function";
  }

  public async getPersistencePath(): Promise<PersistencePathInfo | null> {
    return toPersistencePathInfo(await conductorStoreClient.getPersistencePath());
  }

  public async choosePersistencePath(): Promise<PersistencePathInfo | null> {
    return toPersistencePathInfo(await conductorStoreClient.choosePersistencePath());
  }

  public async getOriginExePath(): Promise<string> {
    const bridge = getDesktopOriginBridge();
    if (!this.options.isWindowsDesktopShell || !bridge) {
      return "";
    }

    return normalizeTrimmedString(await getOriginExePathWithTimeout(bridge));
  }

  public async chooseOriginExePath(): Promise<string> {
    const bridge = getDesktopOriginBridge();
    if (!bridge) {
      return "";
    }

    const nextPath = normalizeTrimmedString(await bridge.pickOriginExePath());
    if (nextPath) {
      this.options.mergeConductorSettings({ originExePath: nextPath });
    }
    return nextPath;
  }

  public async checkOriginHealth(path: string): Promise<OriginHealthResult> {
    const bridge = getDesktopOriginBridge();
    if (!bridge || typeof bridge.checkOriginHealth !== "function") {
      throw new Error("Origin health check is unavailable.");
    }

    const result = await bridge.checkOriginHealth({ path: path || undefined });
    const nextPath = normalizeTrimmedString(result?.originExePath);
    if (nextPath) {
      this.options.mergeConductorSettings({ originExePath: nextPath });
    }
    return result;
  }

  public async runOriginCleanup(): Promise<OriginCleanupResult> {
    const bridge = getDesktopOriginBridge();
    if (!bridge || typeof bridge.runOriginRuntimeCleanup !== "function") {
      throw new Error("Origin runtime cleanup is unavailable.");
    }

    return bridge.runOriginRuntimeCleanup();
  }

  public async updateSettings(updates: unknown): Promise<ConductorSettings | null> {
    return this.options.updateConductorSettings(updates);
  }

  public formatOriginError(error: unknown): string {
    const detail = formatOriginBridgeError(error);
    if (detail.code === "ORIGIN_EXE_REQUIRED") {
      return localize("origin_pick_exe_required", "Please select Origin executable path first.");
    }

    return detail.messageText;
  }

  public errorMessage(error: unknown): string {
    return getErrorMessage(error) || localize("unknownError", "Unknown error");
  }
}

registerSingleton(ISettingsService, BrowserSettingsService, InstantiationType.Delayed);
