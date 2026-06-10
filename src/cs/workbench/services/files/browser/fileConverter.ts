/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { startPerf } from "src/cs/workbench/common/perf";
import {
  isExcelFileImportSourceName,
} from "src/cs/workbench/services/files/common/files";
import type {
  ConvertedCsvReaderService,
  FileConverterBackend,
  FileConverterConvertedCsv,
  FileConverterPreparedFile,
} from "src/cs/workbench/services/files/common/fileConverterBackend";

export type {
  ConvertedCsvReaderService,
  FileConverterConvertedCsv,
  FileConverterPreparedFile,
};

const BROWSER_XLSX_CONVERSION_TIMEOUT_MS = 30_000;
const BROWSER_XLSX_MAX_BYTES = 32 * 1024 * 1024;

export type ConvertedImportFile = {
  file: File;
  normalizedCsvPath?: string | null;
  normalizedSizeBytes: number;
  sourcePath?: string | null;
  sourceName: string;
  sourceSizeBytes: number;
};

export type FileConverterSource =
  | { kind: "path"; path: string }
  | { kind: "data" };

export type FileConverterMetadata = {
  readonly fileName: string;
  readonly lastModified: number;
  readonly loadFile?: () => Promise<File>;
  readonly size: number;
};

export class FileConvertError extends Error {
  public readonly code: string | null;

  constructor(
    message: string,
    code: string | null = null,
  ) {
    super(message);
    this.code = code;
    this.name = "FileConvertError";
  }
}

const getRustConvertCsvBytes = (manifest: unknown): number | null => {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return null;
  }
  const value = Number((manifest as { csvBytes?: unknown }).csvBytes);
  return Number.isFinite(value) && value >= 0 ? value : null;
};

const shouldFallbackToBrowserFile = (code: unknown): boolean =>
  code === "IMPORT_FILE_NOT_FOUND" ||
  code === "EXCEL_FILE_NOT_FOUND" ||
  code === "INVALID_IMPORT_PATH" ||
  code === "UNRESOLVED_IMPORT_PATH";

const convertXlsxFile = (file: File): Promise<File> => {
  if (file.size > BROWSER_XLSX_MAX_BYTES) {
    throw new FileConvertError(
      `Excel file is too large for browser conversion: ${file.name}.`,
      "BROWSER_XLSX_FILE_TOO_LARGE",
    );
  }

  const worker = new Worker(new URL("./fileConverter.worker.ts", import.meta.url), {
    type: "module",
  });
  const requestId = Date.now();

  return new Promise<File>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      worker.terminate();
      reject(new FileConvertError(
        `Excel conversion timed out for ${file.name}.`,
        "BROWSER_XLSX_CONVERSION_TIMEOUT",
      ));
    }, BROWSER_XLSX_CONVERSION_TIMEOUT_MS);
    const finish = () => {
      window.clearTimeout(timeout);
      worker.terminate();
    };

    worker.onmessage = (event: MessageEvent<{
      csvText?: string;
      error?: string;
      requestId?: number;
      type?: string;
    }>) => {
      const message = event.data;
      if (message?.type !== "convertXlsxResult" || message.requestId !== requestId) {
        return;
      }

      finish();
      if (typeof message.csvText === "string") {
        resolve(new File([message.csvText], file.name, {
          lastModified: Number.isFinite(file.lastModified)
            ? file.lastModified
            : Date.now(),
          type: "text/csv;charset=utf-8",
        }));
        return;
      }

      reject(new FileConvertError(
        message.error || `Failed to convert ${file.name}.`,
        "BROWSER_XLSX_CONVERSION_FAILED",
      ));
    };
    worker.onerror = event => {
      finish();
      reject(new FileConvertError(
        event.message || `Failed to convert ${file.name}.`,
        "BROWSER_XLSX_CONVERSION_FAILED",
      ));
    };
    worker.postMessage({
      file,
      requestId,
      type: "convertXlsx",
    });
  });
};

const convertBrowserFile = async (
  file: File,
  sourcePath: string | null,
): Promise<ConvertedImportFile> => {
  if (isExcelFileImportSourceName(file.name)) {
    const convertedFile = await convertXlsxFile(file);
    return {
      file: convertedFile,
      normalizedCsvPath: null,
      normalizedSizeBytes: convertedFile.size,
      sourcePath,
      sourceName: file.name,
      sourceSizeBytes: file.size,
    };
  }

  return {
    file,
    normalizedCsvPath: null,
    normalizedSizeBytes: file.size,
    sourcePath,
    sourceName: file.name,
    sourceSizeBytes: file.size,
  };
};

