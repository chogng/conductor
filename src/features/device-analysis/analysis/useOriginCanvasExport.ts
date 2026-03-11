import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import Papa from "papaparse";
import JSZip from "jszip";
import {
  buildDeviceAnalysisOriginOgsScript,
  DEVICE_ANALYSIS_ORIGIN_README,
  triggerDeviceAnalysisBlobDownload,
} from "./lib/deviceAnalysisExport";
import {
  buildOriginXAxisRangeCommandsFromDisplayRange,
  buildOriginYAxisRangeCommands,
  buildOriginYAxisRangeCommandsFromDisplayRange,
  resolveOriginLogPositiveMinForRange,
} from "./lib/originAxisCommands";
import { formatOriginBridgeError } from "./lib/originBridgeError";
import {
  DEFAULT_ORIGIN_PLOT_OPTIONS,
  normalizeOriginPlotOptions,
} from "./lib/originPlotOptions";

const ORIGIN_CSV_AUTO_ZIP_FALLBACK_CODES = new Set([
  "ORIGIN_ORIGINPRO_IMPORT_FAILED",
  "ORIGIN_PYTHON_NOT_FOUND",
  "ORIGIN_CSV_RUNNER_NOT_FOUND",
  "ORIGIN_CSV_RUNNER_FAILED",
  "ORIGIN_CSV_FAILED",
  "ORIGIN_CSV_IMPORT_FAILED",
]);

type UseOriginCanvasExportOptions = {
  activeFile: any;
  axisYScale: unknown;
  effectiveActiveFileId: unknown;
  getDesktopOriginBridge: () => any;
  isWindowsDesktopShell: boolean;
  originChartXRangeRef: MutableRefObject<{ min: number; max: number } | null>;
  originChartYRangeRef: MutableRefObject<{
    mode: "linear" | "log";
    min: number;
    max: number;
  } | null>;
  originOpenPlotOptions: unknown;
  processedData: any[];
  showToast: (message: string, type?: any) => void;
  t: (key: string, params?: any) => string;
  tLoose: (key: string, params?: any) => string;
};

const sanitizeFilename = (name: any, { max = 180 }: any = {}) => {
  const raw = String(name || "export")
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "export";
  return raw.length > max ? raw.slice(0, max) : raw;
};

