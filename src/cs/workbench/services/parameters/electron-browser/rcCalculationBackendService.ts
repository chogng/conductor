/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { workbenchIpcChannels } from "src/cs/workbench/common/ipcChannels";
import {
  IRcCalculationBackendService,
  type RcCalculationResultPayload,
  type RcCalculatePayload,
} from "src/cs/workbench/services/parameters/common/rcCalculationBackend";

type DesktopIpcRenderer = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
};

type RcCalculationBridge = {
  calculateFileRcWithRust?: (payload: RcCalculatePayload) => Promise<RcCalculationResultPayload>;
};

const getServiceUnavailableMessage = (): string =>
  localize("rcCalculation.desktopBridgeUnavailable", "Rust Rc calculation bridge is unavailable.");

const getRcCalculationErrorMessage = (code: unknown): string => {
  switch (code) {
    case "RUST_ENGINE_RC_FAILED":
      return localize("rcCalculation.error.rcFailed", "Rc calculation failed.");
    case "RUST_ENGINE_RC_MISSING_DEVICES":
      return localize("rcCalculation.error.rcMissingDevices", "Rc calculation requires at least one device.");
  }

  return localize("rcCalculation.error.engineFailed", "Rc calculation engine failed.");
};

const localizeRcCalculationResponse = <T>(response: T): T => {
  if (
    response &&
    typeof response === "object" &&
    !Array.isArray(response) &&
    (response as { ok?: unknown }).ok === false
  ) {
    const record = response as Record<string, unknown>;
    return {
      ...record,
      message: getRcCalculationErrorMessage(record.code),
    } as T;
  }

  return response;
};

function getBridge(): RcCalculationBridge | null {
  const bridge = (
    globalThis.window as Window & {
      desktopImport?: RcCalculationBridge;
    } | undefined
  )?.desktopImport;
  return bridge && typeof bridge === "object" ? bridge : null;
}

function hasBridgeMethod<K extends keyof RcCalculationBridge>(key: K): boolean {
  return typeof getBridge()?.[key] === "function";
}

function getBridgeMethod<K extends keyof RcCalculationBridge>(
  bridge: RcCalculationBridge,
  key: K,
): NonNullable<RcCalculationBridge[K]> {
  const method = bridge[key];
  if (typeof method !== "function") {
    throw new Error(`${getServiceUnavailableMessage()} (${String(key)})`);
  }

  return method as NonNullable<RcCalculationBridge[K]>;
}

function getIpcRenderer(): DesktopIpcRenderer {
  const ipcRenderer = (
    globalThis.window as Window & {
      conductor?: { ipcRenderer?: DesktopIpcRenderer };
    } | undefined
  )?.conductor?.ipcRenderer;
  if (!ipcRenderer || typeof ipcRenderer.invoke !== "function") {
    throw new Error(getServiceUnavailableMessage());
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

function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  return getIpcRenderer().invoke(channel, payload) as Promise<T>;
}

export class ElectronRcCalculationBackendService extends Disposable implements IRcCalculationBackendService {
  public declare readonly _serviceBrand: undefined;

  public calculateRc(payload: RcCalculatePayload): Promise<RcCalculationResultPayload> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("calculateFileRcWithRust")) {
      return getBridgeMethod(bridge, "calculateFileRcWithRust")(payload)
        .then(localizeRcCalculationResponse);
    }

    return invoke<RcCalculationResultPayload>(workbenchIpcChannels.rustHostCalculateRc, payload)
      .then(localizeRcCalculationResponse);
  }

  public canCalculateRc(): boolean {
    return hasBridgeMethod("calculateFileRcWithRust") || hasIpcRenderer();
  }
}

registerSingleton(IRcCalculationBackendService, ElectronRcCalculationBackendService, InstantiationType.Delayed);
