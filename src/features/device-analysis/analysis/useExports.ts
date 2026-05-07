import { useCallback, useEffect } from "react";
import type JSZip from "jszip";
import type {
  SsManualRanges,
  SsMethod,
} from "../session/analysis-session-context";
import type { ProcessedEntry } from "../shared/lib/sharedTypes";

type ExportModule = typeof import("./lib/export");

type UseExportsOptions = {
  processedData?: ProcessedEntry[];
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

export const useExports = ({
  processedData = [],
  ssManualRanges,
  ssMethod,
}: UseExportsOptions) => {
  const loadExportDependencies = useCallback(async () => {
    const [jsZipModule, exportModule] = await Promise.all([
      import("jszip") as Promise<{ default: typeof JSZip }>,
      import("./lib/export"),
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
  }, []);

  const handleExport = useCallback(async () => {
    if (processedData.length === 0) return;

    const {
      JSZip,
      buildCsvExports,
      buildSsMetricsCsv,
      triggerBlobDownload,
    } = await loadExportDependencies();

    const exports = buildCsvExports(processedData);
    if (exports.length === 0) return;

    const zip = new JSZip();
    for (const item of exports) {
      zip.file(item.filename, "\uFEFF" + item.csvText);
    }

    zip.file(
      "device_analysis_metrics.csv",
      "\uFEFF" +
        buildSsMetricsCsv({
          processedData,
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
  }, [loadExportDependencies, processedData, ssManualRanges, ssMethod]);

  const handleExportOrigin = useCallback(async () => {
    if (processedData.length === 0) return;

    const {
      JSZip,
      buildCsvExports,
      triggerBlobDownload,
    } = await loadExportDependencies();

    const exports = buildCsvExports(processedData);
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
  }, [loadExportDependencies, processedData]);

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;

    window.__conductorDebug = window.__conductorDebug || {};
    window.__conductorDebug.deviceAnalysis = {
      exportOriginZip: handleExportOrigin,
      exportZip: handleExport,
    };

    return () => {
      if (window.__conductorDebug?.deviceAnalysis) {
        delete window.__conductorDebug.deviceAnalysis;
      }
    };
  }, [handleExport, handleExportOrigin]);

  return {
    handleExport,
    handleExportOrigin,
  };
};
