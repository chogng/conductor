/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import Papa from "papaparse";

import { startPerf } from "src/cs/workbench/common/perf";
import {
  isExcelFileImportSourceName,
  type FileImportSourceKind,
  type ImportedFileRecord,
  type ImportFileData,
} from "src/cs/workbench/services/files/common/files";
import type {
  RawTableRecord,
  RawTableRowsRecord,
  RawTableSourceRecord,
} from "src/cs/workbench/services/files/common/rawTable";
import type {
  ConvertedCsvReaderService,
  FileConverterBackend,
  FileConverterConvertedCsv,
  FileConverterPreparedSheet,
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
  columnCount?: number;
  file: File;
  maxCellLengths?: readonly number[];
  normalizedCsvPath?: string | null;
  normalizedSizeBytes: number;
  rowCount?: number;
  sheets?: readonly ConvertedImportSheet[];
  sourcePath?: string | null;
  sourceName: string;
  sourceSizeBytes: number;
};

export type ConvertedImportSheet = FileConverterPreparedSheet;

export type FileConverterSource =
  | { kind: "path"; path: string }
  | { kind: "data" };

export type FileConverterMetadata = {
  readonly fileName: string;
  readonly lastModified: number;
  readonly loadFile?: () => Promise<ImportFileData>;
  readonly size: number;
};

export type ImportedFileRecordInput = {
  readonly file: File;
  readonly fileId: string;
  readonly fileName: string;
  readonly lastModified?: number | null;
  readonly normalizedCsvPath?: string | null;
  readonly rawKey?: string | null;
  readonly relativePath?: string | null;
  readonly sourcePath?: string | null;
  readonly sourceSizeBytes?: number | null;
  readonly tables?: readonly ImportedRawTableInput[];
};

export type ImportedRawTableInput = {
  readonly columnCount?: number;
  readonly csvText?: string;
  readonly maxCellLengths?: readonly number[];
  readonly normalizedCsvPath?: string | null;
  readonly rawTableId?: string | null;
  readonly rowCount?: number;
  readonly rows?: readonly (readonly string[])[];
  readonly sheetIndex?: number | null;
  readonly sheetName?: string | null;
};

const createEmptyNormalizedCsvFile = (
  fileName: string,
  lastModified: number,
): File =>
  new File([], fileName, {
    lastModified: Number.isFinite(lastModified) ? lastModified : Date.now(),
    type: "text/csv;charset=utf-8",
  });

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

const getBrowserFileMimeType = (fileName: string): string =>
  isExcelFileImportSourceName(fileName)
    ? "application/octet-stream"
    : "text/csv;charset=utf-8";

const toBrowserFile = async (file: ImportFileData): Promise<File> => {
  if (file instanceof File) {
    return file;
  }

  return new File([await file.arrayBuffer()], file.name, {
    lastModified: Number.isFinite(file.lastModified) ? file.lastModified : Date.now(),
    type: getBrowserFileMimeType(file.name),
  });
};

