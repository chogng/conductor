import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { workbenchIpcChannels } from "src/cs/workbench/common/ipcChannels";
import {
  IOriginService,
  type IOriginService as IOriginServiceType,
  type OriginCleanupResult,
  type OriginCsvExportResult,
  type OriginHealthResult,
  type OriginZipSaveResult,
} from "src/cs/workbench/services/origin/common/origin";

type OriginBridge = {
  checkOriginHealth?: (options: { path?: string }) => Promise<OriginHealthResult>;
  exportAnalysisOriginCsvWithRust?: (payload: unknown) => Promise<OriginCsvExportResult>;
  getOriginExePath?: () => Promise<string>;
  pickOriginExePath?: () => Promise<string>;
  runOriginCsv?: (payload: unknown) => Promise<unknown>;
  runOriginRuntimeCleanup?: (payload?: unknown) => Promise<OriginCleanupResult>;
  saveAnalysisOriginZip?: (payload: unknown) => Promise<OriginZipSaveResult>;
  setOriginExePath?: (path: string) => Promise<unknown>;
};

const ORIGIN_SERVICE_UNAVAILABLE = "Origin desktop bridge unavailable.";

type DesktopIpcRenderer = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
};

function getBridge(): OriginBridge {
  const bridge = (
    globalThis.window as Window & { desktopOrigin?: OriginBridge } | undefined
  )?.desktopOrigin;
  if (!bridge || typeof bridge !== "object") {
    throw new Error(ORIGIN_SERVICE_UNAVAILABLE);
  }

  return bridge;
}

function hasBridgeMethod<K extends keyof OriginBridge>(key: K): boolean {
  const bridge = (
    globalThis.window as Window & { desktopOrigin?: OriginBridge } | undefined
  )?.desktopOrigin;
  return typeof bridge?.[key] === "function";
}

function getBridgeMethod<K extends keyof OriginBridge>(
  bridge: OriginBridge,
  key: K,
): NonNullable<OriginBridge[K]> {
  const method = bridge[key];
  if (typeof method !== "function") {
    throw new Error(`${ORIGIN_SERVICE_UNAVAILABLE} (${String(key)})`);
  }

  return method as NonNullable<OriginBridge[K]>;
}

function getIpcRenderer(): DesktopIpcRenderer {
  const ipcRenderer = (
    globalThis.window as Window & {
      conductor?: { ipcRenderer?: DesktopIpcRenderer };
    } | undefined
  )?.conductor?.ipcRenderer;
  if (!ipcRenderer || typeof ipcRenderer.invoke !== "function") {
    throw new Error(ORIGIN_SERVICE_UNAVAILABLE);
  }

  return ipcRenderer;
}

function hasIpcRenderer(): boolean {
  const ipcRenderer = (
    globalThis.window as Window & {
      conductor?: { ipcRenderer?: DesktopIpcRenderer };
    } | undefined
  )?.conductor?.ipcRenderer;
  return typeof ipcRenderer?.invoke === "function";
}

export class OriginService extends Disposable implements IOriginServiceType {
  public declare readonly _serviceBrand: undefined;

  public canCheckHealth(): boolean {
    return hasBridgeMethod("checkOriginHealth") || hasIpcRenderer();
  }

  public canExportCsv(): boolean {
    return hasBridgeMethod("exportAnalysisOriginCsvWithRust") || hasIpcRenderer();
  }

  public canManageExePath(): boolean {
    return (
      (hasBridgeMethod("getOriginExePath") && hasBridgeMethod("pickOriginExePath")) ||
      hasIpcRenderer()
    );
  }

  public canRunCsv(): boolean {
    return hasBridgeMethod("runOriginCsv") || hasIpcRenderer();
  }

  public canRunRuntimeCleanup(): boolean {
    return hasBridgeMethod("runOriginRuntimeCleanup") || hasIpcRenderer();
  }

  public canSaveZip(): boolean {
    return hasBridgeMethod("saveAnalysisOriginZip") || hasIpcRenderer();
  }

  public checkHealth(options: { path?: string }): Promise<OriginHealthResult> {
    if (hasBridgeMethod("checkOriginHealth")) {
      const bridge = getBridge();
      return getBridgeMethod(bridge, "checkOriginHealth")(options);
    }

    return getIpcRenderer().invoke(
      workbenchIpcChannels.originHealthCheck,
      options,
    ) as Promise<OriginHealthResult>;
  }

  public exportCsv(payload: unknown): Promise<OriginCsvExportResult> {
    if (hasBridgeMethod("exportAnalysisOriginCsvWithRust")) {
      const bridge = getBridge();
      return getBridgeMethod(bridge, "exportAnalysisOriginCsvWithRust")(payload);
    }

    return getIpcRenderer().invoke(
      workbenchIpcChannels.analysisRustEngineExportOriginCsv,
      payload,
    ) as Promise<OriginCsvExportResult>;
  }

  public getExePath(): Promise<string> {
    if (hasBridgeMethod("getOriginExePath")) {
      const bridge = getBridge();
      return getBridgeMethod(bridge, "getOriginExePath")();
    }

    return getIpcRenderer().invoke(workbenchIpcChannels.originExeGet) as Promise<string>;
  }

  public pickExePath(): Promise<string> {
    if (hasBridgeMethod("pickOriginExePath")) {
      const bridge = getBridge();
      return getBridgeMethod(bridge, "pickOriginExePath")();
    }

    return getIpcRenderer().invoke(workbenchIpcChannels.originExePick) as Promise<string>;
  }

  public runCsv(payload: unknown): Promise<unknown> {
    if (hasBridgeMethod("runOriginCsv")) {
      const bridge = getBridge();
      return getBridgeMethod(bridge, "runOriginCsv")(payload);
    }

    return getIpcRenderer().invoke(workbenchIpcChannels.originRunCsv, payload);
  }

  public runRuntimeCleanup(payload?: unknown): Promise<OriginCleanupResult> {
    if (hasBridgeMethod("runOriginRuntimeCleanup")) {
      const bridge = getBridge();
      return getBridgeMethod(bridge, "runOriginRuntimeCleanup")(payload);
    }

    return getIpcRenderer().invoke(
      workbenchIpcChannels.originRuntimeCleanupRun,
      payload,
    ) as Promise<OriginCleanupResult>;
  }

  public saveZip(payload: unknown): Promise<OriginZipSaveResult> {
    if (hasBridgeMethod("saveAnalysisOriginZip")) {
      const bridge = getBridge();
      return getBridgeMethod(bridge, "saveAnalysisOriginZip")(payload);
    }

    return getIpcRenderer().invoke(
      workbenchIpcChannels.analysisOriginZipSave,
      payload,
    ) as Promise<OriginZipSaveResult>;
  }

  public setExePath(path: string): Promise<unknown> {
    if (hasBridgeMethod("setOriginExePath")) {
      const bridge = getBridge();
      return getBridgeMethod(bridge, "setOriginExePath")(path);
    }

    return getIpcRenderer().invoke(workbenchIpcChannels.originExeSet, { path });
  }
}

export const originService = new OriginService();

registerSingleton(IOriginService, OriginService, InstantiationType.Delayed);
