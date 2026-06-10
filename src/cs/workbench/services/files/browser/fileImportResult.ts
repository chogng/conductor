/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import Papa from "papaparse";

import {
  isExcelFileImportSourceName,
  type FileImportDiagnostic,
  type FileImportResult,
  type FileImportSourceKind,
  type ImportedFileRecord,
} from "src/cs/workbench/services/files/common/files";
import type {
  RawTableRecord,
  RawTableRowsRecord,
  RawTableSourceRecord,
} from "src/cs/workbench/services/files/common/rawTable";

export type ImportedFileRecordInput = {
  readonly file: File;
  readonly fileId: string;
  readonly fileName: string;
  readonly lastModified?: number | null;
  readonly normalizedCsvPath?: string | null;
  readonly relativePath?: string | null;
  readonly sourcePath?: string | null;
  readonly sourceSizeBytes?: number | null;
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

export const createImportedFileRecord = async (
  input: ImportedFileRecordInput,
): Promise<ImportedFileRecord> => {
  const fileId = normalizeRequiredText(input.fileId, "fileId");
  const fileName = normalizeRequiredText(input.fileName, "fileName");
  const sourcePath = normalizeOptionalText(input.sourcePath);
  const normalizedCsvPath = normalizeOptionalText(input.normalizedCsvPath);
  const rows = parseCsvRows(await input.file.text());
  const rawTableId = fileId;
  const rawTable: RawTableRecord = {
    columnCount: getColumnCount(rows),
    fileId,
    maxCellLengths: getMaxCellLengths(rows),
    rawTableId,
    rowCount: rows.length,
    rows: createRawTableRowsRecord(rows, normalizedCsvPath),
    source: createRawTableSource(fileName, sourcePath),
  };

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
      rawFile: input.file,
      rawTableOrder: [rawTableId],
      rawTablesById: {
        [rawTableId]: rawTable,
      },
      relativePath: normalizeOptionalText(input.relativePath),
      size: Number.isFinite(Number(input.sourceSizeBytes))
        ? Number(input.sourceSizeBytes)
        : input.file.size,
    },
  };
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
): RawTableSourceRecord => isExcelFileImportSourceName(fileName)
  ? {
      kind: "excelSheet",
      originalPath: sourcePath,
      sheetIndex: 0,
      sheetName: null,
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
