/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import { localize } from "src/cs/nls";
import { IFileService } from "src/cs/platform/files/common/files";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { workbenchIpcChannels } from "src/cs/workbench/common/ipcChannels";
import {
  IFileConverterBackendService,
  type FileConverterConvertedCsv,
  type FileConverterPreparedFile,
} from "src/cs/workbench/services/files/common/fileConverterBackend";

type DesktopIpcRenderer = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
};

type FileConverterBridge = {
  prepareImportFileWithRust?: (payload: { fileName: string; path: string }) => Promise<FileConverterPreparedFile>;
  readConvertedCsvFileWithRust?: (payload: { path: string }) => Promise<FileConverterConvertedCsv>;
};

const getServiceUnavailableMessage = (): string =>
  localize("fileConverter.desktopBridgeUnavailable", "File conversion desktop bridge unavailable.");

function getBridge(): FileConverterBridge | null {
  const bridge = (
    globalThis.window as Window & {
      desktopImport?: FileConverterBridge;
    } | undefined
  )?.desktopImport;
  return bridge && typeof bridge === "object" ? bridge : null;
}

function hasBridgeMethod<K extends keyof FileConverterBridge>(key: K): boolean {
  return typeof getBridge()?.[key] === "function";
}

function getBridgeMethod<K extends keyof FileConverterBridge>(
  bridge: FileConverterBridge,
  key: K,
): NonNullable<FileConverterBridge[K]> {
  const method = bridge[key];
  if (typeof method !== "function") {
    throw new Error(`${getServiceUnavailableMessage()} (${String(key)})`);
  }

  return method as NonNullable<FileConverterBridge[K]>;
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

export class ElectronFileConverterBackendService extends Disposable implements IFileConverterBackendService {
  public declare readonly _serviceBrand: undefined;

  constructor(
    @IFileService private readonly fileService: IFileService,
  ) {
    super();
  }

  public canPrepareFile(): boolean {
    return hasBridgeMethod("prepareImportFileWithRust") || hasIpcRenderer();
  }

  public canReadConvertedCsv(): boolean {
    return hasBridgeMethod("readConvertedCsvFileWithRust") || hasIpcRenderer();
  }

  public prepareFile(payload: { fileName: string; path: string }): Promise<FileConverterPreparedFile> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("prepareImportFileWithRust")) {
      return getBridgeMethod(bridge, "prepareImportFileWithRust")(payload);
    }

    return invoke<FileConverterPreparedFile>(workbenchIpcChannels.importPrepareRust, payload);
  }

  public readConvertedCsv(payload: { path: string }): Promise<FileConverterConvertedCsv> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("readConvertedCsvFileWithRust")) {
      return getBridgeMethod(bridge, "readConvertedCsvFileWithRust")(payload);
    }

    return this.readConvertedCsvFromFile(payload);
  }

  private async readConvertedCsvFromFile(
    payload: { path: string },
  ): Promise<FileConverterConvertedCsv> {
    const filePath = typeof payload?.path === "string" ? payload.path.trim() : "";
    if (!filePath) {
      return {
        ok: false,
      };
    }

    const resource = URI.file(filePath);
    if (!await this.fileService.exists(resource)) {
      return {
        ok: false,
      };
    }

    const content = await this.fileService.readFile(resource, { encoding: "utf8" });
    const sizeBytes = new TextEncoder().encode(content.value).byteLength;

    return {
      csvText: content.value,
      ok: true,
      sizeBytes,
    };
  }
}

registerSingleton(IFileConverterBackendService, ElectronFileConverterBackendService, InstantiationType.Delayed);
