/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { workbenchIpcChannels } from "src/cs/workbench/common/ipcChannels";
import {
  IFileConverterBackendService,
  type FileConverterConvertedCsv,
  type IFileConverterBackendService as IFileConverterBackendServiceType,
} from "src/cs/workbench/services/files/common/fileConverterBackend";
import {
  ITemplateProcessingBackendService,
  type ITemplateProcessingBackendService as ITemplateProcessingBackendServiceType,
  type TemplateProcessingResultPayload,
} from "src/cs/workbench/services/template/common/templateProcessingBackend";

type DesktopIpcRenderer = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
};

type TemplateProcessingBridge = {
  processAnalysisFileWithRust?: (payload: unknown) => Promise<TemplateProcessingResultPayload>;
};

const getServiceUnavailableMessage = (): string =>
  localize("templateProcessing.desktopBridgeUnavailable", "Template processing desktop bridge unavailable.");

const getTemplateProcessingErrorMessage = (code: unknown): string => {
  switch (code) {
    case "RUST_ENGINE_PROCESS_FAILED":
      return localize("templateProcessing.error.processFailed", "Failed to process analysis file.");
    case "RUST_ENGINE_PROCESS_UNSUPPORTED_CONFIG":
      return localize(
        "templateProcessing.error.processUnsupportedConfig",
        "This extraction config is not supported yet.",
      );
  }

  return localize("templateProcessing.error.engineFailed", "Analysis engine failed.");
};

const localizeTemplateProcessingResponse = <T>(response: T): T => {
  if (
    response &&
    typeof response === "object" &&
    !Array.isArray(response) &&
    (response as { ok?: unknown }).ok === false
  ) {
    const record = response as Record<string, unknown>;
    return {
      ...record,
      message: getTemplateProcessingErrorMessage(record.code),
    } as T;
  }

  return response;
};

function getBridge(): TemplateProcessingBridge | null {
  const bridge = (
    globalThis.window as Window & {
      desktopImport?: TemplateProcessingBridge;
    } | undefined
  )?.desktopImport;
  return bridge && typeof bridge === "object" ? bridge : null;
}

function hasBridgeMethod<K extends keyof TemplateProcessingBridge>(key: K): boolean {
  return typeof getBridge()?.[key] === "function";
}

function getBridgeMethod<K extends keyof TemplateProcessingBridge>(
  bridge: TemplateProcessingBridge,
  key: K,
): NonNullable<TemplateProcessingBridge[K]> {
  const method = bridge[key];
  if (typeof method !== "function") {
    throw new Error(`${getServiceUnavailableMessage()} (${String(key)})`);
  }

  return method as NonNullable<TemplateProcessingBridge[K]>;
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

export class ElectronTemplateProcessingBackendService
  extends Disposable
  implements ITemplateProcessingBackendServiceType
{
  public declare readonly _serviceBrand: undefined;

  public constructor(
    @IFileConverterBackendService private readonly convertedCsvReaderService: IFileConverterBackendServiceType,
  ) {
    super();
  }

  public canProcessFile(): boolean {
    return hasBridgeMethod("processAnalysisFileWithRust") || hasIpcRenderer();
  }

  public canReadConvertedCsv(): boolean {
    return this.convertedCsvReaderService.canReadConvertedCsv();
  }

  public processFile(payload: unknown): Promise<TemplateProcessingResultPayload> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("processAnalysisFileWithRust")) {
      return getBridgeMethod(bridge, "processAnalysisFileWithRust")(payload)
        .then(localizeTemplateProcessingResponse);
    }

    return invoke<TemplateProcessingResultPayload>(workbenchIpcChannels.analysisRustEngineProcessFile, payload)
      .then(localizeTemplateProcessingResponse);
  }

  public readConvertedCsv(payload: { path: string }): Promise<FileConverterConvertedCsv> {
    return this.convertedCsvReaderService.readConvertedCsv(payload);
  }
}

registerSingleton(
  ITemplateProcessingBackendService,
  ElectronTemplateProcessingBackendService,
  InstantiationType.Delayed,
);
