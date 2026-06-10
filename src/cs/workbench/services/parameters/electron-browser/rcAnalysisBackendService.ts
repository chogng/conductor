/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { workbenchIpcChannels } from "src/cs/workbench/common/ipcChannels";
import {
  IRcAnalysisBackendService,
  type IRcAnalysisBackendService as IRcAnalysisBackendServiceType,
  type RcAnalysisResultPayload,
  type RcAnalyzePayload,
} from "src/cs/workbench/services/parameters/common/rcAnalysisBackend";

type DesktopIpcRenderer = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
};

type RcAnalysisBridge = {
  analyzeFileRcWithRust?: (payload: RcAnalyzePayload) => Promise<RcAnalysisResultPayload>;
};

const getServiceUnavailableMessage = (): string =>
  localize("rcAnalysis.desktopBridgeUnavailable", "Rust Rc bridge is unavailable.");

const getRcAnalysisErrorMessage = (code: unknown): string => {
  switch (code) {
    case "RUST_ENGINE_RC_FAILED":
      return localize("rcAnalysis.error.rcFailed", "Rc analysis failed.");
    case "RUST_ENGINE_RC_MISSING_DEVICES":
      return localize("rcAnalysis.error.rcMissingDevices", "Rc analysis requires at least one device.");
  }

  return localize("rcAnalysis.error.engineFailed", "Analysis engine failed.");
};

const localizeRcAnalysisResponse = <T>(response: T): T => {
  if (
    response &&
    typeof response === "object" &&
    !Array.isArray(response) &&
    (response as { ok?: unknown }).ok === false
  ) {
    const record = response as Record<string, unknown>;
    return {
      ...record,
      message: getRcAnalysisErrorMessage(record.code),
    } as T;
  }

  return response;
};

function getBridge(): RcAnalysisBridge | null {
  const bridge = (
    globalThis.window as Window & {
      desktopImport?: RcAnalysisBridge;
    } | undefined
  )?.desktopImport;
  return bridge && typeof bridge === "object" ? bridge : null;
}

function hasBridgeMethod<K extends keyof RcAnalysisBridge>(key: K): boolean {
  return typeof getBridge()?.[key] === "function";
}

function getBridgeMethod<K extends keyof RcAnalysisBridge>(
  bridge: RcAnalysisBridge,
  key: K,
): NonNullable<RcAnalysisBridge[K]> {
  const method = bridge[key];
  if (typeof method !== "function") {
    throw new Error(`${getServiceUnavailableMessage()} (${String(key)})`);
  }

  return method as NonNullable<RcAnalysisBridge[K]>;
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

export class ElectronRcAnalysisBackendService extends Disposable implements IRcAnalysisBackendServiceType {
  public declare readonly _serviceBrand: undefined;

  public analyzeRc(payload: RcAnalyzePayload): Promise<RcAnalysisResultPayload> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("analyzeFileRcWithRust")) {
      return getBridgeMethod(bridge, "analyzeFileRcWithRust")(payload)
        .then(localizeRcAnalysisResponse);
    }

    return invoke<RcAnalysisResultPayload>(workbenchIpcChannels.analysisRustEngineAnalyzeRc, payload)
      .then(localizeRcAnalysisResponse);
  }

  public canAnalyzeRc(): boolean {
    return hasBridgeMethod("analyzeFileRcWithRust") || hasIpcRenderer();
  }
}

registerSingleton(IRcAnalysisBackendService, ElectronRcAnalysisBackendService, InstantiationType.Delayed);
