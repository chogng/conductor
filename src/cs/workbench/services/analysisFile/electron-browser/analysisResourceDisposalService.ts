/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { workbenchIpcChannels } from "src/cs/workbench/common/ipcChannels";
import {
  IAnalysisResourceDisposalService,
  type AnalysisResourceDisposalOptions,
  type IAnalysisResourceDisposalService as IAnalysisResourceDisposalServiceType,
} from "src/cs/workbench/services/analysisFile/common/analysisResourceDisposal";

type DesktopIpcRenderer = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
};

type AnalysisResourceDisposalBridge = {
  disposeAnalysisFileWithRust?: (payload: AnalysisResourceDisposalOptions) => Promise<unknown>;
};

const getServiceUnavailableMessage = (): string =>
  localize("analysisResourceDisposal.desktopBridgeUnavailable", "Analysis resource disposal bridge unavailable.");

function getBridge(): AnalysisResourceDisposalBridge | null {
  const bridge = (
    globalThis.window as Window & {
      desktopImport?: AnalysisResourceDisposalBridge;
    } | undefined
  )?.desktopImport;
  return bridge && typeof bridge === "object" ? bridge : null;
}

function hasBridgeMethod<K extends keyof AnalysisResourceDisposalBridge>(key: K): boolean {
  return typeof getBridge()?.[key] === "function";
}

function getBridgeMethod<K extends keyof AnalysisResourceDisposalBridge>(
  bridge: AnalysisResourceDisposalBridge,
  key: K,
): NonNullable<AnalysisResourceDisposalBridge[K]> {
  const method = bridge[key];
  if (typeof method !== "function") {
    throw new Error(`${getServiceUnavailableMessage()} (${String(key)})`);
  }

  return method as NonNullable<AnalysisResourceDisposalBridge[K]>;
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

export class ElectronAnalysisResourceDisposalService
  extends Disposable
  implements IAnalysisResourceDisposalServiceType
{
  public declare readonly _serviceBrand: undefined;

  public canDisposeAnalysisResources(): boolean {
    return hasBridgeMethod("disposeAnalysisFileWithRust") || hasIpcRenderer();
  }

  public async disposeAnalysisResources(options: AnalysisResourceDisposalOptions): Promise<void> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("disposeAnalysisFileWithRust")) {
      await getBridgeMethod(bridge, "disposeAnalysisFileWithRust")(options);
      return;
    }

    await invoke(workbenchIpcChannels.analysisRustEngineDispose, options);
  }
}

registerSingleton(
  IAnalysisResourceDisposalService,
  ElectronAnalysisResourceDisposalService,
  InstantiationType.Delayed,
);
