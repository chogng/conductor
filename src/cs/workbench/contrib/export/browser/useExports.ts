import type JSZip from "jszip";
import type {
  SsManualRanges,
  SsMethod,
} from "src/cs/workbench/contrib/session/browser/sessionContext";
import type { CleanedEntry } from "src/cs/workbench/contrib/session/common/sessionTypes";

type ExportModule = typeof import("./export");

type UseExportsOptions = {
  cleanedData?: CleanedEntry[];
  ssManualRanges?: SsManualRanges;
  ssMethod?: SsMethod;
};

declare global {
  interface Window {
    __conductorDebug?: {
      [key: string]: unknown;
      deviceAnalysis?: {
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
    buildSsMetricsCsv:
      exportModule.buildSsMetricsCsv as ExportModule["buildSsMetricsCsv"],
    triggerBlobDownload:
      exportModule.triggerBlobDownload as ExportModule["triggerBlobDownload"],
  };
};

export const createExports = ({
  cleanedData = [],
  ssManualRanges,
  ssMethod,
}: UseExportsOptions) => {
  const handleExport = async () => {
    if (cleanedData.length === 0) return;

    const {
      JSZip,
      buildCsvExports,
      buildSsMetricsCsv,
      triggerBlobDownload,
    } = await loadExportDependencies();

    const exports = buildCsvExports(cleanedData);
    if (exports.length === 0) return;

    const zip = new JSZip();
    for (const item of exports) {
      zip.file(item.filename, "\uFEFF" + item.csvText);
    }

    zip.file(
      "device_analysis_metrics.csv",
      "\uFEFF" +
        buildSsMetricsCsv({
          cleanedData,
          ssManualRanges,
          ssMethod,
        }),
    );

    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    triggerBlobDownload("device_analysis_export.zip", zipBlob);
  };

  const handleExportOrigin = async () => {
    if (cleanedData.length === 0) return;

    const {
      JSZip,
      buildCsvExports,
      triggerBlobDownload,
    } = await loadExportDependencies();

    const exports = buildCsvExports(cleanedData);
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

    triggerBlobDownload("device_analysis.zip", zipBlob);
  };

  if (typeof window !== "undefined" && import.meta.env.DEV) {
    window.__conductorDebug = window.__conductorDebug || {};
    window.__conductorDebug.deviceAnalysis = {
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
