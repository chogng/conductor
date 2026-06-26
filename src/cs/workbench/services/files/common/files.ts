/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
  RawTableRecord,
} from "src/cs/workbench/services/files/common/rawTable";
import type { URI } from "src/cs/base/common/uri";

const fnv1a32 = (input: unknown): string => {
  const str = String(input ?? "");
  let hash = 0x811c9dc5;
  for (let index = 0; index < str.length; index += 1) {
    hash ^= str.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

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

export type FolderImportFileSource = PathFileSource & {
  readonly loadFile: () => Promise<ImportFileData>;
};

export type FolderFileReadFailure = {
  readonly fileName: string;
  readonly message: string;
  readonly relativePath: string;
};

export type FolderFileCollection = {
  readonly files: FolderImportFileSource[];
  readonly readFailures: FolderFileReadFailure[];
};

export type FolderFileCollectionBatch = {
  readonly files: FolderImportFileSource[];
};

export type FolderImportFiles = {
  readonly files: FileSource[];
  readonly folder: URI;
  readonly readFailures: FolderFileReadFailure[];
};

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
  readonly rawKey?: string;
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

export const createFileImportResultFromRecords = (
  files: readonly ImportedFileRecord[],
  options: {
    readonly createdAt?: number;
    readonly diagnostics?: readonly FileImportDiagnostic[];
  } = {},
): FileImportResult => ({
  createdAt: options.createdAt ?? Date.now(),
  diagnostics: [...(options.diagnostics ?? [])],
  files: [...files],
});
