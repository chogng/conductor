/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { URI } from "src/cs/base/common/uri";

export const TABLE_IMPORT_FILE_EXTENSIONS = [".csv", ".tsv", ".xls", ".xlsx"] as const;

export type TableImportFileExtension = typeof TABLE_IMPORT_FILE_EXTENSIONS[number];
export type TableFileFormat = "csv" | "tsv" | "xls" | "xlsx";

const TABLE_FORMAT_BY_EXTENSION: Readonly<Record<TableImportFileExtension, TableFileFormat>> = {
  ".csv": "csv",
  ".tsv": "tsv",
  ".xls": "xls",
  ".xlsx": "xlsx",
};

export class TableFileFormatService {
  public canHandle(resource: URI | string | null | undefined): boolean {
    return this.getFormat(resource) !== null;
  }

  public getFormat(resource: URI | string | null | undefined): TableFileFormat | null {
    const value = getResourcePathOrName(resource);
    const extension = getTableFileExtension(value);
    return extension ? TABLE_FORMAT_BY_EXTENSION[extension] : null;
  }

  public getSupportedExtensions(): readonly TableImportFileExtension[] {
    return TABLE_IMPORT_FILE_EXTENSIONS;
  }

  public isDelimitedText(resource: URI | string | null | undefined): boolean {
    const format = this.getFormat(resource);
    return format === "csv" || format === "tsv";
  }

  public isExcel(resource: URI | string | null | undefined): boolean {
    const format = this.getFormat(resource);
    return format === "xls" || format === "xlsx";
  }

  public isTsv(resource: URI | string | null | undefined): boolean {
    return this.getFormat(resource) === "tsv";
  }

  public isXlsx(resource: URI | string | null | undefined): boolean {
    return this.getFormat(resource) === "xlsx";
  }
}

export const tableFileFormatService = new TableFileFormatService();

const getResourcePathOrName = (
  resource: URI | string | null | undefined,
): string => {
  if (typeof resource === "string") {
    return resource;
  }

  return typeof resource?.path === "string" ? resource.path : "";
};

const getTableFileExtension = (
  value: unknown,
): TableImportFileExtension | null => {
  const normalized = getBaseName(String(value ?? "").trim()).toLowerCase();
  if (!normalized) {
    return null;
  }

  for (const extension of TABLE_IMPORT_FILE_EXTENSIONS) {
    if (
      normalized.length > extension.length &&
      normalized.endsWith(extension)
    ) {
      return extension;
    }
  }

  return null;
};

const getBaseName = (value: string): string => {
  const normalized = value.replace(/\\/g, "/");
  const slashIndex = normalized.lastIndexOf("/");
  return slashIndex >= 0 ? normalized.slice(slashIndex + 1) : normalized;
};
