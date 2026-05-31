import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  IOriginService,
  type IOriginService as IOriginServiceType,
  type OriginCleanupResult,
  type OriginHealthResult,
} from "src/cs/workbench/services/origin/common/origin";

type OriginBridge = {
  checkOriginHealth?: (options: { path?: string }) => Promise<OriginHealthResult>;
  getOriginExePath?: () => Promise<string>;
  pickOriginExePath?: () => Promise<string>;
  runOriginCsv?: (payload: unknown) => Promise<unknown>;
  runOriginRuntimeCleanup?: (payload?: unknown) => Promise<OriginCleanupResult>;
  setOriginExePath?: (path: string) => Promise<unknown>;
};

const ORIGIN_SERVICE_UNAVAILABLE = "Origin desktop bridge unavailable.";

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

export class OriginService extends Disposable implements IOriginServiceType {
  public declare readonly _serviceBrand: undefined;

  public canCheckHealth(): boolean {
    return hasBridgeMethod("checkOriginHealth");
  }

  public canManageExePath(): boolean {
    return hasBridgeMethod("getOriginExePath") && hasBridgeMethod("pickOriginExePath");
  }

  public canRunCsv(): boolean {
    return hasBridgeMethod("runOriginCsv");
  }

  public canRunRuntimeCleanup(): boolean {
    return hasBridgeMethod("runOriginRuntimeCleanup");
  }

  public checkHealth(options: { path?: string }): Promise<OriginHealthResult> {
    const bridge = getBridge();
    return getBridgeMethod(bridge, "checkOriginHealth")(options);
  }

  public getExePath(): Promise<string> {
    const bridge = getBridge();
    return getBridgeMethod(bridge, "getOriginExePath")();
  }

  public pickExePath(): Promise<string> {
    const bridge = getBridge();
    return getBridgeMethod(bridge, "pickOriginExePath")();
  }

  public runCsv(payload: unknown): Promise<unknown> {
    const bridge = getBridge();
    return getBridgeMethod(bridge, "runOriginCsv")(payload);
  }

  public runRuntimeCleanup(payload?: unknown): Promise<OriginCleanupResult> {
    const bridge = getBridge();
    return getBridgeMethod(bridge, "runOriginRuntimeCleanup")(payload);
  }

  public setExePath(path: string): Promise<unknown> {
    const bridge = getBridge();
    return getBridgeMethod(bridge, "setOriginExePath")(path);
  }
}

export const originService = new OriginService();

registerSingleton(IOriginService, OriginService, InstantiationType.Delayed);
