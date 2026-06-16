/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// Desktop implementation of table row/cell access. Heavy data stages are executed
// by conductor-rs through Electron IPC/preload and normalized behind ITableRowsReaderService.

import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { workbenchIpcChannels } from "src/cs/workbench/common/ipcChannels";
import {
  ILifecycleService,
  WillShutdownJoinerOrder,
} from "src/cs/workbench/services/lifecycle/common/lifecycle";
import {
  IFileConverterBackendService,
  type ConvertedCsvReaderService,
  type FileConverterConvertedCsv,
} from "src/cs/workbench/services/files/common/fileConverterBackend";
import {
  ITableRowsReaderService,
  type TableRowsReaderResultPayload,
} from "src/cs/workbench/services/table/common/table";

type DesktopIpcRenderer = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
};

type TableBridge = {
  disposeFileWithRust?: (payload: unknown) => Promise<unknown>;
  getFilePreviewRowsWithRust?: (payload: unknown) => Promise<TableRowsReaderResultPayload>;
  openFileWithRust?: (payload: unknown) => Promise<TableRowsReaderResultPayload>;
  readFileCellsWithRust?: (payload: unknown) => Promise<TableRowsReaderResultPayload>;
};

const getServiceUnavailableMessage = (): string =>
  localize("tableRowsReader.desktopBridgeUnavailable", "Table preview desktop bridge unavailable.");

const getTableRowsReaderErrorMessage = (code: unknown): string => {
  switch (code) {
    case "RUST_HOST_FILE_NOT_FOUND":
      return localize("tableRowsReader.error.fileNotFound", "File was not found.");
    case "INVALID_RUST_HOST_CELLS":
      return localize("tableRowsReader.error.invalidCells", "Invalid table cells request.");
    case "INVALID_RUST_HOST_FILE_ID":
      return localize("tableRowsReader.error.invalidFileId", "Missing file id.");
    case "INVALID_RUST_HOST_PATH":
      return localize("tableRowsReader.error.invalidPath", "Invalid file path.");
    case "RUST_ENGINE_OPEN_FAILED":
      return localize("tableRowsReader.error.openFailed", "Failed to open file.");
    case "RUST_ENGINE_PREVIEW_ROWS_FAILED":
      return localize("tableRowsReader.error.previewRowsFailed", "Failed to read preview rows.");
    case "RUST_ENGINE_READ_CELLS_FAILED":
      return localize("tableRowsReader.error.readCellsFailed", "Failed to read table cells.");
    case "RUST_ENGINE_DISPOSE_FAILED":
      return localize("tableRowsReader.error.releaseFailed", "Failed to release table source.");
  }

  return localize("tableRowsReader.error.engineFailed", "Rust host failed.");
};

const localizeTableRowsReaderResponse = <T>(response: T): T => {
  if (
    response &&
    typeof response === "object" &&
    !Array.isArray(response) &&
    (response as { ok?: unknown }).ok === false
  ) {
    const record = response as Record<string, unknown>;
    return {
      ...record,
      message: getTableRowsReaderErrorMessage(record.code),
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

export class TableRowsReader extends Disposable implements ITableRowsReaderService {
  public declare readonly _serviceBrand: undefined;
  private readonly convertedCsvReaderService: ConvertedCsvReaderService;

  public constructor(
    @IFileConverterBackendService fileConverterBackendService: IFileConverterBackendService,
    @ILifecycleService lifecycleService: ILifecycleService,
  ) {
    super();
    this.convertedCsvReaderService = fileConverterBackendService;
    this._register(lifecycleService.onWillShutdown(event => {
      if (!this.canReleaseSource()) {
        return;
      }

      event.join(
        () => this.releaseSource({ clear: true }).then(() => undefined),
        {
          id: "table.releasePreviewSources",
          label: localize("table.releasePreviewSources", "Release Table Preview Sources"),
          order: WillShutdownJoinerOrder.Last,
        },
      );
    }));
  }

  public canReleaseSource(): boolean {
    return hasBridgeMethod("disposeFileWithRust") || hasIpcRenderer();
  }

  public canReadRows(): boolean {
    return hasBridgeMethod("getFilePreviewRowsWithRust") || hasIpcRenderer();
  }

  public canOpenSource(): boolean {
    return hasBridgeMethod("openFileWithRust") || hasIpcRenderer();
  }

  public canReadCells(): boolean {
    return hasBridgeMethod("readFileCellsWithRust") || hasIpcRenderer();
  }

  public canReadConvertedCsv(): boolean {
    return this.convertedCsvReaderService.canReadConvertedCsv();
  }

  public releaseSource(payload: unknown): Promise<unknown> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("disposeFileWithRust")) {
      return getBridgeMethod(bridge, "disposeFileWithRust")(payload)
        .then(localizeTableRowsReaderResponse);
    }

    return invoke(workbenchIpcChannels.rustHostDispose, payload)
      .then(localizeTableRowsReaderResponse);
  }

  public readRows(payload: unknown): Promise<TableRowsReaderResultPayload> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("getFilePreviewRowsWithRust")) {
      return getBridgeMethod(bridge, "getFilePreviewRowsWithRust")(payload)
        .then(localizeTableRowsReaderResponse);
    }

    return invoke<TableRowsReaderResultPayload>(workbenchIpcChannels.rustHostPreviewRows, payload)
      .then(localizeTableRowsReaderResponse);
  }

  public openSource(payload: unknown): Promise<TableRowsReaderResultPayload> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("openFileWithRust")) {
      return getBridgeMethod(bridge, "openFileWithRust")(payload)
        .then(localizeTableRowsReaderResponse);
    }

    return invoke<TableRowsReaderResultPayload>(workbenchIpcChannels.rustHostOpen, payload)
      .then(localizeTableRowsReaderResponse);
  }

  public readCells(payload: unknown): Promise<TableRowsReaderResultPayload> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("readFileCellsWithRust")) {
      return getBridgeMethod(bridge, "readFileCellsWithRust")(payload)
        .then(localizeTableRowsReaderResponse);
    }

    return invoke<TableRowsReaderResultPayload>(workbenchIpcChannels.rustHostReadCells, payload)
      .then(localizeTableRowsReaderResponse);
  }

  public readConvertedCsv(payload: { path: string; maxRows?: number }): Promise<FileConverterConvertedCsv> {
    return this.convertedCsvReaderService.readConvertedCsv(payload);
  }
}

registerSingleton(ITableRowsReaderService, TableRowsReader, InstantiationType.Delayed);