export const loadConvertedCsvFile = async ({
  convertedCsvReaderService,
  fallbackFile,
  fileName,
  lastModified,
  normalizedCsvPath,
}: {
  convertedCsvReaderService: ConvertedCsvReaderService;
  fallbackFile?: unknown;
  fileName?: unknown;
  lastModified?: unknown;
  normalizedCsvPath?: unknown;
}): Promise<File | null> => {
  const csvPath =
    typeof normalizedCsvPath === "string" ? normalizedCsvPath.trim() : "";
  if (!csvPath) {
    return fallbackFile instanceof File ? fallbackFile : null;
  }

  if (!convertedCsvReaderService.canReadConvertedCsv()) {
    return fallbackFile instanceof File ? fallbackFile : null;
  }

  try {
    const response = await convertedCsvReaderService.readConvertedCsv({ path: csvPath });
    if (!response?.ok || typeof response.csvText !== "string") {
      return fallbackFile instanceof File ? fallbackFile : null;
    }
    return new File([response.csvText], String(fileName || "converted.csv"), {
      lastModified: Number.isFinite(Number(lastModified))
        ? Number(lastModified)
        : Date.now(),
      type: "text/csv;charset=utf-8",
    });
  } catch {
    return fallbackFile instanceof File ? fallbackFile : null;
  }
};

export const convertImportFile = async (
  fileConverterBackend: FileConverterBackend,
  file: File | null,
  source: FileConverterSource,
  metadata: FileConverterMetadata,
): Promise<ConvertedImportFile> => {
  const sourcePath = source.kind === "path" ? source.path.trim() : null;
  const loadBrowserFile = async (): Promise<File> => {
    if (file) {
      return file;
    }
    if (metadata.loadFile) {
      return metadata.loadFile();
    }
    throw new FileConvertError(
      `File content is unavailable for ${metadata.fileName}.`,
      "IMPORT_FILE_CONTENT_UNAVAILABLE",
    );
  };

  if (!fileConverterBackend.canPrepareFile()) {
    return convertBrowserFile(await loadBrowserFile(), sourcePath);
  }

  if (source.kind !== "path" || !sourcePath) {
    return convertBrowserFile(await loadBrowserFile(), null);
  }

  const finishPerf = startPerf("import:rust-prepare-file", {
    fileName: metadata.fileName,
    sizeBytes: metadata.size,
  });

  try {
    const result = await fileConverterBackend.prepareFile({
      fileName: metadata.fileName,
      path: sourcePath,
    });
    if (!result?.ok) {
      finishPerf({
        code: result?.code ?? null,
        message: result?.message ?? null,
        rustDurationMs: result?.durationMs ?? null,
        source: "rust-failed",
      });
      if (shouldFallbackToBrowserFile(result?.code)) {
        return convertBrowserFile(await loadBrowserFile(), null);
      }
      throw new FileConvertError(
        typeof result?.message === "string" && result.message.trim()
          ? result.message
          : `Rust import preparation failed for ${metadata.fileName}.`,
        typeof result?.code === "string" && result.code.trim()
          ? result.code
          : "RUST_IMPORT_PREPARE_FAILED",
      );
    }

    const normalizedCsvPath = result.normalizedCsvPath ?? null;
    const normalizedFile =
      typeof result.csvText === "string"
        ? new File([result.csvText], metadata.fileName, {
            lastModified: Number.isFinite(metadata.lastModified)
              ? metadata.lastModified
              : Date.now(),
            type: "text/csv;charset=utf-8",
          })
        : (await loadConvertedCsvFile({
            convertedCsvReaderService: fileConverterBackend,
            fallbackFile: file,
            fileName: metadata.fileName,
            lastModified: metadata.lastModified,
            normalizedCsvPath,
          })) ?? new File([], metadata.fileName, {
            lastModified: Number.isFinite(metadata.lastModified)
              ? metadata.lastModified
              : Date.now(),
            type: "text/csv;charset=utf-8",
          });
    const normalizedSizeBytes =
      getRustConvertCsvBytes(result.manifest) ??
      (Number(result.normalizedSizeBytes) || normalizedFile.size);

    finishPerf({
      normalizedCsvPath,
      normalizedSizeBytes,
      rustDurationMs: result.durationMs ?? null,
      source: result.source ?? "rust",
    });

    return {
      file: normalizedFile,
      normalizedCsvPath,
      normalizedSizeBytes,
      sourcePath: result.sourcePath ?? sourcePath,
      sourceName: result.sourceName ?? metadata.fileName,
      sourceSizeBytes: Number(result.sourceSizeBytes) || metadata.size,
    };
  } catch (error) {
    finishPerf({
      message: error instanceof Error ? error.message : String(error),
      source: "rust-failed",
    });
    throw error;
  }
};
