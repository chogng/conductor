import Papa from "papaparse";
import {
  classifyDeviceAnalysisCurve,
  extractDeviceAnalysisCurveMetadata,
  type DeviceAnalysisCurveClassification,
} from "./deviceAnalysisCurveClassification.js";

export const DEVICE_ANALYSIS_DATA_IMPORT_EXTENSIONS = [
  ".csv",
  ".xls",
  ".xlsx",
] as const;

export const DEVICE_ANALYSIS_DATA_IMPORT_ACCEPT =
  DEVICE_ANALYSIS_DATA_IMPORT_EXTENSIONS.join(",");

const SUPPORTED_IMPORT_EXTENSIONS = new Set<string>(
  DEVICE_ANALYSIS_DATA_IMPORT_EXTENSIONS,
);
const EXCEL_IMPORT_EXTENSIONS = new Set<string>([".xls", ".xlsx"]);
const IMPORT_CLASSIFICATION_PREVIEW_BYTES = 128 * 1024;
const IMPORT_CLASSIFICATION_PREVIEW_ROWS = 256;

export type ImportedDeviceAnalysisCurveAssessment = {
  curveType: string | null;
  curveTypeConfidence: DeviceAnalysisCurveClassification["confidence"];
  curveTypeNeedsTemplate: boolean;
  curveTypeReasons: string[];
  xAxisRole: DeviceAnalysisCurveClassification["xAxisRole"];
  xAxisRoleSource: DeviceAnalysisCurveClassification["xAxisRoleSource"];
};

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

export const toCsvCompatibleDataFile = async (file: File): Promise<File> => {
  if (!file) throw new Error("Missing import file.");
  if (!isSupportedDataImportFileName(file.name)) {
    throw new Error(`Unsupported import file format: ${file.name}`);
  }

  if (!isExcelDataImportFileName(file.name)) {
    return file;
  }

  const xlsxModule = await import("xlsx");
  const fileBuffer = await file.arrayBuffer();
  const workbook = xlsxModule.read(fileBuffer, {
    type: "array",
    cellDates: false,
    cellNF: false,
    cellStyles: false,
    cellText: false,
    dense: true,
    raw: false,
  });

  const firstSheetName = String(workbook?.SheetNames?.[0] ?? "").trim();
  if (!firstSheetName) {
    throw new Error(`${file.name}: workbook has no sheet.`);
  }

  const firstSheet = workbook.Sheets[firstSheetName];
  if (!firstSheet) {
    throw new Error(`${file.name}: failed to read the first sheet.`);
  }

  const csvText = xlsxModule.utils.sheet_to_csv(firstSheet, {
    blankrows: false,
    FS: ",",
    RS: "\n",
  });

  return new File([csvText], file.name, {
    type: "text/csv;charset=utf-8",
    lastModified: Number.isFinite(file.lastModified)
      ? file.lastModified
      : Date.now(),
  });
};

export const assessImportedDeviceAnalysisFile = async (
  file: File,
): Promise<ImportedDeviceAnalysisCurveAssessment> => {
  const previewText = await file
    .slice(0, IMPORT_CLASSIFICATION_PREVIEW_BYTES)
    .text();
  const parsed = Papa.parse(previewText, {
    preview: IMPORT_CLASSIFICATION_PREVIEW_ROWS,
    skipEmptyLines: false,
  }) as unknown as { data?: unknown[] };
  const rows = Array.isArray(parsed?.data)
    ? (parsed.data as Array<Array<unknown>>)
    : [];
  const metadata = extractDeviceAnalysisCurveMetadata(rows);
  const classification = classifyDeviceAnalysisCurve({
    fileName: file?.name,
    metadata,
  });

  return {
    curveType: classification.curveTypeLabel ?? null,
    curveTypeConfidence: classification.confidence,
    curveTypeNeedsTemplate: classification.needsTemplate,
    curveTypeReasons: classification.reasons,
    xAxisRole: classification.xAxisRole,
    xAxisRoleSource: classification.xAxisRoleSource,
  };
};
