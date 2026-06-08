import type JSZip from "jszip";
import type { SsMethod } from "src/cs/workbench/services/session/common/session";
import type {
  FileId,
  FileRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import type { ProcessedEntry } from "src/cs/workbench/services/session/common/sessionTypes";
import type { ResolveCsvCurveLabelForSeries } from "src/cs/workbench/contrib/export/browser/export";

type ExportModule = typeof import("./export");
type ProcessedFileEntry = ProcessedEntry;
type ManualSsRangesByFileId = Record<
  string,
  Record<string, { x1?: number | null; x2?: number | null }>
>;

type UseExportsOptions = {
  fileOrder?: FileId[];
  filesById?: Record<FileId, FileRecord>;
  processedFiles?: ProcessedFileEntry[];
  resolveCurveLabelForSeries?: ResolveCsvCurveLabelForSeries;
  manualSsRangesByFileId?: ManualSsRangesByFileId;
  ssMethod?: SsMethod;
};

declare global {
  interface Window {
    __conductorDebug?: {
      [key: string]: unknown;
      analysis?: {
        exportOriginZip: () => Promise<void>;
        exportZip: () => Promise<void>;
      };
    };
  }
}

const loadExportDependencies = async () => {
  const [jsZipModule, exportModule] = await Promise.all([
    import("jszip") as Promise<{ default: typeof JSZip }>,
    import("./export"),
  ]);

  return {
    JSZip: jsZipModule.default,
    buildCsvExports:
      exportModule.buildCsvExports as ExportModule["buildCsvExports"],
    buildCsvExportsFromRecords:
      exportModule.buildCsvExportsFromRecords as ExportModule["buildCsvExportsFromRecords"],
    buildSsMetricsCsv:
      exportModule.buildSsMetricsCsv as ExportModule["buildSsMetricsCsv"],
    buildSsMetricsCsvFromRecords:
      exportModule.buildSsMetricsCsvFromRecords as ExportModule["buildSsMetricsCsvFromRecords"],
    triggerBlobDownload:
      exportModule.triggerBlobDownload as ExportModule["triggerBlobDownload"],
  };
};

export const createExports = ({
  fileOrder = [],
  filesById = {},
  processedFiles,
  resolveCurveLabelForSeries,
  manualSsRangesByFileId,
  ssMethod,
}: UseExportsOptions) => {
  const hasRecordInput = Object.keys(filesById).length > 0;
  const processedFileEntries = processedFiles ?? [];

  const handleExport = async () => {
    if (!hasRecordInput && processedFileEntries.length === 0) return;

    const {
      JSZip,
      buildCsvExports,
      buildCsvExportsFromRecords,
      buildSsMetricsCsv,
      buildSsMetricsCsvFromRecords,
      triggerBlobDownload,
    } = await loadExportDependencies();

    const exports = hasRecordInput
      ? buildCsvExportsFromRecords(filesById, fileOrder, resolveCurveLabelForSeries)
      : buildCsvExports(processedFileEntries, resolveCurveLabelForSeries);
    if (exports.length === 0) return;

    const zip = new JSZip();
    for (const item of exports) {
      zip.file(item.filename, "\uFEFF" + item.csvText);
    }

    zip.file(
      "metrics.csv",
      "\uFEFF" +
        (hasRecordInput
          ? buildSsMetricsCsvFromRecords({
            fileOrder,
            filesById,
            manualSsRangesByFileId,
            ssMethod,
          })
          : buildSsMetricsCsv({
            processedFiles: processedFileEntries,
            manualSsRangesByFileId,
            ssMethod,
          })),
    );

    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    triggerBlobDownload("export.zip", zipBlob);
  };

  const handleExportOrigin = async () => {
    if (!hasRecordInput && processedFileEntries.length === 0) return;

    const {
      JSZip,
      buildCsvExports,
      buildCsvExportsFromRecords,
      triggerBlobDownload,
    } = await loadExportDependencies();

    const exports = hasRecordInput
      ? buildCsvExportsFromRecords(filesById, fileOrder, resolveCurveLabelForSeries)
      : buildCsvExports(processedFileEntries, resolveCurveLabelForSeries);
    if (exports.length === 0) return;

    const zip = new JSZip();
    for (const item of exports) {
      zip.file(item.filename, "\uFEFF" + item.csvText);
    }

    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    triggerBlobDownload("origin.zip", zipBlob);
  };

  if (typeof window !== "undefined" && import.meta.env.DEV) {
    window.__conductorDebug = window.__conductorDebug || {};
    window.__conductorDebug.analysis = {
      exportOriginZip: handleExportOrigin,
      exportZip: handleExport,
    };
  }

  return {
    handleExport,
    handleExportOrigin,
  };
};

export const useExports = createExports;

