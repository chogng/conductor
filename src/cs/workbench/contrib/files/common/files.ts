import type { URI } from "src/cs/base/common/uri";
import { stableItemKey } from "../../../../../utils/stableKey.ts";

export const DATA_FILE_EXTENSIONS = [".csv", ".xls", ".xlsx"] as const;

const SUPPORTED_DATA_FILE_EXTENSIONS = new Set<string>(DATA_FILE_EXTENSIONS);
const EXCEL_DATA_FILE_EXTENSIONS = new Set<string>([".xls", ".xlsx"]);

const toLowerTrimmed = (value: unknown): string =>
  String(value ?? "").trim().toLowerCase();

const getFileExtension = (fileName: unknown): string => {
  const normalized = toLowerTrimmed(fileName);
  const dotIndex = normalized.lastIndexOf(".");
  if (dotIndex <= 0) return "";
  return normalized.slice(dotIndex);
};

export const isSupportedDataFileName = (fileName: unknown): boolean =>
  SUPPORTED_DATA_FILE_EXTENSIONS.has(getFileExtension(fileName));

export const isExcelDataFileName = (fileName: unknown): boolean =>
  EXCEL_DATA_FILE_EXTENSIONS.has(getFileExtension(fileName));

export type FileEntry = {
  file?: unknown;
  fileId?: string;
  fileName?: string;
  itemKey?: string;
  normalizedCsvPath?: string | null;
  relativePath?: string | null;
  sourceKey?: string;
  sourcePath?: string | null;
  curveType?: string | null;
  curveTypeConfidence?: "high" | "medium" | "low";
  curveTypeNeedsTemplate?: boolean;
  curveTypeReasons?: string[];
};

export type FileSource = {
  readonly file: File;
  readonly relativePath?: string | null;
  readonly resource?: URI | null;
};

export type FilesPaneRef = {
  openFileDialog: () => void;
  hasFiles: boolean;
};

export const buildFileIdentityKey = (
  file: File | null | undefined,
  relativePath?: string | null,
): string => {
  if (!file) {
    return "";
  }

  const path = relativePath?.trim();
  return `${path || file.name}::${file.size}::${file.lastModified}`;
};

export const buildItemKey = (
  file: File | null | undefined,
  relativePath?: string | null,
): string => {
  const raw = buildFileIdentityKey(file, relativePath);
  if (!raw) {
    return "";
  }

  return stableItemKey("csv", raw);
};
