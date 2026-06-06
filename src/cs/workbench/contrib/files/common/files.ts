import type { URI } from "src/cs/base/common/uri";

export const IMPORT_FILE_EXTENSIONS = [".csv", ".xls", ".xlsx"] as const;
export const FilesViewId = "workbench.files";
export const ADD_FOLDER_ACTION_ID = "files.addFolder";
export const MORE_ACTIONS_ACTION_ID = "files.moreActions";
export const REMOVE_FOLDER_ACTION_ID = "files.removeFolder";

const SUPPORTED_IMPORT_FILE_EXTENSIONS = new Set<string>(IMPORT_FILE_EXTENSIONS);
const EXCEL_IMPORT_FILE_EXTENSIONS = new Set<string>([".xls", ".xlsx"]);
const XLSX_IMPORT_FILE_EXTENSIONS = new Set<string>([".xlsx"]);

const toLowerTrimmed = (value: unknown): string =>
  String(value ?? "").trim().toLowerCase();

const getFileExtension = (fileName: unknown): string => {
  const normalized = toLowerTrimmed(fileName);
  const dotIndex = normalized.lastIndexOf(".");
  if (dotIndex <= 0) return "";
  return normalized.slice(dotIndex);
};

const fnv1a32 = (input: unknown): string => {
  const str = String(input ?? "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
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
  curveType?: string | null;
  curveTypeConfidence?: "high" | "medium" | "low";
  curveTypeNeedsTemplate?: boolean;
  curveTypeReasons?: string[];
};

export type DataFileSource = {
  readonly file: File;
  readonly kind: "data";
  readonly relativePath?: string | null;
  readonly resource?: URI | null;
};

export type PathFileSource = {
  readonly canUseNativePath?: boolean;
  readonly file?: File;
  readonly fileName: string;
  readonly kind: "path";
  readonly lastModified: number;
  readonly loadFile?: () => Promise<File>;
  readonly relativePath?: string | null;
  readonly resource: URI;
  readonly size: number;
};

export type FileSource = DataFileSource | PathFileSource;

export type FilesPaneRef = {
  openFileDialog: () => void;
  removeSelectedFolder: () => void;
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
  file: File | null | undefined,
  relativePath?: string | null,
): string => {
  const raw = buildFileIdentityKey(file, relativePath);
  if (!raw) {
    return "";
  }

  return `csv-${fnv1a32(raw)}`;
};
