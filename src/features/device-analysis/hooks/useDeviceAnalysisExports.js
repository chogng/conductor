import { useCallback, useEffect } from "react";
import JSZip from "jszip";
import {
  buildDeviceAnalysisCsvExports,
  buildDeviceAnalysisOriginOgsScript,
  buildDeviceAnalysisSsMetricsCsv,
  DEVICE_ANALYSIS_ORIGIN_README,
  triggerDeviceAnalysisBlobDownload,
} from "../lib/deviceAnalysisExport";

export const useDeviceAnalysisExports = ({
  processedData = [],
  ssIdWindow,
  ssManualRanges,
  ssMethod,
}) => {
  const handleExport = useCallback(async () => {
    if (processedData.length === 0) return;

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
  }, [processedData, ssIdWindow, ssManualRanges, ssMethod]);

  const handleExportOrigin = useCallback(async () => {
    if (processedData.length === 0) return;

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
  }, [processedData]);

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
