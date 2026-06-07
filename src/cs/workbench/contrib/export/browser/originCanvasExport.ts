import { localize } from "src/cs/nls";
import type { MutableState } from "src/cs/workbench/services/session/common/session";
import {
  exportOriginZip,
  type OriginDisplayRange,
} from "src/cs/workbench/contrib/origin/browser/originController";
import {
  buildOriginExportPlan,
  getRustOriginCsvDerivedContentKey,
  isRustOriginCsvEligiblePayload,
  isOriginExportMode,
  resolveSeriesLabel,
  resolveRustOriginCsvYTransformForPayload,
  type OriginExportContentKey,
  type OriginExportPlan,
  type OriginExportMode,
  type OriginYAxisScaleMode,
} from "src/cs/workbench/contrib/export/common/originSelectionExport";
import {
  BrowserExportService,
} from "src/cs/workbench/contrib/export/browser/exportService";
import {
  getXUnitMeta,
  getYUnitMeta,
} from "src/cs/workbench/contrib/plot/common/units";
import { createOriginCanvasSelection } from "src/cs/workbench/contrib/export/browser/originCanvasSelection";

export type OriginCanvasExportScope =
  | "current"
  | "filtered"
  | "selected"
  | "all";

export type OriginFilteredCanvasKind = "transfer" | "output";
export type OriginCurveExportMode = "all" | "select";

type UseOriginCanvasExportOptions = {
  activeFile: any;
  canvasExportScope?: OriginCanvasExportScope;
  curveExportMode?: OriginCurveExportMode;
  filteredCanvasKind?: OriginFilteredCanvasKind;
  effectiveActiveFileId: unknown;
  isWindowsDesktopShell: boolean;
  originChartXRangeRef: MutableState<OriginDisplayRange | null>;
  originChartYRangeRef: MutableState<{
    mode: "linear" | "log";
    min: number;
    max: number;
    step?: number | null;
  } | null>;
  originExportMode?: unknown;
  originExportContentKeys?: OriginExportContentKey[];
  originAxisSettings?: unknown;
  originOpenPlotOptions: unknown;
  cleanedData: any[];
  resolveYScaleForFile?: (
    file: any,
  ) => OriginYAxisScaleMode;
  resolveYLogCurrentModeForFile?: (
    file: any,
  ) => "all" | "positive";
  resolveCurveLabelForSeries?: (
    file: any,
    series: any,
    index: number,
  ) => string;
  resolveAxisTitleForFile?: (
    file: any,
    axis: "x" | "y",
  ) => string | null | undefined;
  resolveYUnitForFile?: (file: any) => string;
  showToast: (message: string, type?: any) => void;
  visibleOriginCanvasIds?: string[];
};

const buildOriginXGroupKey = (xArr: unknown): string =>
  Array.isArray(xArr) ? xArr.map((value) => String(Number(value))).join(",") : "";

export const normalizeOriginSeriesToken = (value: unknown): string | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `num:${Number(Number(value).toPrecision(12))}`;
  }
  const text = String(value ?? "").trim();
  if (!text) return null;
  const asNumber = Number(text);
  if (Number.isFinite(asNumber)) {
    return `num:${Number(Number(asNumber).toPrecision(12))}`;
  }
  return `txt:${text.toLowerCase()}`;
};

export const resolveOriginSeriesMatchTokens = (series: any): string[] => {
  const legendToken = normalizeOriginSeriesToken(series?.legendValue);
  if (legendToken) return [`legend:${legendToken}`];

  const nameToken = normalizeOriginSeriesToken(series?.name);
  return nameToken ? [`name:${nameToken}`] : [];
};

const resolveOriginFileCurveFamily = (file: any): string | null => {
  const xAxisRole = String(file?.xAxisRole ?? "")
    .trim()
    .toLowerCase();
  if (xAxisRole === "vg") return "transfer";
  if (xAxisRole === "vd") return "output";

  const curveType = String(file?.curveType ?? "")
    .trim()
    .toLowerCase();
  if (!curveType) return null;
  if (curveType.includes("transfer")) return "transfer";
  if (curveType.includes("output")) return "output";
  return curveType;
};

