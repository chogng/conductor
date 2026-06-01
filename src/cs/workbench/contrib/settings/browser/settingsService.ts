import { formatOriginBridgeError } from "src/cs/workbench/contrib/origin/common/originBridgeError";
import { analysisStoreClient } from "src/cs/workbench/services/storage/electron-sandbox/analysisStoreClient";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  getDesktopOriginBridge,
  getErrorMessage,
  getOriginExePathWithTimeout,
  normalizeTrimmedString,
  toPersistencePathInfo,
  type AnalysisSettings,
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
  handleUpdateAnalysisSettings: async () => null,
  isWindowsDesktopShell: false,
  mergeAnalysisSettings: () => {},
  t: key => key,
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
    return toPersistencePathInfo(await analysisStoreClient.getDeviceAnalysisPersistencePath());
  }

  public async choosePersistencePath(): Promise<PersistencePathInfo | null> {
    return toPersistencePathInfo(await analysisStoreClient.chooseDeviceAnalysisPersistencePath());
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
      this.options.mergeAnalysisSettings({ originExePath: nextPath });
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
      this.options.mergeAnalysisSettings({ originExePath: nextPath });
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

  public async updateSettings(updates: unknown): Promise<AnalysisSettings | null> {
    return this.options.handleUpdateAnalysisSettings(updates);
  }

  public formatOriginError(error: unknown): string {
    const detail = formatOriginBridgeError(this.options.t, error);
    if (detail.code === "ORIGIN_EXE_REQUIRED") {
      return this.options.t("da_origin_pick_exe_required");
    }

    return detail.messageText;
  }

  public errorMessage(error: unknown): string {
    return getErrorMessage(error) || this.options.t("unknownError");
  }
}

registerSingleton(ISettingsService, BrowserSettingsService, InstantiationType.Delayed);
