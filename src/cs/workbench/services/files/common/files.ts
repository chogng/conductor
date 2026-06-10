/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
  RawTableRecord,
} from "src/cs/workbench/services/files/common/rawTable";
import type { URI } from "src/cs/base/common/uri";

export const IMPORT_FILE_EXTENSIONS = [".csv", ".xls", ".xlsx"] as const;

const SUPPORTED_IMPORT_FILE_EXTENSIONS = new Set<string>(IMPORT_FILE_EXTENSIONS);
const EXCEL_IMPORT_FILE_EXTENSIONS = new Set<string>([".xls", ".xlsx"]);
const XLSX_IMPORT_FILE_EXTENSIONS = new Set<string>([".xlsx"]);

const toLowerTrimmed = (value: unknown): string =>
  String(value ?? "").trim().toLowerCase();

const getFileExtension = (fileName: unknown): string => {
  const normalized = toLowerTrimmed(fileName);
  const dotIndex = normalized.lastIndexOf(".");
  if (dotIndex <= 0) {
    return "";
  }

  return normalized.slice(dotIndex);
};

const fnv1a32 = (input: unknown): string => {
  const str = String(input ?? "");
  let hash = 0x811c9dc5;
  for (let index = 0; index < str.length; index += 1) {
    hash ^= str.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

export const isSupportedImportFileName = (fileName: unknown): boolean =>
  SUPPORTED_IMPORT_FILE_EXTENSIONS.has(getFileExtension(fileName));

export const isExcelImportFileName = (fileName: unknown): boolean =>
  EXCEL_IMPORT_FILE_EXTENSIONS.has(getFileExtension(fileName));

export const isXlsxImportFileName = (fileName: unknown): boolean =>
  XLSX_IMPORT_FILE_EXTENSIONS.has(getFileExtension(fileName));

export type FileEntry = {
  file?: unknown;
  fileId?: string;
  fileName?: string;
  itemKey?: string;
  normalizedCsvPath?: string | null;
  relativePath?: string | null;
  sourceKey?: string;
  sourcePath?: string | null;
};

export type ImportFileData = {
  readonly lastModified: number;
  readonly name: string;
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
};

export type DataFileSource = {
  readonly file: ImportFileData;
  readonly kind: "data";
  readonly relativePath?: string | null;
  readonly resource?: URI | null;
};

export type PathFileSource = {
  readonly canUseNativePath?: boolean;
  readonly file?: ImportFileData;
  readonly fileName: string;
  readonly kind: "path";
  readonly lastModified: number;
  readonly loadFile?: () => Promise<ImportFileData>;
  readonly relativePath?: string | null;
  readonly resource: URI;
  readonly size: number;
};

export type FileSource = DataFileSource | PathFileSource;

export const buildFileIdentityKey = (
  file: ImportFileData | null | undefined,
  relativePath?: string | null,
): string => {
  if (!file) {
    return "";
  }

  const path = relativePath?.trim();
  return `${path || file.name}::${file.size}::${file.lastModified}`;
};

export const buildFileSourceIdentityKey = (
  fileName: unknown,
  size: unknown,
  lastModified: unknown,
  relativePath?: string | null,
): string => {
  const name = String(fileName ?? "").trim();
  if (!name) {
    return "";
  }

  const path = relativePath?.trim();
  return `${path || name}::${Number(size) || 0}::${Number(lastModified) || 0}`;
};

export const buildItemKey = (
  file: ImportFileData | null | undefined,
  relativePath?: string | null,
): string => {
  const raw = buildFileIdentityKey(file, relativePath);
  if (!raw) {
    return "";
  }

  return `csv-${fnv1a32(raw)}`;
};

export type FileImportSourceKind =
  | "csv"
  | "excel"
  | "clipboard"
  | "manual"
  | "unknown";

export type FileImportSource =
  | {
      readonly kind: "path";
      readonly path: string;
      readonly fileName: string;
      readonly size: number;
      readonly lastModified: number;
      readonly loadFile?: () => Promise<ImportFileData>;
    }
  | {
      readonly kind: "file";
      readonly file: ImportFileData;
      readonly relativePath?: string | null;
    }
  | {
      readonly kind: "clipboard";
      readonly label?: string | null;
      readonly rows: readonly (readonly string[])[];
    }
  | {
      readonly kind: "manual";
      readonly label?: string | null;
      readonly rows: readonly (readonly string[])[];
    };

export type FileImportDiagnosticSeverity = "info" | "warning" | "error";

export type FileImportDiagnostic = {
  readonly severity: FileImportDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly sourceName?: string | null;
};

export type RawRecord = {
  readonly fileId: string;
  readonly fileName: string;
  readonly rawFile?: unknown;
  readonly size?: number;
  readonly lastModified?: number;
  readonly relativePath?: string | null;
  readonly filePath?: string | null;
  readonly rawTablesById: Readonly<Record<string, RawTableRecord>>;
  readonly rawTableOrder: readonly string[];
};

export type ImportedFileRecord = {
  readonly id: string;
  readonly name: string;
  readonly kind: FileImportSourceKind;
  readonly raw: RawRecord;
};

export type FileImportInput = {
  readonly sources: readonly FileImportSource[];
  readonly importedAt: number;
  readonly options?: {
    readonly preferNormalizedCsv?: boolean;
    readonly maxInlineBytes?: number;
  };
};

export type FileImportResult = {
  readonly files: readonly ImportedFileRecord[];
  readonly diagnostics: readonly FileImportDiagnostic[];
  readonly createdAt: number;
};

export const isExcelFileImportSourceName = (fileName: string): boolean =>
  /\.(xls|xlsx)$/i.test(fileName);

export const isSupportedFileImportSourceName = (fileName: string): boolean =>
  /\.(csv|xls|xlsx)$/i.test(fileName);