const sanitizeOriginDisplayName = (name: any, { max = 180 }: any = {}) => {
  const raw = String(name || "")
    .replace(/[\\_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "device analysis";
  return raw.length > max ? raw.slice(0, max).trim() : raw;
};

const buildOriginSharedXyPairs = (yCount: number) => {
  const safeYCount = Number.isFinite(yCount) ? Math.max(1, Math.floor(yCount)) : 1;
  const chunks = new Array(safeYCount);
  for (let i = 0; i < safeYCount; i += 1) {
    const yCol = i + 2;
    chunks[i] = `(1,${yCol})`;
  }
  return `(${chunks.join(",")})`;
};

export const useOriginCanvasExport = ({
  activeFile,
  axisYScale,
  effectiveActiveFileId,
  getDesktopOriginBridge,
  isWindowsDesktopShell,
  originChartXRangeRef,
  originChartYRangeRef,
  originOpenPlotOptions,
  processedData,
  showToast,
  t,
  tLoose,
}: UseOriginCanvasExportOptions) => {
  const originBusyRef = useRef(false);
  const [originSelectedSeriesIdsByFile, setOriginSelectedSeriesIdsByFile] =
    useState<Record<string, string[]>>({});
  const [originSelectedCanvasIds, setOriginSelectedCanvasIds] = useState<string[]>(
    () => {
      const firstFileId = String(processedData?.[0]?.fileId ?? "");
      return firstFileId ? [firstFileId] : [];
    },
  );

  const originCanvasOptions = useMemo(() => {
    const list = Array.isArray(processedData) ? processedData : [];
    return list
      .map((file: any) => {
        const key = String(file?.fileId ?? "");
        if (!key) return null;
        return {
          key,
          file,
          label: String(file?.fileName ?? key),
        };
      })
      .filter(Boolean);
  }, [processedData]);

  useEffect(() => {
    setOriginSelectedCanvasIds((prev) => {
      const liveKeys = originCanvasOptions
        .map((item: any) => String(item?.key ?? ""))
        .filter(Boolean);
      if (!liveKeys.length) {
        return prev.length ? [] : prev;
      }

      const liveKeySet = new Set(liveKeys);
      const prevList = Array.isArray(prev) ? prev : [];
      const filtered = prevList
        .map((item) => String(item ?? ""))
        .filter(
          (item, idx, arr) =>
            Boolean(item) && liveKeySet.has(item) && arr.indexOf(item) === idx,
        );

      if (filtered.length) {
        const unchanged =
          filtered.length === prevList.length &&
          filtered.every((value, idx) => value === prevList[idx]);
        return unchanged ? prev : filtered;
      }

      const fallbackKey = String(effectiveActiveFileId ?? "");
      const next =
        fallbackKey && liveKeySet.has(fallbackKey) ? [fallbackKey] : [liveKeys[0]];
      const unchanged =
        next.length === prevList.length &&
        next.every((value, idx) => value === prevList[idx]);
      return unchanged ? prev : next;
    });
  }, [effectiveActiveFileId, originCanvasOptions]);

  useEffect(() => {
    setOriginSelectedSeriesIdsByFile((prev) => {
      const next: Record<string, string[]> = {};
      const keep = new Set(
        (Array.isArray(processedData) ? processedData : [])
          .map((file: any) => String(file?.fileId ?? ""))
          .filter(Boolean),
      );

      for (const [key, list] of Object.entries(prev || {})) {
        if (!keep.has(key) || !Array.isArray(list)) continue;
        next[key] = list.map((item) => String(item ?? "")).filter(Boolean);
      }

      const prevKeys = Object.keys(prev || {});
      const nextKeys = Object.keys(next);
      const unchanged =
        prevKeys.length === nextKeys.length &&
        prevKeys.every((key) => {
          const prevList = Array.isArray(prev?.[key]) ? prev[key] : [];
          const nextList = Array.isArray(next?.[key]) ? next[key] : [];
          return (
            prevList.length === nextList.length &&
            prevList.every((value, idx) => value === nextList[idx])
          );
        });

      return unchanged ? prev : next;
    });
  }, [processedData]);

  const activeOriginSeries = useMemo(() => {
    const list = Array.isArray(activeFile?.series) ? activeFile.series : [];
    return list
      .map((series: any) => {
        const key = String(series?.id ?? "");
        if (!key) return null;
        return {
          id: series.id,
          key,
          name: String(series?.name ?? key),
        };
      })
      .filter(Boolean);
  }, [activeFile?.series]);

  const getSelectedOriginSeriesKeySetForFile = useCallback(
    (file: any) => {
      const allSeries = Array.isArray(file?.series) ? file.series : [];
      const allKeys = allSeries
        .map((series: any) => String(series?.id ?? ""))
        .filter(Boolean);
      if (!allKeys.length) return new Set<string>();

      const fileKey = String(file?.fileId ?? "");
      if (!fileKey) return new Set(allKeys);

      const stored = originSelectedSeriesIdsByFile?.[fileKey];
      if (!Array.isArray(stored)) return new Set(allKeys);

      const live = new Set(allKeys);
      const filtered = stored
        .map((item) => String(item ?? ""))
        .filter((item) => live.has(item));
      if (!filtered.length && stored.length > 0) return new Set(allKeys);

      return new Set(filtered);
    },
    [originSelectedSeriesIdsByFile],
  );

  const selectedOriginSeriesKeySet = useMemo(
    () => getSelectedOriginSeriesKeySetForFile(activeFile),
    [activeFile, getSelectedOriginSeriesKeySetForFile],
  );

  const selectedOriginCanvasKeySet = useMemo(() => {
    return new Set(
      originSelectedCanvasIds
        .map((item) => String(item ?? ""))
        .filter(Boolean),
    );
  }, [originSelectedCanvasIds]);

  const selectedOriginCanvases = useMemo(() => {
    return originCanvasOptions
      .filter((item: any) => selectedOriginCanvasKeySet.has(item.key))
      .map((item: any) => item.file);
  }, [originCanvasOptions, selectedOriginCanvasKeySet]);

  const toggleOriginCanvasSelection = useCallback((fileId: any) => {
    const targetKey = String(fileId ?? "");
    if (!targetKey) return;

    setOriginSelectedCanvasIds((prev) => {
      const current = Array.isArray(prev)
        ? prev.map((item) => String(item ?? "")).filter(Boolean)
        : [];
      if (current.includes(targetKey)) {
        return current.filter((item) => item !== targetKey);
      }
      return [...current, targetKey];
    });
  }, []);

  const selectAllOriginCanvases = useCallback(() => {
    const allKeys = originCanvasOptions
      .map((item: any) => String(item?.key ?? ""))
      .filter(Boolean);
    setOriginSelectedCanvasIds(allKeys);
  }, [originCanvasOptions]);

  const clearOriginCanvasSelection = useCallback(() => {
    setOriginSelectedCanvasIds([]);
  }, []);

  const toggleOriginSeriesSelection = useCallback(
    (seriesId: any) => {
      const fileKey = String(activeFile?.fileId ?? "");
      const targetKey = String(seriesId ?? "");
      if (!fileKey || !targetKey) return;

      setOriginSelectedSeriesIdsByFile((prev) => {
        const allKeys = activeOriginSeries.map((series: any) => series.key);
        const live = new Set(allKeys);
        const stored = prev?.[fileKey];
        const current = Array.isArray(stored)
          ? stored.map((item) => String(item ?? "")).filter((item) => live.has(item))
          : [...allKeys];
        const hasTarget = current.includes(targetKey);
        const nextSelected = hasTarget
          ? current.filter((item) => item !== targetKey)
          : [...current, targetKey];

        return {
          ...(prev || {}),
          [fileKey]: nextSelected,
        };
      });
    },
    [activeFile?.fileId, activeOriginSeries],
  );

  const buildOriginCsvPayloadForCanvas = useCallback(
    (canvasFile: any) => {
      const allSeries = Array.isArray(canvasFile?.series) ? canvasFile.series : [];
      if (!canvasFile?.fileId || !allSeries.length) {
        return null;
      }

      const selectedSeriesKeySet = getSelectedOriginSeriesKeySetForFile(canvasFile);
      const selectedSeries = allSeries.filter((series: any) =>
        selectedSeriesKeySet.has(String(series?.id ?? "")),
      );
      if (!selectedSeries.length) {
        return null;
      }

      const curveEntries = selectedSeries
        .map((series: any) => {
          const groupIndex = Number(series?.groupIndex);
          const xArr = canvasFile?.xGroups?.[groupIndex];
          const yArr = series?.y;
          const rowCount = Math.min(xArr?.length ?? 0, yArr?.length ?? 0);
          if (!xArr || !yArr || rowCount <= 0) return null;
          return { xArr, yArr, rowCount };
        })
        .filter(Boolean);
      if (!curveEntries.length) {
        return null;
      }

      let yLinearMin = Number.POSITIVE_INFINITY;
      let yLinearMax = Number.NEGATIVE_INFINITY;
      let yPositiveMin = Number.POSITIVE_INFINITY;
      let yPositiveMax = Number.NEGATIVE_INFINITY;
      const yPositiveValues: number[] = [];

      for (const entry of curveEntries as any[]) {
        const rowCount = Number(entry?.rowCount);
        const yArr = entry?.yArr;
        const hasArrayLikeY =
          yArr != null && Number.isFinite(Number((yArr as any).length));
        if (!hasArrayLikeY || !Number.isFinite(rowCount) || rowCount <= 0) {
          continue;
        }

        for (let idx = 0; idx < rowCount; idx += 1) {
          const y = Number(yArr[idx]);
          if (!Number.isFinite(y)) continue;
          if (y < yLinearMin) yLinearMin = y;
          if (y > yLinearMax) yLinearMax = y;
          if (y > 0) {
            if (y < yPositiveMin) yPositiveMin = y;
            if (y > yPositiveMax) yPositiveMax = y;
            yPositiveValues.push(y);
          }
        }
      }

      const yPositiveMinResolved = Number.isFinite(yPositiveMin)
        ? resolveOriginLogPositiveMinForRange(yPositiveValues, yPositiveMin)
        : null;
      const maxRowCount = curveEntries.reduce(
        (max: number, entry: any) => Math.max(max, entry.rowCount),
        0,
      );
      const rows = new Array(maxRowCount);
      const sharedX = curveEntries[0]?.xArr;
      for (let i = 0; i < maxRowCount; i += 1) {
        const row: any[] = [];
        row.push(i < (sharedX?.length ?? 0) ? sharedX[i] ?? "" : "");
        for (const entry of curveEntries as any[]) {
          row.push(i < entry.rowCount ? entry.yArr[i] ?? "" : "");
        }
        rows[i] = row;
      }

      const csvText = Papa.unparse(rows);
      const base = sanitizeFilename(canvasFile?.fileName ?? "device_analysis").replace(
        /\.csv$/i,
        "",
      );
      const csvName = `${base}__all_curves.csv`;
      const seriesName = sanitizeOriginDisplayName(base);

      return {
        csvName,
        csvText: "\uFEFF" + csvText,
        seriesName,
        xyPairCount: curveEntries.length,
        xyPairs: buildOriginSharedXyPairs(curveEntries.length),
        yLinearMin: Number.isFinite(yLinearMin) ? yLinearMin : null,
        yLinearMax: Number.isFinite(yLinearMax) ? yLinearMax : null,
        yPositiveMin: yPositiveMinResolved,
        yPositiveMax: Number.isFinite(yPositiveMax) ? yPositiveMax : null,
      };
    },
    [getSelectedOriginSeriesKeySetForFile],
  );

  const buildOriginCsvPayloadsForSelectedCanvases = useCallback(() => {
    if (!selectedOriginCanvases.length) {
      throw new Error(t("da_origin_select_canvas"));
    }

    const payloads = selectedOriginCanvases
      .map((canvasFile: any) => buildOriginCsvPayloadForCanvas(canvasFile))
      .filter(Boolean);
    if (!payloads.length) {
      throw new Error(t("da_origin_select_curve"));
    }

    return payloads as any[];
  }, [buildOriginCsvPayloadForCanvas, selectedOriginCanvases, t]);

  const exportOriginZipFallbackForSelectedCanvases = useCallback(async () => {
    const payloads = buildOriginCsvPayloadsForSelectedCanvases();
    const zip = new JSZip();
    zip.file("README_ORIGIN.txt", DEVICE_ANALYSIS_ORIGIN_README);

    const usedCsvNames = new Set<string>();
    const toUniqueCsvName = (rawName: any, idx: number) => {
      const safe = sanitizeFilename(rawName || `canvas_${idx + 1}__all_curves.csv`);
      const normalized = /\.csv$/i.test(safe) ? safe : `${safe}.csv`;
      if (!usedCsvNames.has(normalized)) {
        usedCsvNames.add(normalized);
        return normalized;
      }

      const stem = normalized.replace(/\.csv$/i, "");
      let suffix = 2;
      let candidate = `${stem}__${suffix}.csv`;
      while (usedCsvNames.has(candidate)) {
        suffix += 1;
        candidate = `${stem}__${suffix}.csv`;
      }
      usedCsvNames.add(candidate);
      return candidate;
    };

    payloads.forEach((pkg: any, idx: number) => {
      const csvName = toUniqueCsvName(pkg?.csvName, idx);
      zip.file(csvName, pkg.csvText);
      const ogsName = csvName.replace(/\.csv$/i, ".ogs");
      zip.file(
        ogsName,
        buildDeviceAnalysisOriginOgsScript(csvName, pkg.xyPairCount, pkg.xyPairs),
      );
    });

    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
    const zipBase =
      payloads.length === 1
        ? sanitizeFilename(payloads[0]?.seriesName || "device_analysis")
        : sanitizeFilename(`device_analysis_batch_${payloads.length}_canvases`);
    const zipName = `${String(zipBase || "device_analysis").replace(
      /\.zip$/i,
      "",
    )}__origin.zip`;
    triggerDeviceAnalysisBlobDownload(zipName, zipBlob);
    return { zipName, count: payloads.length };
  }, [buildOriginCsvPayloadsForSelectedCanvases]);

  const handleOpenInOrigin = useCallback(async () => {
    if (originBusyRef.current) return;

    try {
      originBusyRef.current = true;
      const originBridge = getDesktopOriginBridge();
      if (!originBridge) {
        throw new Error(t("da_origin_pick_exe_required"));
      }

      const payloads = buildOriginCsvPayloadsForSelectedCanvases();
      const normalizedPlotOptions = normalizeOriginPlotOptions(
        originOpenPlotOptions,
        DEFAULT_ORIGIN_PLOT_OPTIONS,
      );
      const hasCustomPlotCommand =
        typeof normalizedPlotOptions.command === "string" &&
        normalizedPlotOptions.command.trim().length > 0;
      const hasCustomXyPairs =
        String(normalizedPlotOptions.xyPairs || "").trim() !==
        DEFAULT_ORIGIN_PLOT_OPTIONS.xyPairs;
      const chartXRange = originChartXRangeRef.current;
      const chartYRange = originChartYRangeRef.current;
      const originYScaleMode = chartYRange?.mode
        ? chartYRange.mode
        : String(axisYScale ?? "linear") === "log"
          ? "log"
          : "linear";
      const originYAxisTypeCommand =
        originYScaleMode === "log" ? "layer.y.type=2" : "layer.y.type=1";
      const shouldApplySmartYAxisRange = !hasCustomPlotCommand;

      for (const pkg of payloads) {
        const effectiveXyPairs =
          !hasCustomPlotCommand && !hasCustomXyPairs
            ? pkg.xyPairs
            : normalizedPlotOptions.xyPairs;
        const displayXRangeCommands =
          buildOriginXAxisRangeCommandsFromDisplayRange(chartXRange);
        const displayRangeCommands =
          buildOriginYAxisRangeCommandsFromDisplayRange(
            originYScaleMode,
            chartYRange,
          );
        const smartYRangeCommands = shouldApplySmartYAxisRange
          ? displayRangeCommands.length
            ? displayRangeCommands
            : buildOriginYAxisRangeCommands(originYScaleMode, pkg)
          : [];
        const originAxisCommands = [
          originYAxisTypeCommand,
          "layer.x.opposite=1",
          "layer.y.opposite=1",
          ...displayXRangeCommands,
          ...smartYRangeCommands,
        ];

        await originBridge.runOriginCsv({
          csv: {
            name: pkg.csvName,
            text: pkg.csvText,
          },
          sheet: {
            longName: pkg.seriesName,
          },
          plot: {
            command: normalizedPlotOptions.command,
            postCommands: normalizedPlotOptions.postCommands,
            type: normalizedPlotOptions.type,
            lineWidth: normalizedPlotOptions.lineWidth,
            xyPairs: effectiveXyPairs,
          },
          capabilities: {
            axis: {
              commands: originAxisCommands,
            },
          },
        });
      }

      if (payloads.length > 1) {
        showToast(t("da_open_in_origin_batch_success", { count: payloads.length }), "success");
      } else {
        showToast(t("da_open_in_origin_success"), "success");
      }
    } catch (err) {
      const detail = formatOriginBridgeError(tLoose, err);
      if (detail.code === "ORIGIN_EXE_REQUIRED") {
        showToast(t("da_origin_pick_exe_required"), "error");
      } else if (
        ORIGIN_CSV_AUTO_ZIP_FALLBACK_CODES.has(
          String(detail.code || "").trim().toUpperCase(),
        )
      ) {
        const fallbackReasonParts = [
          String(detail.code || "").trim().toUpperCase(),
          String(detail.stage || "").trim().toUpperCase(),
          String(detail.originExe || "").trim()
            ? `EXE=${String(detail.originExe || "").trim()}`
            : "",
        ].filter((item) => item.length > 0);
        const fallbackReason =
          fallbackReasonParts.length > 0
            ? fallbackReasonParts.join(" @ ")
            : detail.message || t("unknownError");
        try {
          const fallback = await exportOriginZipFallbackForSelectedCanvases();
          if (fallback.count > 1) {
            showToast(
              t("da_open_in_origin_fallback_zip_batch_success_with_reason", {
                count: fallback.count,
                reason: fallbackReason,
              }),
              "warning",
            );
          } else {
            showToast(
              t("da_open_in_origin_fallback_zip_success_with_reason", {
                reason: fallbackReason,
              }),
              "warning",
            );
          }
        } catch (fallbackErr) {
          const fallbackMessage =
            fallbackErr instanceof Error
              ? fallbackErr.message
              : String(fallbackErr ?? t("unknownError"));
          showToast(
            t("da_open_in_origin_fallback_zip_failed", {
              error: fallbackMessage,
            }),
            "error",
          );
        }
      } else {
        showToast(
          t("da_open_in_origin_failed", { error: detail.messageText }),
          "error",
        );
      }
    } finally {
      originBusyRef.current = false;
    }
  }, [
    axisYScale,
    buildOriginCsvPayloadsForSelectedCanvases,
    exportOriginZipFallbackForSelectedCanvases,
    getDesktopOriginBridge,
    originChartXRangeRef,
    originChartYRangeRef,
    originOpenPlotOptions,
    showToast,
    t,
    tLoose,
  ]);

  useEffect(() => {
    if (typeof window === "undefined" || !isWindowsDesktopShell) {
      return undefined;
    }

    const handleOpenOriginRequest = () => {
      void handleOpenInOrigin();
    };
    window.addEventListener("device-analysis:open-origin", handleOpenOriginRequest);
    return () => {
      window.removeEventListener(
        "device-analysis:open-origin",
        handleOpenOriginRequest,
      );
    };
  }, [handleOpenInOrigin, isWindowsDesktopShell]);

  return {
    activeOriginSeries,
    clearOriginCanvasSelection,
    handleOpenInOrigin,
    originCanvasOptions,
    selectAllOriginCanvases,
    selectedOriginCanvasKeySet,
    selectedOriginCanvases,
    selectedOriginSeriesKeySet,
    toggleOriginCanvasSelection,
    toggleOriginSeriesSelection,
  };
};
