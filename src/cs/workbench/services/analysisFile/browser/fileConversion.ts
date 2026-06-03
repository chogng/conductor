import type { URI } from "src/cs/base/common/uri";
import { getPathForFile } from "src/cs/platform/dnd/browser/dnd";
import { startPerf } from "src/cs/workbench/common/perf";
import type { AnalysisFileAssessment } from "src/cs/workbench/services/analysisFile/common/analysisFile";
import { analysisFileService } from "src/cs/workbench/services/analysisFile/browser/analysisFileService";
import { assessImportFile } from "src/cs/workbench/services/analysisFile/browser/fileAssessment";

export type PreparedBrowserFile = {
  assessment: AnalysisFileAssessment;
  file: File;
  normalizedCsvPath?: string | null;
  normalizedSizeBytes: number;
  sourcePath?: string | null;
  sourceName: string;
  sourceSizeBytes: number;
};

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
  file: File,
  resource: URI | null = null,
): Promise<PreparedBrowserFile> => {
  if (!analysisFileService.canPrepareFile()) {
    const assessment = await assessImportFile(file);
    return {
      assessment,
      file,
      normalizedCsvPath: null,
      normalizedSizeBytes: file.size,
      sourcePath: resource?.fsPath || getPathForFile(file) || null,
      sourceName: file.name,
      sourceSizeBytes: file.size,
    };
  }

  const filePath = resource?.fsPath || getPathForFile(file) || "";
  if (!filePath) {
    throw new Error(`Unable to resolve file path for ${file.name}.`);
  }

  const finishPerf = startPerf("import:rust-prepare-file", {
    fileName: file.name,
    sizeBytes: file.size,
  });

  try {
    const result = await analysisFileService.prepareFile({
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