export const loadConvertedCsvFile = async ({
  convertedCsvReaderService,
  fallbackFile,
  fileName,
  lastModified,
  maxRows,
  normalizedCsvPath,
}: {
  convertedCsvReaderService: ConvertedCsvReaderService;
  fallbackFile?: unknown;
  fileName?: unknown;
  lastModified?: unknown;
  maxRows?: unknown;
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
    const safeMaxRows = Number.isFinite(Number(maxRows))
      ? Math.max(0, Math.floor(Number(maxRows)))
      : undefined;
    const response = await convertedCsvReaderService.readConvertedCsv({
      path: csvPath,
      ...(safeMaxRows !== undefined ? { maxRows: safeMaxRows } : {}),
    });
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
  file: ImportFileData | null,
  source: FileConverterSource,
  metadata: FileConverterMetadata,
): Promise<ConvertedImportFile> => {
  const sourcePath = source.kind === "path" ? source.path.trim() : null;
  const loadBrowserFile = async (): Promise<File> => {
    if (file) {
      return toBrowserFile(file);
    }
    if (metadata.loadFile) {
      return toBrowserFile(await metadata.loadFile());
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
        : normalizedCsvPath
          ? createEmptyNormalizedCsvFile(metadata.fileName, metadata.lastModified)
          : await loadBrowserFile();
    const normalizedSizeBytes =
      getRustConvertCsvBytes(result.manifest) ??
      (Number(result.normalizedSizeBytes) || normalizedFile.size);

    finishPerf({
      normalizedCsvPath,
      normalizedSizeBytes,
      rustDurationMs: result.durationMs ?? null,
      source: "rust",
    });

    const manifest = isObjectRecord(result.manifest) ? result.manifest : {};
    return {
      file: normalizedFile,
      columnCount: readNonNegativeInteger(result.columnCount ?? manifest.columnCount),
      maxCellLengths: readNumberArray(result.maxCellLengths ?? manifest.maxCellLengths),
      normalizedCsvPath,
      normalizedSizeBytes,
      rowCount: readNonNegativeInteger(result.rowCount ?? manifest.rowCount ?? manifest.rows),
      sheets: readConvertedImportSheets(result),
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

const readConvertedImportSheets = (
  result: FileConverterPreparedFile,
): readonly ConvertedImportSheet[] | undefined => {
  if (Array.isArray(result.sheets) && result.sheets.length > 0) {
    return result.sheets
      .map(normalizeConvertedImportSheet)
      .filter((sheet): sheet is ConvertedImportSheet => Boolean(sheet));
  }

  const manifest = result.manifest;
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return undefined;
  }

  const sheets = (manifest as { sheets?: unknown }).sheets;
  return Array.isArray(sheets)
    ? sheets
        .map(normalizeConvertedImportSheet)
        .filter((sheet): sheet is ConvertedImportSheet => Boolean(sheet))
    : undefined;
};

const normalizeConvertedImportSheet = (
  value: unknown,
): ConvertedImportSheet | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const normalizedCsvPath = typeof record.normalizedCsvPath === "string"
    ? record.normalizedCsvPath.trim()
    : typeof record.csvPath === "string"
      ? record.csvPath.trim()
      : null;
  const sheetName = typeof record.sheetName === "string"
    ? record.sheetName.trim()
    : typeof record.name === "string"
      ? record.name.trim()
      : null;
  const csvText = typeof record.csvText === "string" ? record.csvText : undefined;

  if (!normalizedCsvPath && !csvText) {
    return null;
  }

  return {
    columnCount: readNonNegativeInteger(record.columnCount),
    csvText,
    maxCellLengths: readNumberArray(record.maxCellLengths),
    normalizedCsvPath,
    rowCount: readNonNegativeInteger(record.rowCount ?? record.rows),
    sheetIndex: readNonNegativeInteger(record.sheetIndex ?? record.index),
    sheetName,
  };
};

const readNonNegativeInteger = (value: unknown): number | undefined => {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : undefined;
};

const readNumberArray = (value: unknown): readonly number[] | undefined =>
  Array.isArray(value)
    ? value
        .map(item => Number(item))
        .filter(item => Number.isFinite(item) && item >= 0)
    : undefined;

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const createImportedFileRecord = async (
  input: ImportedFileRecordInput,
): Promise<ImportedFileRecord> => {
  const fileId = normalizeRequiredText(input.fileId, "fileId");
  const fileName = normalizeRequiredText(input.fileName, "fileName");
  const sourcePath = normalizeOptionalText(input.sourcePath);
  const tables = await createRawTableRecords(input, fileId, fileName, sourcePath);

  return {
    id: fileId,
    kind: getImportSourceKind(fileName),
    name: fileName,
    raw: {
      fileId,
      fileName,
      filePath: sourcePath,
      lastModified: Number.isFinite(Number(input.lastModified))
        ? Number(input.lastModified)
        : input.file.lastModified,
      rawKey: normalizeOptionalText(input.rawKey) ?? undefined,
      rawFile: input.file,
      rawTableOrder: tables.map(table => table.rawTableId),
      rawTablesById: Object.fromEntries(
        tables.map(table => [table.rawTableId, table]),
      ),
      relativePath: normalizeOptionalText(input.relativePath),
      size: Number.isFinite(Number(input.sourceSizeBytes))
        ? Number(input.sourceSizeBytes)
        : input.file.size,
    },
  };
};

const createRawTableRecords = async (
  input: ImportedFileRecordInput,
  fileId: string,
  fileName: string,
  sourcePath: string | null,
): Promise<RawTableRecord[]> => {
  const tableInputs = input.tables?.length
    ? input.tables
    : [{
        normalizedCsvPath: input.normalizedCsvPath,
        rawTableId: fileId,
        rows: parseCsvRows(await input.file.text()),
        sheetIndex: 0,
      }];

  return tableInputs.map((table, index) => {
    const rows = table.rows ?? (
      typeof table.csvText === "string" ? parseCsvRows(table.csvText) : []
    );
    const rawTableId = normalizeOptionalText(table.rawTableId) ??
      (index === 0 ? fileId : `${fileId}:sheet-${index + 1}`);
    const normalizedCsvPath = normalizeOptionalText(table.normalizedCsvPath);
    const rowCount = Number.isFinite(Number(table.rowCount))
      ? Math.max(0, Math.floor(Number(table.rowCount)))
      : rows.length;
    const columnCount = Number.isFinite(Number(table.columnCount))
      ? Math.max(0, Math.floor(Number(table.columnCount)))
      : getColumnCount(rows);
    const maxCellLengths = table.maxCellLengths?.length
      ? [...table.maxCellLengths]
      : getMaxCellLengths(rows);

    return {
      columnCount,
      fileId,
      maxCellLengths,
      rawTableId,
      rowCount,
      rows: createRawTableRowsRecord(rows, normalizedCsvPath),
      source: createRawTableSource(fileName, sourcePath, {
        sheetIndex: Number.isFinite(Number(table.sheetIndex))
          ? Math.max(0, Math.floor(Number(table.sheetIndex)))
          : index,
        sheetName: normalizeOptionalText(table.sheetName),
      }),
    };
  });
};

const createRawTableRowsRecord = (
  rows: readonly (readonly string[])[],
  normalizedCsvPath: string | null,
): RawTableRowsRecord => normalizedCsvPath
  ? {
      formatVersion: 1,
      kind: "normalizedCsv",
      normalizedCsvPath,
    }
  : {
      kind: "inline",
      values: rows,
    };

const createRawTableSource = (
  fileName: string,
  sourcePath: string | null,
  table: {
    readonly sheetIndex: number;
    readonly sheetName: string | null;
  },
): RawTableSourceRecord => isExcelFileImportSourceName(fileName)
  ? {
      kind: "excelSheet",
      originalPath: sourcePath,
      sheetIndex: table.sheetIndex,
      sheetName: table.sheetName,
    }
  : {
      kind: "csv",
      originalPath: sourcePath,
    };

const parseCsvRows = (text: string): readonly (readonly string[])[] => {
  const parsed = Papa.parse<unknown[]>(text, {
    skipEmptyLines: false,
  });
  return parsed.data.map(row => row.map(cell => cell == null ? "" : String(cell)));
};

const getColumnCount = (rows: readonly (readonly string[])[]): number =>
  rows.reduce((max, row) => Math.max(max, row.length), 0);

const getMaxCellLengths = (
  rows: readonly (readonly string[])[],
): readonly number[] => {
  const lengths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, index) => {
      lengths[index] = Math.max(lengths[index] ?? 0, cell.length);
    });
  }
  return lengths;
};

const getImportSourceKind = (fileName: string): FileImportSourceKind => {
  if (isExcelFileImportSourceName(fileName)) {
    return "excel";
  }
  return /\.csv$/i.test(fileName) ? "csv" : "unknown";
};

const normalizeRequiredText = (
  value: unknown,
  fieldName: string,
): string => {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    throw new Error(`Missing imported file ${fieldName}.`);
  }
  return normalized;
};

const normalizeOptionalText = (value: unknown): string | null => {
  const normalized = String(value ?? "").trim();
  return normalized || null;
};