const normalizeIds = (items: unknown[]): string[] =>
  (Array.isArray(items) ? items : [])
    .map((item) => String(item ?? "").trim())
    .filter((item, index, arr) => Boolean(item) && arr.indexOf(item) === index);

export const createOriginCanvasExport = ({
  activeFile,
  canvasExportScope = "selected",
  curveExportMode = "all",
  filteredCanvasKind = "output",
  effectiveActiveFileId,
  isWindowsDesktopShell,
  originChartXRangeRef,
  originChartYRangeRef,
  originExportMode,
  originExportContentKeys = ["iv"],
  originAxisSettings,
  originOpenPlotOptions,
  cleanedData,
  resolveCurveLabelForSeries = (_file, series, index) =>
    resolveSeriesLabel(series, index),
  resolveAxisTitleForFile = () => "",
  resolveYScaleForFile = () => "linear",
  resolveYLogCurrentModeForFile = () => "all",
  resolveYUnitForFile = () => "A",
  showToast,
  visibleOriginCanvasIds = [],
}: UseOriginCanvasExportOptions) => {
  const exportService = new BrowserExportService();
  let originSelectedSeriesIdsByFile: Record<string, string[]> = {};
  const resolvedOriginExportMode: OriginExportMode =
    isOriginExportMode(originExportMode) ? originExportMode : "merged";

  const originCanvasOptions = (Array.isArray(cleanedData) ? cleanedData : [])
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
  const originCanvasOptionIds = originCanvasOptions.map((item: any) => item?.key);
  const canvasSelection = createOriginCanvasSelection({
    availableFileIds: originCanvasOptionIds,
    initialSelectedFileIds: [effectiveActiveFileId],
  });

  const setOriginSelectedSeriesIdsByFile = (
    updater: Record<string, string[]> | ((prev: Record<string, string[]>) => Record<string, string[]>),
  ) => {
    originSelectedSeriesIdsByFile =
      typeof updater === "function" ? updater(originSelectedSeriesIdsByFile) : updater;
  };

  const getAllOriginSeriesKeysForFile = (fileId: any) => {
    const targetKey = String(fileId ?? "").trim();
    if (!targetKey) return [];

    const file = (Array.isArray(cleanedData) ? cleanedData : []).find(
      (item: any) => String(item?.fileId ?? "") === targetKey,
    );
    const allSeries = Array.isArray(file?.series) ? file.series : [];
    return normalizeIds(allSeries.map((series: any) => series?.id));
  };

  const getSelectedOriginSeriesKeySetForFile = (file: any) => {
    const allSeries = Array.isArray(file?.series) ? file.series : [];
    const allKeys = normalizeIds(allSeries.map((series: any) => series?.id));
    if (!allKeys.length) return new Set<string>();
    if (curveExportMode === "all") {
      return new Set(allKeys);
    }
    const defaultToAll =
      curveExportMode === "select" || resolvedOriginExportMode !== "merged";

    const fileKey = String(file?.fileId ?? "");
    if (!fileKey) return defaultToAll ? new Set(allKeys) : new Set<string>();

    const stored = originSelectedSeriesIdsByFile?.[fileKey];
    if (!Array.isArray(stored)) {
      return defaultToAll ? new Set(allKeys) : new Set<string>();
    }

    const live = new Set(allKeys);
    const filtered = stored
      .map((item) => String(item ?? ""))
      .filter((item) => live.has(item));
    if (!filtered.length && stored.length > 0) {
      return defaultToAll ? new Set(allKeys) : new Set<string>();
    }

    return new Set(filtered);
  };

  const activeOriginSeries = (Array.isArray(activeFile?.series) ? activeFile.series : [])
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

  const selectedOriginSeriesKeySet = getSelectedOriginSeriesKeySetForFile(activeFile);

  const selectedOriginSeriesCountByFile: Record<string, number> = {};
  for (const item of originCanvasOptions as Array<any>) {
    const count = getSelectedOriginSeriesKeySetForFile(item.file).size;
    if (count > 0) {
      selectedOriginSeriesCountByFile[String(item.key)] = count;
    }
  }

  const filteredOriginCanvasIds = normalizeIds(visibleOriginCanvasIds);
  const filteredOriginCanvasKindIds = (() => {
    const targetFamily = String(filteredCanvasKind ?? "").trim().toLowerCase();
    if (targetFamily !== "transfer" && targetFamily !== "output") {
      return filteredOriginCanvasIds;
    }

    const visibleIdSet = new Set(filteredOriginCanvasIds);
    return (Array.isArray(cleanedData) ? cleanedData : [])
      .filter((file: any) => {
        const fileId = String(file?.fileId ?? "").trim();
        return visibleIdSet.has(fileId);
      })
      .filter(
        (file: any) => resolveOriginFileCurveFamily(file) === targetFamily,
      )
      .map((file: any) => String(file?.fileId ?? "").trim())
      .filter(Boolean);
  })();

  const scopedOriginCanvasKeySet = (() => {
    if (canvasExportScope === "current") {
      const activeKey = String(effectiveActiveFileId ?? "").trim();
      return activeKey ? new Set([activeKey]) : new Set<string>();
    }

    if (canvasExportScope === "filtered") {
      return new Set(filteredOriginCanvasKindIds);
    }

    if (canvasExportScope === "all") {
      return new Set(normalizeIds(originCanvasOptions.map((item: any) => item?.key)));
    }

    return new Set(normalizeIds(canvasSelection.selectedFileIds));
  })();

  const selectedOriginCanvasKeySet = (() => {
    if (resolvedOriginExportMode !== "merged") {
      return scopedOriginCanvasKeySet;
    }

    const scopedKeys = scopedOriginCanvasKeySet;
    const mergedKeys = Object.keys(selectedOriginSeriesCountByFile).filter((fileId) =>
      scopedKeys.has(fileId),
    );
    return new Set(mergedKeys);
  })();

  const selectedOriginSeriesTotalCount = Array.from(selectedOriginCanvasKeySet).reduce(
    (sum, fileId) => sum + Number(selectedOriginSeriesCountByFile[fileId] ?? 0),
    0,
  );

  const selectedOriginCollectionEntries = (originCanvasOptions as Array<any>)
    .map((item) => {
      const fileId = String(item?.key ?? "");
      const selectedCount = Number(selectedOriginSeriesCountByFile[fileId] ?? 0);
      if (
        !fileId ||
        selectedCount <= 0 ||
        !selectedOriginCanvasKeySet.has(fileId)
      ) {
        return null;
      }
      return {
        fileId,
        fileName: String(item?.label ?? fileId),
        selectedCount,
      };
    })
    .filter(
      (
        item,
      ): item is { fileId: string; fileName: string; selectedCount: number } =>
        Boolean(item),
    );

  const selectedOriginCanvases = originCanvasOptions
    .filter((item: any) => selectedOriginCanvasKeySet.has(item.key))
    .map((item: any) => item.file);

  const selectAllOriginSeriesForFile = (fileId: any) => {
    const fileKey = String(fileId ?? "").trim();
    if (!fileKey) return;

    const allKeys = getAllOriginSeriesKeysForFile(fileKey);
    if (!allKeys.length) return;

    setOriginSelectedSeriesIdsByFile((prev) => {
      const prevList = Array.isArray(prev?.[fileKey]) ? prev[fileKey] : [];
      const unchanged =
        prevList.length === allKeys.length &&
        prevList.every((value, index) => value === allKeys[index]);
      if (unchanged) return prev;
      return {
        ...(prev || {}),
        [fileKey]: allKeys,
      };
    });
  };

  const clearOriginSeriesSelectionForFile = (fileId: any) => {
    const fileKey = String(fileId ?? "").trim();
    if (!fileKey) return;

    setOriginSelectedSeriesIdsByFile((prev) => {
      if (curveExportMode === "select") {
        return {
          ...(prev || {}),
          [fileKey]: [],
        };
      }
      if (!prev || !(fileKey in prev)) return prev;
      if (resolvedOriginExportMode !== "merged") {
        return {
          ...(prev || {}),
          [fileKey]: [],
        };
      }
      const next = { ...(prev || {}) };
      delete next[fileKey];
      return next;
    });
  };

  const clearAllOriginSeriesSelections = () => {
    originSelectedSeriesIdsByFile = {};
  };

  const selectAllOriginSeriesForActiveFile = () => {
    selectAllOriginSeriesForFile(activeFile?.fileId);
  };

  const clearOriginSeriesSelectionForActiveFile = () => {
    clearOriginSeriesSelectionForFile(activeFile?.fileId);
  };

  const collectMatchingOriginSeriesAcrossFiles = ({
    fileIds,
    sourceSeriesId,
  }: {
    fileIds?: unknown[];
    sourceSeriesId?: unknown;
  }) => {
    const activeFileKey = String(activeFile?.fileId ?? "").trim();
    const sourceKey = String(sourceSeriesId ?? "").trim();
    if (!activeFileKey || !sourceKey) {
      return {
        addedFileCount: 0,
        addedSeriesCount: 0,
        matchedFileCount: 0,
        matchedSeriesCount: 0,
      };
    }

    const sourceSeries = (Array.isArray(activeFile?.series) ? activeFile.series : []).find(
      (series: any) => String(series?.id ?? "") === sourceKey,
    );
    const sourceTokens = resolveOriginSeriesMatchTokens(sourceSeries);
    const sourceCurveFamily = resolveOriginFileCurveFamily(activeFile);
    if (!sourceSeries || !sourceTokens.length) {
      return {
        addedFileCount: 0,
        addedSeriesCount: 0,
        matchedFileCount: 0,
        matchedSeriesCount: 0,
      };
    }

    const fallbackFileIds = (Array.isArray(cleanedData) ? cleanedData : []).map((file: any) =>
      String(file?.fileId ?? ""),
    );
    const targetFileIds = normalizeIds((Array.isArray(fileIds) && fileIds.length ? fileIds : fallbackFileIds));
    let matchedFileCount = 0;
    let matchedSeriesCount = 0;
    let addedFileCount = 0;
    let addedSeriesCount = 0;

    setOriginSelectedSeriesIdsByFile((prev) => {
      const next: Record<string, string[]> = { ...(prev || {}) };

      for (const fileKey of targetFileIds) {
        const file = (Array.isArray(cleanedData) ? cleanedData : []).find(
          (item: any) => String(item?.fileId ?? "") === fileKey,
        );
        if (
          sourceCurveFamily &&
          resolveOriginFileCurveFamily(file) !== sourceCurveFamily
        ) {
          continue;
        }
        const allSeries = Array.isArray(file?.series) ? file.series : [];
        const matchingSeriesIds = allSeries
          .filter((series: any) => {
            const candidateTokens = resolveOriginSeriesMatchTokens(series);
            return candidateTokens.some((token) => sourceTokens.includes(token));
          })
          .map((series: any) => String(series?.id ?? "").trim())
          .filter(Boolean);

        if (!matchingSeriesIds.length) continue;
        matchedFileCount += 1;
        matchedSeriesCount += matchingSeriesIds.length;

        const current = Array.isArray(prev?.[fileKey])
          ? prev[fileKey].map((item) => String(item ?? "").trim()).filter(Boolean)
          : resolvedOriginExportMode === "merged"
            ? []
            : getAllOriginSeriesKeysForFile(fileKey);
        const currentSet = new Set(current);
        const nextSelected = [...current];
        let fileAddedCount = 0;

        for (const seriesId of matchingSeriesIds) {
          if (currentSet.has(seriesId)) continue;
          currentSet.add(seriesId);
          nextSelected.push(seriesId);
          fileAddedCount += 1;
        }

        if (fileAddedCount <= 0) continue;
        next[fileKey] = nextSelected;
        addedFileCount += 1;
        addedSeriesCount += fileAddedCount;
      }

      return next;
    });

    return {
      addedFileCount,
      addedSeriesCount,
      matchedFileCount,
      matchedSeriesCount,
    };
  };

  const replaceMatchingOriginSeriesAcrossFiles = ({
    fileIds,
    sourceSeriesRefs,
  }: {
    fileIds?: unknown[];
    sourceSeriesRefs?: Array<{ fileId?: unknown; seriesId?: unknown }>;
  }) => {
    const normalizedRefs = (Array.isArray(sourceSeriesRefs) ? sourceSeriesRefs : [])
      .map((ref) => ({
        fileId: String(ref?.fileId ?? "").trim(),
        seriesId: String(ref?.seriesId ?? "").trim(),
      }))
      .filter((ref, index, arr) =>
        Boolean(ref.fileId) &&
        Boolean(ref.seriesId) &&
        arr.findIndex((item) => item.fileId === ref.fileId && item.seriesId === ref.seriesId) === index,
      );
    const sourceSeriesList = normalizedRefs
      .map((ref) => {
        const file = (Array.isArray(cleanedData) ? cleanedData : []).find(
          (item: any) => String(item?.fileId ?? "").trim() === ref.fileId,
        );
        return (Array.isArray(file?.series) ? file.series : []).find(
          (series: any) => String(series?.id ?? "").trim() === ref.seriesId,
        );
      })
      .filter(Boolean);
    const sourceTokenGroups = sourceSeriesList
      .map((series: any) => resolveOriginSeriesMatchTokens(series))
      .filter((tokens: string[]) => tokens.length > 0);
    const sourceCurveFamily = resolveOriginFileCurveFamily(activeFile);
    const fallbackFileIds = (Array.isArray(cleanedData) ? cleanedData : []).map((file: any) =>
      String(file?.fileId ?? ""),
    );
    const targetFileIds = normalizeIds((Array.isArray(fileIds) && fileIds.length ? fileIds : fallbackFileIds));
    let matchedFileCount = 0;
    let matchedSeriesCount = 0;

    setOriginSelectedSeriesIdsByFile((prev) => {
      const next: Record<string, string[]> = { ...(prev || {}) };
      for (const fileKey of targetFileIds) {
        const file = (Array.isArray(cleanedData) ? cleanedData : []).find(
          (item: any) => String(item?.fileId ?? "") === fileKey,
        );
        if (
          sourceCurveFamily &&
          resolveOriginFileCurveFamily(file) !== sourceCurveFamily
        ) {
          continue;
        }

        const allSeries = Array.isArray(file?.series) ? file.series : [];
        const selectedIds: string[] = [];
        for (const tokenGroup of sourceTokenGroups) {
          const match = allSeries.find((series: any) => {
            const candidateTokens = resolveOriginSeriesMatchTokens(series);
            return candidateTokens.some((token) => tokenGroup.includes(token));
          });
          const matchId = String(match?.id ?? "").trim();
          if (matchId && !selectedIds.includes(matchId)) {
            selectedIds.push(matchId);
          }
        }

        matchedFileCount += selectedIds.length ? 1 : 0;
        matchedSeriesCount += selectedIds.length;
        if (selectedIds.length) {
          next[fileKey] = selectedIds;
        } else {
          delete next[fileKey];
        }
      }
      return next;
    });

    return {
      matchedFileCount,
      matchedSeriesCount,
    };
  };

  const toggleOriginSeriesSelection = (seriesId: any) => {
    const fileKey = String(activeFile?.fileId ?? "");
    const targetKey = String(seriesId ?? "");
    if (!fileKey || !targetKey) return;

    setOriginSelectedSeriesIdsByFile((prev) => {
      const allKeys = activeOriginSeries.map((series: any) => series.key);
      const live = new Set(allKeys);
      const stored = prev?.[fileKey];
      const current = Array.isArray(stored)
        ? stored.map((item) => String(item ?? "")).filter((item) => live.has(item))
        : resolvedOriginExportMode === "merged"
          ? []
          : [...allKeys];
      const hasTarget = current.includes(targetKey);
      const nextSelected = hasTarget
        ? current.filter((item) => item !== targetKey)
        : [...current, targetKey];

      if (!nextSelected.length && resolvedOriginExportMode === "merged") {
        const next = { ...(prev || {}) };
        delete next[fileKey];
        return next;
      }

      return {
        ...(prev || {}),
        [fileKey]: nextSelected,
      };
    });
  };

  const toggleOriginSeriesSelectionForFile = (fileId: any, seriesId: any) => {
    const fileKey = String(fileId ?? "").trim();
    const targetKey = String(seriesId ?? "").trim();
    if (!fileKey || !targetKey) return;

    setOriginSelectedSeriesIdsByFile((prev) => {
      const file = (Array.isArray(cleanedData) ? cleanedData : []).find(
        (item: any) => String(item?.fileId ?? "") === fileKey,
      );
      const allKeys = normalizeIds((Array.isArray(file?.series) ? file.series : [])
        .map((series: any) => series?.id));
      const live = new Set(allKeys);
      if (!live.has(targetKey)) return prev;

      const stored = prev?.[fileKey];
      const current = Array.isArray(stored)
        ? stored.map((item) => String(item ?? "")).filter((item) => live.has(item))
        : [...allKeys];
      const hasTarget = current.includes(targetKey);
      return {
        ...(prev || {}),
        [fileKey]: hasTarget
          ? current.filter((item) => item !== targetKey)
          : [...current, targetKey],
      };
    });
  };

  const buildOriginExportPayloadsForSelectedCanvases = ({
    omitRustEligibleCsvText = false,
  }: { omitRustEligibleCsvText?: boolean } = {}): OriginExportPlan => {
    if (!selectedOriginCanvases.length) {
      throw new Error(localize("origin_select_canvas", "Please select at least one thumbnail first."));
    }
    const exportCanvases = omitRustEligibleCsvText
      ? selectedOriginCanvases.map((canvas: any) => {
          const canUseRustCsv =
            canvas &&
            typeof canvas === "object" &&
            String(canvas?.originExportSourcePath ?? "").trim() &&
            canvas?.originExportConfig &&
            typeof canvas.originExportConfig === "object";
          return canUseRustCsv
            ? { ...canvas, originExportOmitIvCsvText: true }
            : canvas;
        })
      : selectedOriginCanvases;

    const plan = buildOriginExportPlan(
      exportCanvases,
      originSelectedSeriesIdsByFile,
      resolvedOriginExportMode,
      resolveYScaleForFile,
      (file) => getXUnitMeta(file?.xUnit).factor,
      (file) => getYUnitMeta(resolveYUnitForFile(file)).factor,
      (file) => getYUnitMeta(resolveYUnitForFile(file)).label,
      resolveCurveLabelForSeries,
      resolveAxisTitleForFile,
      (file, y) =>
        resolveYScaleForFile(file) === "log" &&
        resolveYLogCurrentModeForFile(file) === "all"
          ? Math.abs(y)
          : y,
      originExportContentKeys,
    );
    if (!plan.payloads.length) {
      throw new Error(localize("origin_select_curve", "Please select a curve first."));
    }
    return plan;
  };

  const buildRustOriginCsvExportRequest = (payload: any) => {
    if (!isRustOriginCsvEligiblePayload(payload)) return null;
    const payloadFileIds = (Array.isArray(payload?.fileIds) ? payload.fileIds : [])
      .map((item: any) => String(item ?? ""))
      .filter(Boolean);
    const fileIdSet = new Set(payloadFileIds);
    const files = (Array.isArray(cleanedData) ? cleanedData : []).filter((file: any) =>
      fileIdSet.has(String(file?.fileId ?? "")),
    );
    if (!files.length || files.length !== fileIdSet.size) return null;
    const derivedContentKey = getRustOriginCsvDerivedContentKey(payload);

    const sources = files.map((file: any) => {
      const sourcePath = String(file?.originExportSourcePath ?? "").trim();
      const config = file?.originExportConfig;
      if (!sourcePath || !config || typeof config !== "object") return null;
      const fallbackYTransform =
        resolveYScaleForFile(file) === "log" &&
        resolveYLogCurrentModeForFile(file) === "all"
          ? "abs"
          : "none";
      return {
        config,
        fileId: String(file?.fileId ?? ""),
        fileName: file?.fileName,
        maxPoints: Number(file?.x?.sampledPoints) || 600,
        path: sourcePath,
        xScaleFactor: getXUnitMeta(file?.xUnit).factor,
        yScaleFactor:
          derivedContentKey === "gm" ||
          derivedContentKey === "gds" ||
          derivedContentKey === "ss" ||
          derivedContentKey === "vth"
            ? 1
            : getYUnitMeta(resolveYUnitForFile(file)).factor,
        yTransform: resolveRustOriginCsvYTransformForPayload(
          payload,
          fallbackYTransform,
        ),
      };
    });
    if (sources.some((source) => source === null)) return null;

    const sourceIndexByFileId = new Map<string, number>();
    files.forEach((file: any, index: number) => {
      sourceIndexByFileId.set(String(file?.fileId ?? ""), index);
    });
    const selectedEntries: Array<{ file: any; series: any; sourceIndex: number }> = [];
    for (const file of files) {
      const selectedKeys = getSelectedOriginSeriesKeySetForFile(file);
      for (const series of Array.isArray(file?.series) ? file.series : []) {
        if (!selectedKeys.has(String(series?.id ?? ""))) continue;
        if (
          !Number.isInteger(Number(series?.groupIndex)) ||
          !Number.isInteger(Number(series?.yCol))
        ) {
          return null;
        }
        selectedEntries.push({
          file,
          series,
          sourceIndex: sourceIndexByFileId.get(String(file?.fileId ?? "")) ?? 0,
        });
      }
    }
    if (!selectedEntries.length) return null;

    if (/__metrics\.csv$/i.test(String(payload?.csvName ?? ""))) {
      if (
        files.length !== 1 ||
        !Array.isArray(payload?.xColumnLongNames) ||
        !(
          (payload.xColumnLongNames.length === 3 &&
            payload.xColumnLongNames[0] === "series" &&
            payload.xColumnLongNames[1] === "gds_max_abs" &&
            payload.xColumnLongNames[2] === "x_at_gds_max_abs") ||
          (payload.xColumnLongNames.length === 14 &&
            payload.xColumnLongNames[0] === "series" &&
            payload.xColumnLongNames[1] === "gm_max_abs" &&
            payload.xColumnLongNames[2] === "x_at_gm_max_abs")
        )
      ) {
        return null;
      }
      const firstSource = sources[0] as any;
      const metricKind = payload.xColumnLongNames.length === 14 ? "transfer" : "output";
      return {
        csvName: payload.csvName,
        config: firstSource.config,
        fileId: firstSource.fileId,
        fileName: firstSource.fileName,
        maxPoints: firstSource.maxPoints,
        metricKind,
        metricSeries: selectedEntries.map((entry, index) => ({
          groupIndex: Number(entry.series?.groupIndex),
          label: String(payload?.curveLabels?.[index] ?? entry.series?.name ?? ""),
          sourceIndex: entry.sourceIndex,
          yCol: Number(entry.series?.yCol),
        })),
        sourceFile: {
          curveType: files[0]?.curveType ?? null,
          supportsSs: files[0]?.supportsSs ?? null,
          xAxisRole: files[0]?.xAxisRole ?? null,
          xLabel: files[0]?.xLabel ?? null,
        },
        path: firstSource.path,
        sources,
      };
    }

    const columns: Array<{
      kind: "x" | "y";
      groupIndex: number;
      sourceIndex: number;
      yCol?: number;
    }> = [];
    const pushX = (entry: { series: any; sourceIndex: number }) => {
      columns.push({
        groupIndex: Number(entry.series?.groupIndex),
        kind: "x",
        sourceIndex: entry.sourceIndex,
      });
    };
    const pushY = (entry: { series: any; sourceIndex: number }) => {
      columns.push({
        groupIndex: Number(entry.series?.groupIndex),
        kind: "y",
        sourceIndex: entry.sourceIndex,
        yCol: Number(entry.series?.yCol),
      });
    };

    if (payload.columnLayout === "shared-x") {
      pushX(selectedEntries[0]);
      selectedEntries.forEach(pushY);
    } else if (payload.columnLayout === "grouped-x") {
      const grouped = new Map<string, Array<{ file: any; series: any; sourceIndex: number }>>();
      for (const entry of selectedEntries) {
        const key = buildOriginXGroupKey(
          entry.file?.xGroups?.[Number(entry.series?.groupIndex)],
        );
        const list = grouped.get(key) ?? [];
        list.push(entry);
        grouped.set(key, list);
      }
      for (const list of grouped.values()) {
        if (!list.length) continue;
        pushX(list[0]);
        list.forEach(pushY);
      }
    } else {
      for (const entry of selectedEntries) {
        pushX(entry);
        pushY(entry);
      }
    }

    if (!columns.length) return null;
    const firstSource = sources[0] as any;
    return {
      columns,
      csvName: payload.csvName,
      config: firstSource.config,
      fileId: firstSource.fileId,
      fileName: firstSource.fileName,
      maxPoints: firstSource.maxPoints,
      path: firstSource.path,
      sources,
      xScaleFactor: firstSource.xScaleFactor,
      yScaleFactor: firstSource.yScaleFactor,
      yTransform: firstSource.yTransform,
    };
  };

  const exportOriginZipFallbackForSelectedCanvases = async () => {
    return exportOriginZip({
      buildCsvExportRequest: buildRustOriginCsvExportRequest,
      buildPayloads: buildOriginExportPayloadsForSelectedCanvases,
    });
  };

  const handleOpenInOrigin = async () => {
    await exportService.openInOrigin({
      buildCsvExportRequest: buildRustOriginCsvExportRequest,
      buildPayloads: buildOriginExportPayloadsForSelectedCanvases,
      exportOriginZipFallback: exportOriginZipFallbackForSelectedCanvases,
      originAxisSettings,
      originChartXRangeRef,
      originChartYRangeRef,
      originOpenPlotOptions,
      showToast,
    });
  };

  const handleExportOriginZip = async () => {
    await exportService.exportOriginZip({
      exportOriginZipFallback: exportOriginZipFallbackForSelectedCanvases,
      showToast,
    });
  };

  if (typeof window !== "undefined" && isWindowsDesktopShell) {
    const state = window as unknown as Record<string, unknown>;
    const key = "__conductorOriginExportZipListener";
    if (!state[key]) {
      state[key] = true;
      window.addEventListener("analysis:export-origin-zip", () => {
        void handleExportOriginZip();
      });
    }
  }

  return {
    activeOriginSeries,
    clearAllOriginSeriesSelections,
    clearOriginCanvasSelection: canvasSelection.clearFileSelection,
    collectMatchingOriginSeriesAcrossFiles,
    clearOriginSeriesSelectionForActiveFile,
    clearOriginSeriesSelectionForFile,
    curveExportMode,
    handleExportOriginZip,
    handleOpenInOrigin,
    originCanvasOptions,
    originCanvasExportScope: canvasExportScope,
    originExportMode: resolvedOriginExportMode,
    replaceOriginCanvasSelection: canvasSelection.replaceFileSelection,
    replaceMatchingOriginSeriesAcrossFiles,
    scopedOriginCanvasKeySet,
    selectAllOriginSeriesForActiveFile,
    selectAllOriginSeriesForFile,
    selectAllOriginCanvases: canvasSelection.selectAllFiles,
    selectedOriginCollectionEntries,
    selectedOriginCanvasKeySet,
    selectedOriginCanvases,
    selectedOriginSeriesCountByFile,
    selectedOriginSeriesKeySet,
    selectedOriginSeriesTotalCount,
    toggleOriginCanvasSelection: canvasSelection.toggleFileSelection,
    toggleOriginSeriesSelection,
    toggleOriginSeriesSelectionForFile,
    getSelectedOriginSeriesKeySetForFile,
  };
};

export const useOriginCanvasExport = createOriginCanvasExport;
