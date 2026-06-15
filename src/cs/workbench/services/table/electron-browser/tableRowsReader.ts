/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// Desktop implementation of table row/cell access. Heavy data stages are executed
// by conductor-rs through Electron IPC/preload and normalized behind ITableBackendService.

import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { workbenchIpcChannels } from "src/cs/workbench/common/ipcChannels";
import {
  IFileConverterBackendService,
  type ConvertedCsvReaderService,
  type FileConverterConvertedCsv,
} from "src/cs/workbench/services/files/common/fileConverterBackend";
import {
  ITableBackendService,
  type TableBackendResultPayload,
} from "src/cs/workbench/services/table/common/table";

type DesktopIpcRenderer = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
};

type TableBridge = {
  disposeFileWithRust?: (payload: unknown) => Promise<unknown>;
  getFilePreviewRowsWithRust?: (payload: unknown) => Promise<TableBackendResultPayload>;
  openFileWithRust?: (payload: unknown) => Promise<TableBackendResultPayload>;
  readFileCellsWithRust?: (payload: unknown) => Promise<TableBackendResultPayload>;
};

const getServiceUnavailableMessage = (): string =>
  localize("tableBackend.desktopBridgeUnavailable", "Table preview desktop bridge unavailable.");

const getTableBackendErrorMessage = (code: unknown): string => {
  switch (code) {
    case "RUST_HOST_FILE_NOT_FOUND":
      return localize("tableBackend.error.fileNotFound", "File was not found.");
    case "INVALID_RUST_HOST_CELLS":
      return localize("tableBackend.error.invalidCells", "Invalid table cells request.");
    case "INVALID_RUST_HOST_FILE_ID":
      return localize("tableBackend.error.invalidFileId", "Missing file id.");
    case "INVALID_RUST_HOST_PATH":
      return localize("tableBackend.error.invalidPath", "Invalid file path.");
    case "RUST_ENGINE_OPEN_FAILED":
      return localize("tableBackend.error.openFailed", "Failed to open file.");
    case "RUST_ENGINE_PREVIEW_ROWS_FAILED":
      return localize("tableBackend.error.previewRowsFailed", "Failed to read preview rows.");
    case "RUST_ENGINE_READ_CELLS_FAILED":
      return localize("tableBackend.error.readCellsFailed", "Failed to read table cells.");
    case "RUST_ENGINE_DISPOSE_FAILED":
      return localize("tableBackend.error.disposeFailed", "Failed to release file.");
  }

  return localize("tableBackend.error.engineFailed", "Rust host failed.");
};

const localizeTableBackendResponse = <T>(response: T): T => {
  if (
    response &&
    typeof response === "object" &&
    !Array.isArray(response) &&
    (response as { ok?: unknown }).ok === false
  ) {
    const record = response as Record<string, unknown>;
    return {
      ...record,
      message: getTableBackendErrorMessage(record.code),
    } as T;
  }

  return response;
};

function getBridge(): TableBridge | null {
  const bridge = (
    globalThis.window as Window & {
      desktopImport?: TableBridge;
    } | undefined
  )?.desktopImport;
  return bridge && typeof bridge === "object" ? bridge : null;
}

function hasBridgeMethod<K extends keyof TableBridge>(key: K): boolean {
  return typeof getBridge()?.[key] === "function";
}

function getBridgeMethod<K extends keyof TableBridge>(
  bridge: TableBridge,
  key: K,
): NonNullable<TableBridge[K]> {
  const method = bridge[key];
  if (typeof method !== "function") {
    throw new Error(`${getServiceUnavailableMessage()} (${String(key)})`);
  }

  return method as NonNullable<TableBridge[K]>;
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

export class TableRowsReader extends Disposable implements ITableBackendService {
  public declare readonly _serviceBrand: undefined;
  private readonly convertedCsvReaderService: ConvertedCsvReaderService;

  public constructor(
    @IFileConverterBackendService fileConverterBackendService: IFileConverterBackendService,
  ) {
    super();
    this.convertedCsvReaderService = fileConverterBackendService;
  }

  public canDisposeFile(): boolean {
    return hasBridgeMethod("disposeFileWithRust") || hasIpcRenderer();
  }

  public canGetPreviewRows(): boolean {
    return hasBridgeMethod("getFilePreviewRowsWithRust") || hasIpcRenderer();
  }

  public canOpenFile(): boolean {
    return hasBridgeMethod("openFileWithRust") || hasIpcRenderer();
  }

  public canReadCells(): boolean {
    return hasBridgeMethod("readFileCellsWithRust") || hasIpcRenderer();
  }

  public canReadConvertedCsv(): boolean {
    return this.convertedCsvReaderService.canReadConvertedCsv();
  }

  public disposeFile(payload: unknown): Promise<unknown> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("disposeFileWithRust")) {
      return getBridgeMethod(bridge, "disposeFileWithRust")(payload)
        .then(localizeTableBackendResponse);
    }

    return invoke(workbenchIpcChannels.rustHostDispose, payload)
      .then(localizeTableBackendResponse);
  }

  public getPreviewRows(payload: unknown): Promise<TableBackendResultPayload> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("getFilePreviewRowsWithRust")) {
      return getBridgeMethod(bridge, "getFilePreviewRowsWithRust")(payload)
        .then(localizeTableBackendResponse);
    }

    return invoke<TableBackendResultPayload>(workbenchIpcChannels.rustHostPreviewRows, payload)
      .then(localizeTableBackendResponse);
  }

  public openFile(payload: unknown): Promise<TableBackendResultPayload> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("openFileWithRust")) {
      return getBridgeMethod(bridge, "openFileWithRust")(payload)
        .then(localizeTableBackendResponse);
    }

    return invoke<TableBackendResultPayload>(workbenchIpcChannels.rustHostOpen, payload)
      .then(localizeTableBackendResponse);
  }

  public readCells(payload: unknown): Promise<TableBackendResultPayload> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("readFileCellsWithRust")) {
      return getBridgeMethod(bridge, "readFileCellsWithRust")(payload)
        .then(localizeTableBackendResponse);
    }

    return invoke<TableBackendResultPayload>(workbenchIpcChannels.rustHostReadCells, payload)
      .then(localizeTableBackendResponse);
  }

  public readConvertedCsv(payload: { path: string }): Promise<FileConverterConvertedCsv> {
    return this.convertedCsvReaderService.readConvertedCsv(payload);
  }
}

registerSingleton(ITableBackendService, TableRowsReader, InstantiationType.Delayed);
