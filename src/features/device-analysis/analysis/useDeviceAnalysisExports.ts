import { useCallback, useEffect } from "react";
import type JSZip from "jszip";
import type {
  SsIdWindow,
  SsManualRanges,
  SsMethod,
} from "../session/device-analysis-session-context";
import type { ProcessedEntry } from "../shared/lib/sharedTypes";

type DeviceAnalysisExportModule = typeof import("./lib/deviceAnalysisExport");

type UseDeviceAnalysisExportsOptions = {
  processedData?: ProcessedEntry[];
  ssIdWindow?: SsIdWindow;
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

export const useDeviceAnalysisExports = ({
  processedData = [],
  ssIdWindow,
  ssManualRanges,
  ssMethod,
}: UseDeviceAnalysisExportsOptions) => {
  const loadExportDependencies = useCallback(async () => {
    const [jsZipModule, exportModule] = await Promise.all([
      import("jszip") as Promise<{ default: typeof JSZip }>,
      import("./lib/deviceAnalysisExport"),
    ]);

    return {
      JSZip: jsZipModule.default,
      buildDeviceAnalysisCsvExports:
        exportModule.buildDeviceAnalysisCsvExports as DeviceAnalysisExportModule["buildDeviceAnalysisCsvExports"],
      buildDeviceAnalysisSsMetricsCsv:
        exportModule.buildDeviceAnalysisSsMetricsCsv as DeviceAnalysisExportModule["buildDeviceAnalysisSsMetricsCsv"],
      triggerDeviceAnalysisBlobDownload:
        exportModule.triggerDeviceAnalysisBlobDownload as DeviceAnalysisExportModule["triggerDeviceAnalysisBlobDownload"],
    };
  }, []);

  const handleExport = useCallback(async () => {
    if (processedData.length === 0) return;

    const {
      JSZip,
      buildDeviceAnalysisCsvExports,
      buildDeviceAnalysisSsMetricsCsv,
      triggerDeviceAnalysisBlobDownload,
    } = await loadExportDependencies();

    const exports = buildDeviceAnalysisCsvExports(processedData);
    if (exports.length === 0) return;

    const zip = new JSZip();
    for (const item of exports) {
      zip.file(item.filename, "\uFEFF" + item.csvText);
    }

    zip.file(
      "device_analysis_metrics.csv",
      "\uFEFF" +
        buildDeviceAnalysisSsMetricsCsv({
          processedData,
          ssIdWindow,
          ssManualRanges,
          ssMethod,
        }),
    );

    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    triggerDeviceAnalysisBlobDownload("device_analysis_export.zip", zipBlob);
  }, [loadExportDependencies, processedData, ssIdWindow, ssManualRanges, ssMethod]);

  const handleExportOrigin = useCallback(async () => {
    if (processedData.length === 0) return;

    const {
      JSZip,
      buildDeviceAnalysisCsvExports,
      triggerDeviceAnalysisBlobDownload,
    } = await loadExportDependencies();

    const exports = buildDeviceAnalysisCsvExports(processedData);
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

    triggerDeviceAnalysisBlobDownload("device_analysis.zip", zipBlob);
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
