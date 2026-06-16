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
import {
  decodeTextBytes,
} from "src/cs/workbench/services/files/common/textDecode";

type DesktopIpcRenderer = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
};

type FileConverterBridge = {
  prepareFileConversion?: (payload: { fileName: string; path: string }) => Promise<FileConverterPreparedFile>;
  readConvertedCsvFileWithRust?: (payload: { path: string; maxRows?: number }) => Promise<FileConverterConvertedCsv>;
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

export class FileConversionService extends Disposable implements IFileConverterBackendService {
  public declare readonly _serviceBrand: undefined;

  constructor(
    @IFileService private readonly fileService: IFileService,
  ) {
    super();
  }

  public canPrepareFile(): boolean {
    return hasBridgeMethod("prepareFileConversion") || hasIpcRenderer();
  }

  public canReadConvertedCsv(): boolean {
    return hasBridgeMethod("readConvertedCsvFileWithRust") || hasIpcRenderer();
  }

  public prepareFile(payload: { fileName: string; path: string }): Promise<FileConverterPreparedFile> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("prepareFileConversion")) {
      return getBridgeMethod(bridge, "prepareFileConversion")(payload);
    }

    return invoke<FileConverterPreparedFile>(workbenchIpcChannels.fileConversionPrepare, payload);
  }

  public async readConvertedCsv(payload: { path: string; maxRows?: number }): Promise<FileConverterConvertedCsv> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("readConvertedCsvFileWithRust")) {
      const result = await getBridgeMethod(bridge, "readConvertedCsvFileWithRust")(payload);
      if (result?.ok) {
        return result;
      }
    }

    return this.readConvertedCsvFromFile(payload);
  }

  private async readConvertedCsvFromFile(
    payload: { path: string; maxRows?: number },
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

    const content = await this.fileService.readFile(resource, { encoding: "base64" });
    const bytes = decodeBase64Bytes(content.value);
    const decode = decodeTextBytes(bytes);
    if (!decode.ok) {
      return {
        ok: false,
      };
    }

    const csvText = limitCsvRows(decode.text ?? "", payload.maxRows);
    const sizeBytes = bytes.byteLength;

    return {
      csvText,
      ok: true,
      sizeBytes,
    };
  }
}

const limitCsvRows = (text: string, maxRows: number | undefined): string => {
  const safeMaxRows = Math.floor(Number(maxRows));
  if (!Number.isFinite(safeMaxRows) || safeMaxRows < 0) {
    return text;
  }
  if (safeMaxRows === 0) {
    return "";
  }

  let rowCount = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) !== 10) {
      continue;
    }
    rowCount += 1;
    if (rowCount >= safeMaxRows) {
      return text.slice(0, index);
    }
  }
  return text;
};

function decodeBase64Bytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

registerSingleton(IFileConverterBackendService, FileConversionService, InstantiationType.Delayed);
