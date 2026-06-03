import { startPerf } from "src/cs/workbench/common/perf";
import type {
  AnalysisFileAssessment,
  IAnalysisFileService,
} from "src/cs/workbench/services/analysisFile/common/analysisFile";
import { assessImportFile } from "src/cs/workbench/services/analysisFile/browser/fileAssessment";
import {
  isExcelImportFileName,
  isXlsxImportFileName,
} from "src/cs/workbench/contrib/files/common/files";

const BROWSER_XLSX_CONVERSION_TIMEOUT_MS = 30_000;
const BROWSER_XLSX_MAX_BYTES = 32 * 1024 * 1024;

type BrowserAssessmentInput =
  | { mode: "csv" }
  | { mode: "xlsx" }
  | { mode: "unsupportedExcel" };

export type PreparedBrowserFile = {
  assessment: AnalysisFileAssessment;
  file: File;
  normalizedCsvPath?: string | null;
  normalizedSizeBytes: number;
  sourcePath?: string | null;
  sourceName: string;
  sourceSizeBytes: number;
};

export type ImportFileSource =
  | { kind: "path"; path: string }
  | { kind: "data" };

export type ImportFileMetadata = {
  readonly fileName: string;
  readonly lastModified: number;
  readonly loadFile?: () => Promise<File>;
  readonly size: number;
};

export class ImportPrepareError extends Error {
  public readonly code: string | null;

  constructor(
    message: string,
    code: string | null = null,
  ) {
    super(message);
    this.code = code;
    this.name = "ImportPrepareError";
  }
}

const getRustConvertCsvBytes = (manifest: unknown): number | null => {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return null;
  }
  const value = Number((manifest as { csvBytes?: unknown }).csvBytes);
  return Number.isFinite(value) && value >= 0 ? value : null;
};

const resolveBrowserAssessmentInput = (file: File): BrowserAssessmentInput => {
  if (!isExcelImportFileName(file.name)) {
    return { mode: "csv" };
  }

  if (isXlsxImportFileName(file.name)) {
    return { mode: "xlsx" };
  }

  return { mode: "unsupportedExcel" };
};

const shouldFallbackToBrowserFile = (code: unknown): boolean =>
  code === "IMPORT_FILE_NOT_FOUND" ||
  code === "EXCEL_FILE_NOT_FOUND" ||
  code === "INVALID_IMPORT_PATH" ||
  code === "UNRESOLVED_IMPORT_PATH";

const convertXlsxFile = (file: File): Promise<File> => {
  if (file.size > BROWSER_XLSX_MAX_BYTES) {
    throw new ImportPrepareError(
      `Excel file is too large for browser conversion: ${file.name}.`,
      "BROWSER_XLSX_FILE_TOO_LARGE",
    );
  }

  const worker = new Worker(new URL("./xlsxConversionWorker.ts", import.meta.url), {
    type: "module",
  });
  const requestId = Date.now();

  return new Promise<File>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      worker.terminate();
      reject(new ImportPrepareError(
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

      reject(new ImportPrepareError(
        message.error || `Failed to convert ${file.name}.`,
        "BROWSER_XLSX_CONVERSION_FAILED",
      ));
    };
    worker.onerror = (event) => {
      finish();
      reject(new ImportPrepareError(
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

const prepareBrowserFile = async (
  file: File,
  sourcePath: string | null,
): Promise<PreparedBrowserFile> => {
  const input = resolveBrowserAssessmentInput(file);
  if (input.mode !== "csv") {
    if (input.mode === "unsupportedExcel") {
      throw new ImportPrepareError(
        `Excel import requires a conversion service for ${file.name}.`,
        "EXCEL_CONVERSION_UNAVAILABLE",
      );
    }

    const convertedFile = await convertXlsxFile(file);
    const assessment = await assessImportFile(convertedFile);
    return {
      assessment,
      file: convertedFile,
      normalizedCsvPath: null,
      normalizedSizeBytes: convertedFile.size,
      sourcePath,
      sourceName: file.name,
      sourceSizeBytes: file.size,
    };
  }

  const assessment = await assessImportFile(file);
  return {
    assessment,
    file,
    normalizedCsvPath: null,
    normalizedSizeBytes: file.size,
    sourcePath,
    sourceName: file.name,
    sourceSizeBytes: file.size,
  };
};

export const loadConvertedCsvFile = async ({
  analysisFileService,
  fallbackFile,
  fileName,
  lastModified,
  normalizedCsvPath,
}: {
  analysisFileService: IAnalysisFileService;
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

  if (!analysisFileService.canReadConvertedCsv()) {
    return fallbackFile instanceof File ? fallbackFile : null;
  }

  try {
    const response = await analysisFileService.readConvertedCsv({ path: csvPath });
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

export const prepareImportFile = async (
  analysisFileService: IAnalysisFileService,
  file: File | null,
  source: ImportFileSource,
  metadata: ImportFileMetadata,
): Promise<PreparedBrowserFile> => {
  const sourcePath = source.kind === "path" ? source.path.trim() : null;
  const loadBrowserFile = async (): Promise<File> => {
    if (file) {
      return file;
    }
    if (metadata.loadFile) {
      return metadata.loadFile();
    }
    throw new ImportPrepareError(
      `File content is unavailable for ${metadata.fileName}.`,
      "IMPORT_FILE_CONTENT_UNAVAILABLE",
    );
  };

  if (!analysisFileService.canPrepareFile()) {
    return prepareBrowserFile(await loadBrowserFile(), sourcePath);
  }

  if (source.kind !== "path" || !sourcePath) {
    return prepareBrowserFile(await loadBrowserFile(), null);
  }

  const finishPerf = startPerf("import:rust-prepare-file", {
    fileName: metadata.fileName,
    sizeBytes: metadata.size,
  });

  try {
    const result = await analysisFileService.prepareFile({
      fileName: metadata.fileName,
      path: sourcePath,
    });
    if (!result?.ok || !result.assessment) {
      finishPerf({
        code: result?.code ?? null,
        message: result?.message ?? null,
        rustDurationMs: result?.durationMs ?? null,
        source: "rust-failed",
      });
      if (shouldFallbackToBrowserFile(result?.code)) {
        return prepareBrowserFile(await loadBrowserFile(), null);
      }
      throw new ImportPrepareError(
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
        : file ?? new File([], metadata.fileName, {
            lastModified: Number.isFinite(metadata.lastModified)
              ? metadata.lastModified
              : Date.now(),
            type: "text/csv;charset=utf-8",
          });
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
