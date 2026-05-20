export const DATA_IMPORT_EXTENSIONS = [
  ".csv",
  ".xls",
  ".xlsx",
] as const;

export const DATA_IMPORT_ACCEPT = DATA_IMPORT_EXTENSIONS.join(",");

const SUPPORTED_IMPORT_EXTENSIONS = new Set<string>(DATA_IMPORT_EXTENSIONS);
const EXCEL_IMPORT_EXTENSIONS = new Set<string>([".xls", ".xlsx"]);

const toLowerTrimmed = (value: unknown): string =>
  String(value ?? "").trim().toLowerCase();

const getFileExtension = (fileName: unknown): string => {
  const normalized = toLowerTrimmed(fileName);
  const dotIndex = normalized.lastIndexOf(".");
  if (dotIndex <= 0) return "";
  return normalized.slice(dotIndex);
};

export const isSupportedDataImportFileName = (fileName: unknown): boolean =>
  SUPPORTED_IMPORT_EXTENSIONS.has(getFileExtension(fileName));

export const isExcelDataImportFileName = (fileName: unknown): boolean =>
  EXCEL_IMPORT_EXTENSIONS.has(getFileExtension(fileName));
