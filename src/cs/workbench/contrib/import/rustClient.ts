import {
  type ImportedCurveAssessment,
} from "src/cs/workbench/common/deviceAnalysis/importFileUtils";
import {
  startPerf,
} from "src/cs/workbench/common/deviceAnalysis/perf";

type ImportWorkerPreparedFile = {
  assessment: ImportedCurveAssessment;
  file: File;
  normalizedCsvPath?: string | null;
  normalizedSizeBytes: number;
  sourcePath?: string | null;
  sourceName: string;
  sourceSizeBytes: number;
};

type RustImportPrepareResult = {
  assessment?: ImportedCurveAssessment | null;
  code?: string;
  csvText?: string;
  durationMs?: number;
  manifest?: unknown;
  message?: string;
  normalizedCsvPath?: string | null;
  normalizedSizeBytes?: number;
  ok?: boolean;
  source?: string;
  sourceName?: string;
  sourcePath?: string;
  sourceSizeBytes?: number;
};

type DesktopImportBridge = {
  prepareImportFileWithRust?: (payload: {
    fileName: string;
    path: string;
  }) => Promise<RustImportPrepareResult>;
  readConvertedCsvFileWithRust?: (payload: {
    path: string;
  }) => Promise<{ csvText?: string; ok?: boolean; sizeBytes?: number }>;
  disposeDeviceAnalysisFileWithRust?: (payload: {
    clear?: boolean;
    fileId?: string;
  }) => Promise<unknown>;
  getDeviceAnalysisPreviewRowsWithRust?: (payload: {
    endRow: number;
    fileId: string;
    startRow: number;
  }) => Promise<unknown>;
  getDeviceAnalysisDemoFiles?: () => Promise<{
    demoDir?: string;
    files?: Array<{
      fileName?: string;
      lastModified?: number;
      path?: string;
      size?: number;
      text?: string;
    }>;
  }>;
  getDeviceAnalysisPreviewMetaWithRust?: (payload: {
    fileId: string;
  }) => Promise<unknown>;
  getFilePath?: (file: File) => string;
  openDeviceAnalysisFileWithRust?: (payload: {
    fileId: string;
    fileName: string;
    path: string;
    seedRows?: number;
  }) => Promise<unknown>;
  readDeviceAnalysisCellWithRust?: (payload: {
    colIndex: number;
    fileId: string;
    rowIndex: number;
  }) => Promise<unknown>;
  readDeviceAnalysisCellsWithRust?: (payload: {
    cells: Array<{ colIndex: number; rowIndex: number }>;
    fileId: string;
  }) => Promise<unknown>;
  inferDeviceAnalysisAutoExtractionWithRust?: (payload: {
    fileId: string;
    fileName: string;
    path: string;
  }) => Promise<unknown>;
};

declare global {
  interface Window {
    desktopImport?: DesktopImportBridge;
  }
}

const getRustConvertCsvBytes = (manifest: unknown): number | null => {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return null;
  }
  const value = Number((manifest as { csvBytes?: unknown }).csvBytes);
  return Number.isFinite(value) && value >= 0 ? value : null;
};

export const loadConvertedCsvFile = async ({
  fallbackFile,
  fileName,
  lastModified,
  normalizedCsvPath,
}: {
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

  const bridge = globalThis.window?.desktopImport;
  if (!bridge?.readConvertedCsvFileWithRust) {
    return fallbackFile instanceof File ? fallbackFile : null;
  }

  try {
    const response = await bridge.readConvertedCsvFileWithRust({ path: csvPath });
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

export const prepareImportFileInWorker = async (
  file: File,
): Promise<ImportWorkerPreparedFile> => {
  const bridge = globalThis.window?.desktopImport;
  if (!bridge?.getFilePath || !bridge?.prepareImportFileWithRust) {
    throw new Error("Rust import preparation is not available.");
  }

  const filePath = bridge.getFilePath(file);
  if (!filePath) {
    throw new Error(`Unable to resolve file path for ${file.name}.`);
  }

  const finishPerf = startPerf("import:rust-prepare-file", {
    fileName: file.name,
    sizeBytes: file.size,
  });

  try {
    const result = await bridge.prepareImportFileWithRust({
      fileName: file.name,
      path: filePath,
    });
    if (!result?.ok || !result.assessment) {
      finishPerf({
        code: result?.code ?? null,
        message: result?.message ?? null,
        rustDurationMs: result?.durationMs ?? null,
        source: "rust-failed",
      });
      throw new Error(
        typeof result?.message === "string" && result.message.trim()
          ? result.message
          : `Rust import preparation failed for ${file.name}.`,
      );
    }

    const normalizedCsvPath = result.normalizedCsvPath ?? null;
    const normalizedFile =
      typeof result.csvText === "string"
        ? new File([result.csvText], file.name, {
            lastModified: Number.isFinite(file.lastModified)
              ? file.lastModified
              : Date.now(),
            type: "text/csv;charset=utf-8",
          })
        : file;
    const normalizedSizeBytes =
      getRustConvertCsvBytes(result.manifest) ??
      (Number(result.normalizedSizeBytes) || normalizedFile.size);

    finishPerf({
      confidence: result.assessment.curveTypeConfidence,
      curveType: result.assessment.curveType,
      normalizedCsvPath,
      normalizedSizeBytes,
      rustDurationMs: result.durationMs ?? null,
      source: result.source ?? "rust",
      xAxisRole: result.assessment.xAxisRole,
    });

    return {
      assessment: result.assessment,
      file: normalizedFile,
      normalizedCsvPath,
      normalizedSizeBytes,
      sourcePath: result.sourcePath ?? filePath,
      sourceName: result.sourceName ?? file.name,
      sourceSizeBytes: Number(result.sourceSizeBytes) || file.size,
    };
  } catch (error) {
    finishPerf({
      message: error instanceof Error ? error.message : String(error),
      source: "rust-failed",
    });
    throw error;
  }
};

export const resetImportWorker = () => {
  // Import preparation now runs through the desktop Rust bridge.
};
