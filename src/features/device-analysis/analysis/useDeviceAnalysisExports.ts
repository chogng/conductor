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
    __appointerDebug?: {
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
      buildDeviceAnalysisOriginOgsScript:
        exportModule.buildDeviceAnalysisOriginOgsScript as DeviceAnalysisExportModule["buildDeviceAnalysisOriginOgsScript"],
      buildDeviceAnalysisSsMetricsCsv:
        exportModule.buildDeviceAnalysisSsMetricsCsv as DeviceAnalysisExportModule["buildDeviceAnalysisSsMetricsCsv"],
      DEVICE_ANALYSIS_ORIGIN_README:
        exportModule.DEVICE_ANALYSIS_ORIGIN_README as DeviceAnalysisExportModule["DEVICE_ANALYSIS_ORIGIN_README"],
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
      buildDeviceAnalysisOriginOgsScript,
      DEVICE_ANALYSIS_ORIGIN_README,
      triggerDeviceAnalysisBlobDownload,
    } = await loadExportDependencies();

    const exports = buildDeviceAnalysisCsvExports(processedData);
    if (exports.length === 0) return;

    const zip = new JSZip();
    zip.file("README_ORIGIN.txt", DEVICE_ANALYSIS_ORIGIN_README);

    for (const item of exports) {
      zip.file(item.filename, "\uFEFF" + item.csvText);

      const ogsName = String(item.filename).replace(/\.csv$/i, ".ogs");
      zip.file(ogsName, buildDeviceAnalysisOriginOgsScript(item.filename, item.xyPairCount));
    }

    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    triggerDeviceAnalysisBlobDownload("device_analysis_origin.zip", zipBlob);
  }, [loadExportDependencies, processedData]);

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;

    window.__appointerDebug = window.__appointerDebug || {};
    window.__appointerDebug.deviceAnalysis = {
      exportOriginZip: handleExportOrigin,
      exportZip: handleExport,
    };

    return () => {
      if (window.__appointerDebug?.deviceAnalysis) {
        delete window.__appointerDebug.deviceAnalysis;
      }
    };
  }, [handleExport, handleExportOrigin]);

  return {
    handleExport,
    handleExportOrigin,
  };
};
