import React, { startTransition, useEffect, useMemo, useRef, useState, type CSSProperties, } from "react";
import { Check } from "lucide-react";
import { computeCentralDerivative, computeSubthresholdSwing, computeSubthresholdSwingFitAuto, computeSubthresholdSwingFitInIdWindow, computeSubthresholdSwingFitInRange, classifySsFit, computeLegendDerivativeSeries, formatNumber, resolveAutoSsSelection, } from "../lib/analysisMath";
import { apiService } from "../services/apiService";
import Select from "../../../../components/ui/Select";
import Button from "../../../../components/ui/Button";
import Card from "../../../../components/ui/Card";
import ScrollArea from "../../../../components/ui/ScrollArea";
import Tabs from "../../../../components/ui/Tabs";
import Toast from "../../../../components/ui/Toast";
import { useLanguage } from "../../../../hooks/useLanguage";
import { COLORS } from "../lib/chartColors";
import { DEFAULT_ORIGIN_PLOT_OPTIONS } from "../lib/originPlotOptions";
import {
  isDeviceAnalysisOriginExportMode,
  type DeviceAnalysisOriginExportMode,
} from "../lib/originSelectionExport";
import type { ToastState, ToastType } from "../../shared/lib/sharedTypes";
import { useAnalysisFileCache } from "../useAnalysisFileCache";
import { useContainerSizeReady } from "../useContainerSizeReady";
import {
  useOriginCanvasExport,
  type DeviceAnalysisOriginFilteredCanvasKind,
  type DeviceAnalysisOriginCanvasExportScope,
  type DeviceAnalysisOriginCurveExportMode,
} from "../useOriginCanvasExport";
import OverviewGrid from "./OverviewGrid";
import CalculatedParametersRow from "./CalculatedParametersRow";
import { buildLogTicks, buildNiceTicks, buildOriginAutoTicks, buildPoints, buildStepTicks, computeLabelInterval, computeMinMax, downsamplePointsForDisplay, inferTickDigitsFromTicks, normalizeFloat, normalizeVarToken, padLinearDomain, padLogDomain, parseOptionalNumber, preserveScrollPosition, varTokenToSymbol, } from "../lib/analysisChartsUtils";
import { computeBaseCurrentMetrics, isOutputLikeDeviceAnalysisFile, isTransferLikeDeviceAnalysisFile, } from "../lib/deviceAnalysisMetrics";
import { getDeviceAnalysisXUnitMeta, getDeviceAnalysisYUnitMeta, normalizeDeviceAnalysisYUnit, } from "../lib/deviceAnalysisUnits";
import MainPlotChart from "./MainPlotChart";
import SsDiagnosticsChart from "./SsDiagnosticsChart";
import SsSummaryStrip from "./SsSummaryStrip";
type SsRange = {
    x1: number;
    x2: number;
};
type CurrentBiasRole = "ion" | "ioff";
type PlotTypeOption = "iv" | "gm" | "ss" | "j";
const MAX_RENDER_SERIES_POINTS = 600;
const MIN_RENDER_SERIES_POINTS = 120;
const DEFAULT_RENDER_POINT_BUDGET = 12000;
const GM_RENDER_POINT_BUDGET = 9000;
const MAIN_PLOT_LEGEND_WIDTH = 220;
const TRANSFER_CALCULATED_PARAMETERS_COLUMN_WIDTHS_PX = [
    92, 128, 88, 128, 88, 120, 168, 88, 104, 88, 120,
];
const DERIVATIVE_ONLY_CALCULATED_PARAMETERS_COLUMN_WIDTHS_PX = [92, 168, 88];
const resolveOriginSeriesExportLabel = (series: any, index: number): string => {
    const legendValue = String(series?.legendValue ?? "").trim();
    if (legendValue)
        return legendValue;
    const name = String(series?.name ?? "").trim();
    if (name)
        return name;
    return `Curve ${index + 1}`;
};
const toConductanceUnitLabel = (currentUnitLabel: string, denominatorUnit: string): string => {
    if (denominatorUnit !== "V")
        return `${currentUnitLabel}/${denominatorUnit}`;
    if (currentUnitLabel === "mA")
        return "mS";
    if (currentUnitLabel === "uA")
        return "uS";
    if (currentUnitLabel === "nA")
        return "nS";
    if (currentUnitLabel === "pA")
        return "pS";
    return "S";
};
const formatCurrentWindowSummary = (window: any, xFactor: number, digits: number): string => {
    if (!window)
        return "not selected";
    const parts = [String(window?.label || "window")];
    if (Number.isFinite(window?.targetX)) {
        parts.push(`@ ${formatNumber(Number(window.targetX) * xFactor, { digits })}`);
    }
    if (Number.isFinite(window?.x1) && Number.isFinite(window?.x2)) {
        parts.push(`[${formatNumber(Number(window.x1) * xFactor, { digits })}, ${formatNumber(Number(window.x2) * xFactor, { digits })}]`);
    }
    if (Number.isFinite(window?.current)) {
        parts.push(`|I|=${formatNumber(window.current)}`);
    }
    return parts.join(" · ");
};
const formatBiasInputValue = (xRaw: number, xFactor: number): string => String(normalizeFloat(xRaw * xFactor));
const toStableNumericToken = (value: unknown): string => {
    const num = Number(value);
    return Number.isFinite(num) ? String(normalizeFloat(num)) : "";
};
const buildSeriesRangeSignature = (ranges: Record<string, {
    x1?: unknown;
    x2?: unknown;
}> | null | undefined): string => {
    if (!ranges)
        return "";
    return Object.keys(ranges)
        .sort()
        .map((seriesId) => {
        const entry = ranges[seriesId] ?? {};
        return `${seriesId}:${toStableNumericToken(entry?.x1)}:${toStableNumericToken(entry?.x2)}`;
    })
        .join("|");
};
const resolveAvailableActiveFileId = (processedData: any[], preferredFileId: any): string | null => {
    if (!processedData?.length)
        return null;
    if (preferredFileId &&
        processedData.some((file: any) => file?.fileId === preferredFileId)) {
        return preferredFileId;
    }
    return processedData[0]?.fileId ?? null;
};
type FormatOriginTranslateFn = (key: string, params?: Record<string, unknown>) => string;
type OriginCsvBridge = {
    runOriginCsv: (payload: {
        csv: {
            name: string;
            text: string;
        };
        importMode?: string;
        workbook?: {
            key?: string;
            longName?: string;
        };
        sheet?: {
            longName?: string;
        };
        plot?: {
            command?: string;
            postCommands?: string[];
            type?: number;
            lineWidth?: number;
            xyPairs?: string;
        };
        capabilities?: {
            import?: {
                longName?: string;
                workbookLongName?: string;
                postCommands?: string[];
            };
            plot?: {
                postCommands?: string[];
            };
            axis?: {
                commands?: string[];
            };
        };
    }) => Promise<unknown>;
};
type ProgressiveAnalysisHandle = {
    type: "idle";
    id: number;
} | {
    type: "timeout";
    id: ReturnType<typeof setTimeout>;
};
type ProgressiveAnalysisState = {
    key: string;
    map: Map<string, any>;
    completedCount: number;
    totalCount: number;
    pending: boolean;
};
const PlotTypeToggle = React.memo(function PlotTypeToggle({ activePlotType, ssApplicable, areaAvailable, onChange, }: {
    activePlotType: PlotTypeOption;
    ssApplicable: boolean;
    areaAvailable: boolean;
    onChange: (nextPlotType: PlotTypeOption) => void;
}) {
    // Keep the button feedback local so the rest of the panel can update in a transition.
    const [displayedPlotType, setDisplayedPlotType] = useState<PlotTypeOption>(activePlotType);
    useEffect(() => {
        setDisplayedPlotType(activePlotType);
    }, [activePlotType]);
    const selectPlotType = React.useCallback((nextPlotType: PlotTypeOption) => {
        setDisplayedPlotType(nextPlotType);
        onChange(nextPlotType);
    }, [onChange]);
    return (<div id="device-analysis-plot-type-toggle" className="tab_menu">
        <button id="device-analysis-plot-iv-btn" type="button" onClick={() => selectPlotType("iv")} className={`tab_btn tab_btn--control ${displayedPlotType === "iv"
            ? "tab_btn--active"
            : "tab_btn--inactive"}`}>
          I-V
        </button>
        <button id="device-analysis-plot-gm-btn" type="button" onClick={() => selectPlotType("gm")} className={`tab_btn tab_btn--control ${displayedPlotType === "gm"
            ? "tab_btn--active"
            : "tab_btn--inactive"}`}>
          g{"\u2098"}
        </button>
        <button id="device-analysis-plot-ss-btn" type="button" onClick={() => ssApplicable && selectPlotType("ss")} disabled={!ssApplicable} className={`tab_btn tab_btn--control ${displayedPlotType === "ss"
            ? "tab_btn--active"
            : "tab_btn--inactive"} ${!ssApplicable ? "opacity-50 cursor-not-allowed" : ""}`} title={!ssApplicable
            ? "SS is defined for transfer (Vg) curves. This file does not look like a Vg sweep."
            : ""}>
          SS
        </button>
        <button id="device-analysis-plot-j-btn" type="button" onClick={() => selectPlotType("j")} disabled={!areaAvailable} className={`tab_btn tab_btn--control ${displayedPlotType === "j"
            ? "tab_btn--active"
            : "tab_btn--inactive"} ${!areaAvailable ? "opacity-50 cursor-not-allowed" : ""}`} title={!areaAvailable ? "Set a positive Area to enable J plot" : ""}>
          J
        </button>
      </div>);
});
const AnalysisCharts = ({ processedData, processingStatus, activeFileId: controlledActiveFileId = undefined, onActiveFileIdChange = undefined, showFileSelect = true, ionIoffMethod = "auto", setIonIoffMethod = () => { }, ionIoffManualTargets = { ionX: "", ioffX: "" }, setIonIoffManualTargets = () => { }, ssMethod = "auto", setSsMethod = () => { }, ssDiagnosticsEnabled = true, setSsDiagnosticsEnabled = () => { }, ssShowFitLine = true, setSsShowFitLine = () => { }, ssIdWindow = { low: "1e-11", high: "1e-9" }, setSsIdWindow = () => { }, ssManualRanges = {}, setSsManualRanges = () => { }, originOpenPlotOptions = DEFAULT_ORIGIN_PLOT_OPTIONS, }: any) => {
    const { t } = useLanguage();
    const tLoose = React.useCallback<FormatOriginTranslateFn>((key, params) => t(key, params as any), [t]);
    const [internalActiveFileId, setInternalActiveFileId] = useState(processedData?.[0]?.fileId ?? null);
    const isActiveFileControlled = controlledActiveFileId !== undefined;
    const activeFileId = isActiveFileControlled ? controlledActiveFileId : internalActiveFileId;
    const setActiveFileId = React.useCallback((nextFileId: any) => {
        if (isActiveFileControlled) {
            if (typeof onActiveFileIdChange === "function") {
                onActiveFileIdChange(nextFileId ?? null);
            }
            return;
        }
        setInternalActiveFileId(nextFileId ?? null);
    }, [isActiveFileControlled, onActiveFileIdChange]);
    const [plotType, setPlotType] = useState<PlotTypeOption>("iv"); // 'iv' | 'gm' | 'ss' | 'j'
    const [focusedSeriesId, setFocusedSeriesId] = useState(null);
    const [yUnit, setYUnit] = useState("A"); // 'A' | 'uA' | 'nA'
    const userChangedYUnitRef = useRef(false);
    const userChangedYScaleRef = useRef(false);
    const [gmMode, setGmMode] = useState("x"); // 'x' | 'legend'
    const [areaInput, setAreaInput] = useState("");
    const [showAxisControls, setShowAxisControls] = useState(false);
    const [originExportMode, setOriginExportMode] = useState<DeviceAnalysisOriginExportMode>("merged");
    const [originCanvasExportScope, setOriginCanvasExportScope] = useState<DeviceAnalysisOriginCanvasExportScope>("filtered");
    const [originCurveExportMode, setOriginCurveExportMode] = useState<DeviceAnalysisOriginCurveExportMode>("all");
    const [originFilteredCanvasKind, setOriginFilteredCanvasKind] = useState<DeviceAnalysisOriginFilteredCanvasKind>("output");
    const [resultsTab, setResultsTab] = useState<"metrics" | "export">("metrics");
    const [overviewVisibleFileIds, setOverviewVisibleFileIds] = useState<string[]>([]);
    const originChartXRangeRef = useRef<{ min: number; max: number; } | null>(null);
    const originChartYRangeRef = useRef<{ mode: "linear" | "log"; min: number; max: number; } | null>(null);
    const [axis, setAxis] = useState({
        xMin: "",
        xMax: "",
        xTicks: "auto", // 'auto' | 'nice' | 'step'
        xTickCount: 6,
        xStep: "",
        xTooltipDigits: "",
        yMin: "",
        yMax: "",
        yScale: "linear", // 'linear' | 'log' | 'logAbs'
        yTicks: "nice", // 'auto' | 'nice' | 'step' | 'decades'
        yTickCount: 6,
        yStep: "",
        yDecadeStep: 1,
    });
    const [toast, setToast] = useState<ToastState>({
        isVisible: false,
        message: "",
        type: "success",
    });
    const toastContainerRef = useRef<HTMLDivElement | null>(null);
    const mainChartContainerRef = useRef<HTMLDivElement | null>(null);
    const diagnosticsChartContainerRef = useRef<HTMLDivElement | null>(null);
    const desktopMeta = typeof window !== "undefined" ? window.desktopMeta ?? null : null;
    const isWindowsDesktopShell = desktopMeta?.isDesktop === true && desktopMeta?.platform === "win32";
    const getDesktopOriginBridge = React.useCallback((): OriginCsvBridge | null => {
        if (typeof window === "undefined")
            return null;
        const bridge = window.desktopOrigin as OriginCsvBridge | undefined;
        if (!bridge || typeof bridge.runOriginCsv !== "function")
            return null;
        return bridge;
    }, []);
    const showToast = React.useCallback((message: string, type: ToastType = "info") => {
        setToast({ isVisible: true, message, type });
    }, []);
    const closeToast = React.useCallback(() => {
        setToast((prev) => ({ ...prev, isVisible: false }));
    }, []);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const settings = await apiService.getDeviceAnalysisSettings();
                const normalizedSettings = settings as {
                    originExportModeDefault?: string;
                    yScale?: string;
                    yUnit?: string;
                } | null | undefined;
                const unit = normalizeDeviceAnalysisYUnit(normalizedSettings?.yUnit, "");
                const yScale = normalizedSettings?.yScale;
                const exportMode = normalizedSettings?.originExportModeDefault;
                if (cancelled)
                    return;
                if (!userChangedYUnitRef.current && unit) {
                    setYUnit(unit);
                }
                if (isDeviceAnalysisOriginExportMode(exportMode)) {
                    setOriginExportMode(exportMode);
                }
                if (!userChangedYScaleRef.current && (yScale === "linear" || yScale === "log")) {
                    setAxis((prev: any) => {
                        const nextTicks = yScale === "linear" ? "nice" : "decades";
                        if (prev?.yScale === yScale && prev?.yTicks === nextTicks)
                            return prev;
                        return {
                            ...prev,
                            yScale,
                            yTicks: nextTicks,
                        };
                    });
                }
            }
            catch {
                // ignore settings load failures
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);
    const effectiveActiveFileId = useMemo(() => resolveAvailableActiveFileId(processedData, activeFileId), [activeFileId, processedData]);
    const { getFileCache, renderSeriesCacheRef } = useAnalysisFileCache({
        effectiveActiveFileId,
        processedData,
    });
    useEffect(() => {
        if (!processedData?.length) {
            if (activeFileId !== null)
                setActiveFileId(null);
            return;
        }
        if (activeFileId && processedData.some((f: any) => f.fileId === activeFileId)) {
            return;
        }
        const next = processedData[0]?.fileId ?? null;
        if (next !== activeFileId)
            setActiveFileId(next);
    }, [activeFileId, processedData, setActiveFileId]);
    const activeFile = useMemo(() => processedData?.find((f: any) => f.fileId === effectiveActiveFileId) ?? null, [effectiveActiveFileId, processedData]);
    const resolvedXUnitMeta = useMemo(() => getDeviceAnalysisXUnitMeta(activeFile?.xUnit), [activeFile?.xUnit]);
    const resolvedYUnitMeta = useMemo(() => getDeviceAnalysisYUnitMeta(yUnit), [yUnit]);
    useEffect(() => {
        if (userChangedYUnitRef.current)
            return;
        const nextUnit = normalizeDeviceAnalysisYUnit(activeFile?.yUnit, "");
        if (!nextUnit)
            return;
        setYUnit((prev: any) => (prev === nextUnit ? prev : nextUnit));
    }, [activeFile?.fileId, activeFile?.yUnit]);
    const {
        activeOriginSeries,
        clearOriginCanvasSelection,
        clearAllOriginSeriesSelections,
        collectMatchingOriginSeriesAcrossFiles,
        clearOriginSeriesSelectionForActiveFile,
        clearOriginSeriesSelectionForFile,
        curveExportMode: resolvedCurveExportMode,
        getSelectedOriginSeriesKeySetForFile,
        handleExportOriginZip,
        handleOpenInOrigin,
        replaceOriginCanvasSelection,
        originExportMode: resolvedOriginExportMode,
        selectAllOriginSeriesForActiveFile,
        selectAllOriginSeriesForFile,
        selectedOriginCollectionEntries,
        selectedOriginCanvasKeySet,
        selectedOriginSeriesCountByFile,
        selectedOriginSeriesKeySet,
        selectedOriginSeriesTotalCount,
        toggleOriginCanvasSelection,
        toggleOriginSeriesSelection,
        toggleOriginSeriesSelectionForFile,
    } = useOriginCanvasExport({
        activeFile,
        axisYScale: axis?.yScale,
        canvasExportScope: originCanvasExportScope,
        curveExportMode: originCurveExportMode,
        filteredCanvasKind: originFilteredCanvasKind,
        effectiveActiveFileId,
        getDesktopOriginBridge,
        isWindowsDesktopShell,
        originChartXRangeRef,
        originChartYRangeRef,
        originExportMode,
        originOpenPlotOptions,
        processedData,
        showToast,
        t,
        tLoose,
        visibleOriginCanvasIds: overviewVisibleFileIds,
    });
    const currentCollectedSeriesCount = useMemo(() => {
        const fileKey = String(activeFile?.fileId ?? "");
        if (!fileKey)
            return 0;
        return Number(selectedOriginSeriesCountByFile?.[fileKey] ?? 0);
    }, [activeFile?.fileId, selectedOriginSeriesCountByFile]);
    const selectedCanvasCount = selectedOriginCanvasKeySet?.size ?? 0;
    const isManualCanvasScope = originCanvasExportScope === "selected";
    const isExportListCanvasSelectionMode = originCanvasExportScope === "selected";
    const showFilteredCanvasKindSelect = originCanvasExportScope === "filtered";
    const separateCanvasScopeSummary = useMemo(() => {
        if (originCanvasExportScope === "current") {
            return t("da_origin_canvas_scope_summary_current");
        }
        if (originCanvasExportScope === "filtered") {
            return t("da_origin_canvas_scope_summary_filtered", {
                count: selectedCanvasCount,
                kind: originFilteredCanvasKind === "transfer"
                    ? t("da_origin_filtered_canvas_kind_transfer")
                    : t("da_origin_filtered_canvas_kind_output"),
            });
        }
        if (originCanvasExportScope === "all") {
            return t("da_origin_canvas_scope_summary_all", {
                count: selectedCanvasCount,
            });
        }
        return t("da_origin_canvas_scope_summary_selected", {
            count: selectedCanvasCount,
        });
    }, [originCanvasExportScope, originFilteredCanvasKind, selectedCanvasCount, t]);
    const originExportModeHint = resolvedOriginExportMode === "workbookSheets"
        ? t("da_origin_export_mode_workbook_sheets_hint")
        : resolvedOriginExportMode === "separate"
            ? t("da_origin_export_mode_separate_hint")
            : t("da_origin_export_mode_merged_hint");
    const exportSelectionSummary = resolvedOriginExportMode === "merged"
        ? t("da_origin_collection_summary", {
            curves: selectedOriginSeriesTotalCount,
            files: selectedCanvasCount,
        })
        : separateCanvasScopeSummary;
    const exportListEntries = useMemo(() => {
        if (resolvedOriginExportMode === "merged" && !isExportListCanvasSelectionMode) {
            return selectedOriginCollectionEntries;
        }
        const selectedFileIds = selectedOriginCanvasKeySet ?? new Set<string>();
        return (Array.isArray(processedData) ? processedData : [])
            .map((file: any) => {
            const fileId = String(file?.fileId ?? "");
            if (!fileId)
                return null;
            if (!isExportListCanvasSelectionMode && !selectedFileIds.has(fileId))
                return null;
            const selectedCount = Number(selectedOriginSeriesCountByFile?.[fileId] ?? 0);
            const selectedSeriesKeySet = getSelectedOriginSeriesKeySetForFile(file);
            const series = (Array.isArray(file?.series) ? file.series : [])
                .map((series: any, index: number) => {
                const key = String(series?.id ?? "");
                if (!key)
                    return null;
                return {
                    key,
                    label: resolveOriginSeriesExportLabel(series, index),
                    selected: resolvedCurveExportMode === "all"
                        ? true
                        : selectedSeriesKeySet.has(key),
                };
            })
                .filter((series: any): series is {
                key: string;
                label: string;
                selected: boolean;
            } => Boolean(series));
            return {
                fileId,
                fileName: String(file?.fileName ?? fileId),
                isCanvasSelected: selectedFileIds.has(fileId),
                selectedCount,
                allSeriesSelected: series.length > 0 && series.every((item: any) => item.selected),
                series,
            };
        })
            .filter((entry): entry is {
            fileId: string;
            fileName: string;
            isCanvasSelected: boolean;
            selectedCount: number;
            allSeriesSelected: boolean;
            series: Array<{
                key: string;
                label: string;
                selected: boolean;
            }>;
        } => Boolean(entry));
    }, [
        getSelectedOriginSeriesKeySetForFile,
        isExportListCanvasSelectionMode,
        processedData,
        resolvedOriginExportMode,
        selectedOriginCanvasKeySet,
        selectedOriginCollectionEntries,
        selectedOriginSeriesCountByFile,
    ]);
    const exportListTitle = resolvedOriginExportMode === "merged"
        ? t("da_origin_export_list_title_merged")
        : t("da_origin_export_list_title_separate");
    const exportListEmptyText = resolvedOriginExportMode === "merged"
        ? t("da_origin_collection_empty")
        : t("da_origin_export_selection_empty");
    const exportModeBadgeLabel = resolvedOriginExportMode === "workbookSheets"
        ? t("da_origin_export_mode_badge_workbook_sheets")
        : resolvedOriginExportMode === "merged"
            ? t("da_origin_export_mode_badge_merged")
            : t("da_origin_export_mode_badge_separate");
    const exportEntryActionLabel = resolvedOriginExportMode === "merged"
        ? t("da_origin_export_list_remove_merged")
        : t("da_origin_export_list_remove_separate");
    const handleOriginExportModeChange = React.useCallback((nextMode: DeviceAnalysisOriginExportMode) => {
        setOriginExportMode(nextMode);
        apiService
            .updateDeviceAnalysisSettings({
            originExportModeDefault: nextMode,
        })
            .catch(() => { });
    }, []);
    const handleUseFilteredCanvasSelection = React.useCallback(() => {
        setOriginCanvasExportScope("selected");
        replaceOriginCanvasSelection(overviewVisibleFileIds);
    }, [overviewVisibleFileIds, replaceOriginCanvasSelection]);
    const focusedOriginSeries = useMemo(() => {
        if (!focusedSeriesId)
            return null;
        const list = Array.isArray(activeFile?.series) ? activeFile.series : [];
        return list.find((series: any) => series?.id === focusedSeriesId) ?? null;
    }, [activeFile?.series, focusedSeriesId]);
    const focusedOriginSeriesDisplayLabel = useMemo(() => {
        const legendValue = focusedOriginSeries?.legendValue;
        if (legendValue !== null &&
            legendValue !== undefined &&
            String(legendValue).trim()) {
            return String(legendValue).trim();
        }
        const name = String(focusedOriginSeries?.name ?? "").trim();
        return name || t("da_auto_template_summary_none");
    }, [focusedOriginSeries?.legendValue, focusedOriginSeries?.name, t]);
    const handleCollectMatchingLegendAcrossFilteredFiles = React.useCallback(() => {
        if (resolvedOriginExportMode !== "merged")
            return;
        if (!focusedSeriesId) {
            showToast(t("da_origin_collection_match_filtered_pick_curve"), "warning");
            return;
        }
        const result = collectMatchingOriginSeriesAcrossFiles({
            fileIds: overviewVisibleFileIds,
            sourceSeriesId: focusedSeriesId,
        });
        if (result.matchedSeriesCount <= 0) {
            showToast(t("da_origin_collection_match_filtered_no_match", {
                label: focusedOriginSeriesDisplayLabel,
            }), "warning");
            return;
        }
        if (result.addedSeriesCount <= 0) {
            showToast(t("da_origin_collection_match_filtered_already_added", {
                label: focusedOriginSeriesDisplayLabel,
                files: result.matchedFileCount,
            }), "info");
            return;
        }
        showToast(t("da_origin_collection_match_filtered_success", {
            curves: result.addedSeriesCount,
            files: result.addedFileCount,
            label: focusedOriginSeriesDisplayLabel,
        }), "success");
    }, [
        collectMatchingOriginSeriesAcrossFiles,
        focusedOriginSeriesDisplayLabel,
        focusedSeriesId,
        overviewVisibleFileIds,
        resolvedOriginExportMode,
        showToast,
        t,
    ]);
    const area = useMemo(() => {
        if (areaInput === null || areaInput === undefined)
            return null;
        const raw = String(areaInput).trim();
        if (!raw)
            return null;
        const num = Number(raw);
        if (!Number.isFinite(num) || num <= 0)
            return null;
        return num;
    }, [areaInput]);
    const transferMetricsApplicable = useMemo(() => isTransferLikeDeviceAnalysisFile(activeFile), [activeFile]);
    const outputMetricsApplicable = useMemo(() => isOutputLikeDeviceAnalysisFile(activeFile), [activeFile]);
    const calculatedParametersMode = useMemo(() => transferMetricsApplicable ? "transfer" : outputMetricsApplicable ? "output" : "generic", [outputMetricsApplicable, transferMetricsApplicable]);
    const ssHeuristicApplicable = transferMetricsApplicable;
    const gmUi = useMemo(() => {
        const xToken = normalizeVarToken(activeFile?.xAxisRole ?? activeFile?.curveType);
        const legendToken = normalizeVarToken(activeFile?.legend?.varToken);
        const xSymbol = varTokenToSymbol(xToken);
        const legendSymbol = varTokenToSymbol(legendToken);
        const xLabelRaw = typeof activeFile?.xLabel === "string" ? activeFile.xLabel.trim() : "";
        const legendLabelRaw = typeof activeFile?.legend?.prefix === "string"
            ? activeFile.legend.prefix.trim()
            : "";
        const xDisplay = xSymbol || xLabelRaw || "X";
        const legendDisplay = legendSymbol || legendLabelRaw || "Legend";
        const derivToken = gmMode === "legend" ? legendToken : xToken;
        const fixedToken = gmMode === "legend" ? xToken : legendToken;
        const kind = derivToken === "vg" ? "gm" : derivToken === "vd" ? "gds" : "derivative";
        const kindTitle = kind === "gm"
            ? "Transconductance"
            : kind === "gds"
                ? "Output Conductance"
                : "Derivative";
        const kindSymbol = kind === "gm" ? "gₘ" : kind === "gds" ? "gds" : null;
        const derivSymbol = varTokenToSymbol(derivToken);
        const fixedSymbol = varTokenToSymbol(fixedToken);
        const derivShortLabel = derivSymbol
            ? `dI/d${derivSymbol}`
            : gmMode === "legend"
                ? `dI/d${legendDisplay}`
                : `dI/d${xDisplay}`;
        const formula = (() => {
            if (derivSymbol && fixedSymbol) {
                const base = `\u2202I/\u2202${derivSymbol} |${fixedSymbol}`;
                return kindSymbol ? `${kindSymbol} = ${base}` : base;
            }
            if (derivSymbol) {
                const fixedFallback = gmMode === "legend" ? xDisplay : legendDisplay;
                const base = `\u2202I/\u2202${derivSymbol} |${fixedFallback}`;
                return kindSymbol ? `${kindSymbol} = ${base}` : base;
            }
            return gmMode === "legend"
                ? `dI/d${legendDisplay} @ fixed ${xDisplay}`
                : `dI/d${xDisplay} (per curve)`;
        })();
        const plotLabel = `${kindTitle} (${formula})`;
        const denomUnit = derivSymbol ? "V" : gmMode === "legend" ? "Legend" : "X";
        const modeOptions = [
            {
                value: "x",
                label: xSymbol
                    ? `dI/d${xSymbol} (per curve)`
                    : `dI/d${xDisplay} (per curve)`,
            },
            {
                value: "legend",
                label: legendSymbol
                    ? `dI/d${legendSymbol} @ fixed ${xSymbol ?? xDisplay}`
                    : `dI/d${legendDisplay} @ fixed ${xDisplay}`,
            },
        ];
        const metricSymbol = kindSymbol ?? derivShortLabel;
        const summaryLabel = kindSymbol
            ? `${kindSymbol} (${derivShortLabel})`
            : `deriv (${derivShortLabel})`;
        return {
            kind,
            kindTitle,
            kindSymbol,
            derivShortLabel,
            plotLabel,
            denomUnit,
            modeOptions,
            metricSymbol,
            summaryLabel,
            metricHeader: `max|${metricSymbol}|`,
        };
    }, [activeFile, gmMode]);
    const pointsBySeriesId = useMemo(() => {
        if (!activeFile?.fileId || !activeFile?.series?.length)
            return new Map();
        const cache = getFileCache(activeFile.fileId, activeFile);
        if (!cache)
            return new Map();
        const map = cache.pointsBySeriesId;
        for (const s of activeFile.series) {
            if (map.has(s.id))
                continue;
            const xArr = activeFile?.xGroups?.[s.groupIndex];
            map.set(s.id, buildPoints(xArr, s.y));
        }
        return map;
    }, [activeFile, getFileCache]);
    const gmBySeriesId = useMemo(() => new Map(), []);
    const gmLegendStatus = useMemo(() => {
        if (gmMode !== "legend")
            return { ok: true, message: "" };
        const legendMode = activeFile?.legend?.mode ?? null;
        if (legendMode !== "yCol" && legendMode !== "group") {
            return {
                ok: false,
                message: "Legend derivative needs numeric legend labels (configure Y Data Start/Count/Step).",
            };
        }
        const counts = new Map();
        for (const series of activeFile?.series ?? []) {
            const param = series?.legendValue;
            if (typeof param !== "number" || !Number.isFinite(param))
                continue;
            const bucketKey = legendMode === "yCol" ? `g:${series.groupIndex}` : `y:${series.yCol}`;
            counts.set(bucketKey, (counts.get(bucketKey) ?? 0) + 1);
        }
        const maxCurves = Math.max(0, ...Array.from(counts.values()));
        if (maxCurves < 2) {
            return {
                ok: false,
                message: "Legend derivative needs at least 2 curves with numeric legend values.",
            };
        }
        return { ok: true, message: "" };
    }, [activeFile, gmMode]);
    const manualBySeriesForActiveFile = useMemo(() => activeFile?.fileId ? ssManualRanges?.[activeFile.fileId] ?? {} : {}, [activeFile?.fileId, ssManualRanges]);
    const manualRangeSignature = useMemo(() => buildSeriesRangeSignature(manualBySeriesForActiveFile), [manualBySeriesForActiveFile]);
    const analysisCacheKey = useMemo(() => {
        const areaToken = area && Number.isFinite(area) && area > 0
            ? String(normalizeFloat(area))
            : "";
        const parts = [
            `gm:${gmMode}`,
            `current:${ionIoffMethod}`,
            `ss:${ssMethod}`,
        ];
        if (ionIoffMethod === "manual") {
            parts.push(`ion:${String(ionIoffManualTargets?.ionX ?? "").trim()}`);
            parts.push(`ioff:${String(ionIoffManualTargets?.ioffX ?? "").trim()}`);
            parts.push(`xFactor:${toStableNumericToken(resolvedXUnitMeta.factor)}`);
        }
        if (ssMethod === "idWindow") {
            parts.push(`idLow:${toStableNumericToken(ssIdWindow?.low)}`);
            parts.push(`idHigh:${toStableNumericToken(ssIdWindow?.high)}`);
        }
        if (ssMethod === "manual") {
            parts.push(`manual:${manualRangeSignature}`);
        }
        parts.push(`area:${areaToken}`);
        return parts.join("::");
    }, [
        area,
        gmMode,
        ionIoffManualTargets?.ioffX,
        ionIoffManualTargets?.ionX,
        ionIoffMethod,
        manualRangeSignature,
        resolvedXUnitMeta.factor,
        ssIdWindow?.high,
        ssIdWindow?.low,
        ssMethod,
    ]);
    const activeFileCache = useMemo(() => activeFile?.fileId ? getFileCache(activeFile.fileId, activeFile) : null, [activeFile, getFileCache]);
    const detailAnalysisKey = useMemo(() => `${effectiveActiveFileId ?? "no-file"}::${analysisCacheKey}`, [analysisCacheKey, effectiveActiveFileId]);
    const gmModeKey = gmMode === "legend" ? "legend" : "x";
    const idLowRaw = Number(ssIdWindow?.low);
    const idHighRaw = Number(ssIdWindow?.high);
    const idWindowOk = Number.isFinite(idLowRaw) &&
        Number.isFinite(idHighRaw) &&
        idLowRaw > 0 &&
        idHighRaw > 0;
    const idLow = idWindowOk ? Math.min(idLowRaw, idHighRaw) : null;
    const idHigh = idWindowOk ? Math.max(idLowRaw, idHighRaw) : null;
    const idWindowRatio = idLow && idHigh && idLow > 0 ? idHigh / idLow : null;
    const idWindowKey = idWindowOk && idLow !== null && idHigh !== null
        ? `${normalizeFloat(idLow)}::${normalizeFloat(idHigh)}`
        : "invalid";
    const areaValue = typeof area === "number" && Number.isFinite(area) && area > 0 ? area : null;
    const areaKey = areaValue !== null ? String(normalizeFloat(areaValue)) : null;
    const cacheAnalysisMap = React.useCallback((map: Map<string, any>) => {
        if (!activeFileCache?.analysisByConfigKey)
            return;
        if (!activeFileCache.analysisByConfigKey.has(analysisCacheKey) &&
            activeFileCache.analysisByConfigKey.size >= 24) {
            const oldestKey = activeFileCache.analysisByConfigKey.keys().next();
            if (!oldestKey.done) {
                activeFileCache.analysisByConfigKey.delete(oldestKey.value);
            }
        }
        activeFileCache.analysisByConfigKey.set(analysisCacheKey, map);
    }, [activeFileCache, analysisCacheKey]);
    const getSeriesGm = React.useCallback((series: any) => {
        if (!series?.id)
            return [];
        const points = pointsBySeriesId.get(series.id) ?? [];
        if (gmMode === "x") {
            const map = activeFileCache?.gmByMode?.x ?? new Map();
            if (!map.has(series.id)) {
                map.set(series.id, computeCentralDerivative(points));
            }
            return map.get(series.id) ?? [];
        }
        const map = activeFileCache?.gmByMode?.legend ?? new Map();
        if (activeFileCache?.gmLegendComputed) {
            return map.get(series.id) ?? [];
        }
        const legendMode = activeFile?.legend?.mode ?? null;
        const derivedMap = new Map();
        if (legendMode === "yCol" || legendMode === "group") {
            const buckets = new Map();
            for (const currentSeries of activeFile?.series ?? []) {
                const param = currentSeries?.legendValue;
                if (typeof param !== "number" || !Number.isFinite(param))
                    continue;
                const xArr = activeFile?.xGroups?.[currentSeries.groupIndex];
                const yArr = currentSeries?.y;
                if (!xArr || !yArr)
                    continue;
                const bucketKey = legendMode === "yCol"
                    ? `g:${currentSeries.groupIndex}`
                    : `y:${currentSeries.yCol}`;
                const list = buckets.get(bucketKey) ?? [];
                list.push({ id: currentSeries.id, x: xArr, y: yArr, param });
                buckets.set(bucketKey, list);
            }
            for (const list of buckets.values()) {
                const derived = computeLegendDerivativeSeries(list);
                for (const [id, data] of derived.entries()) {
                    derivedMap.set(id, data);
                }
            }
        }
        if (activeFileCache) {
            activeFileCache.gmLegendComputed = true;
            for (const [id, data] of derivedMap.entries()) {
                map.set(id, data);
            }
            return map.get(series.id) ?? [];
        }
        return derivedMap.get(series.id) ?? [];
    }, [activeFile, activeFileCache, gmMode, pointsBySeriesId]);
    const getSeriesSsDiagnostics = React.useCallback((series: any) => {
        if (!series?.id)
            return [];
        const cache = activeFileCache?.ssDiagnosticsBySeriesId ?? new Map();
        const cached = cache.get(series.id);
        if (cached)
            return cached;
        const points = pointsBySeriesId.get(series.id) ?? [];
        const computed = computeSubthresholdSwing(points);
        if (activeFileCache) {
            cache.set(series.id, computed);
        }
        return computed;
    }, [activeFileCache, pointsBySeriesId]);
    const getSeriesSsAuto = React.useCallback((series: any) => {
        if (!series?.id)
            return null;
        const cache = activeFileCache?.ssAutoBySeriesId ?? new Map();
        const cached = cache.get(series.id) ?? null;
        if (cached)
            return cached;
        const points = pointsBySeriesId.get(series.id) ?? [];
        const computed = computeSubthresholdSwingFitAuto(points);
        if (activeFileCache) {
            cache.set(series.id, computed);
        }
        return computed;
    }, [activeFileCache, pointsBySeriesId]);
    const getSeriesJ = React.useCallback((series: any) => {
        if (!series?.id || areaValue === null)
            return null;
        const resolvedAreaValue = areaValue;
        const areaCache = activeFileCache?.jByAreaKey;
        let seriesCache = null;
        if (areaCache && areaKey) {
            seriesCache = areaCache.get(areaKey) ?? null;
            if (!seriesCache) {
                seriesCache = new Map();
                areaCache.set(areaKey, seriesCache);
            }
            const cached = seriesCache.get(series.id) ?? null;
            if (cached)
                return cached;
        }
        const points = pointsBySeriesId.get(series.id) ?? [];
        const computed = points.map((point: any) => ({
            x: point?.x ?? null,
            y: typeof point?.y === "number" && Number.isFinite(point.y)
                ? Math.abs(point.y) / resolvedAreaValue
                : null,
            yPositive: typeof point?.y === "number" && Number.isFinite(point.y) && point.y !== 0
                ? Math.abs(point.y) / resolvedAreaValue
                : null,
            yAbsPositive: typeof point?.y === "number" && Number.isFinite(point.y) && point.y !== 0
                ? Math.abs(point.y) / resolvedAreaValue
                : null,
        }));
        if (seriesCache) {
            seriesCache.set(series.id, computed);
        }
        return computed;
    }, [activeFileCache, areaKey, areaValue, pointsBySeriesId]);
    const buildSeriesAnalysisEntry = React.useCallback((series: any) => {
        if (!series?.id)
            return null;
        const points = pointsBySeriesId.get(series.id) ?? [];
        const gm = getSeriesGm(series);
        const ssDiagnostics = getSeriesSsDiagnostics(series);
        const ssAuto = getSeriesSsAuto(series);
        const j = getSeriesJ(series);
        const baseMetricsCache = activeFileCache?.baseMetricsBySeriesId ?? new Map();
        const gmMetricsCache = activeFileCache?.gmMetricsByMode?.[gmModeKey] ?? new Map();
        const manualFitCache = activeFileCache?.ssManualFitBySeriesId ?? new Map();
        let idWindowFitMap = null;
        if (activeFileCache && idWindowOk) {
            idWindowFitMap = activeFileCache.ssIdWindowFitByKey.get(idWindowKey) ?? null;
            if (!idWindowFitMap) {
                idWindowFitMap = new Map();
                activeFileCache.ssIdWindowFitByKey.set(idWindowKey, idWindowFitMap);
            }
        }
        let base = ionIoffMethod === "auto" ? baseMetricsCache.get(series.id) ?? null : null;
        let legacySsMin = Infinity;
        let legacyXAtSsMin = null;
        for (const point of ssDiagnostics ?? []) {
            const x = point?.x;
            const y = point?.y;
            if (!Number.isFinite(x) || !Number.isFinite(y))
                continue;
            if (y > 0 && y < legacySsMin) {
                legacySsMin = y;
                legacyXAtSsMin = x;
            }
        }
        if (!base) {
            base = {
                ...computeBaseCurrentMetrics({
                    manualTargets: ionIoffMethod === "manual"
                        ? {
                            ionX: Number.isFinite(Number(ionIoffManualTargets?.ionX))
                                ? Number(ionIoffManualTargets?.ionX) / resolvedXUnitMeta.factor
                                : null,
                            ioffX: Number.isFinite(Number(ionIoffManualTargets?.ioffX))
                                ? Number(ionIoffManualTargets?.ioffX) / resolvedXUnitMeta.factor
                                : null,
                        }
                        : null,
                    method: ionIoffMethod,
                    points,
                    sourceFile: activeFile,
                }),
                legacySsMin: Number.isFinite(legacySsMin) ? legacySsMin : null,
                legacyXAtSsMin,
            };
            if (activeFileCache && ionIoffMethod === "auto") {
                baseMetricsCache.set(series.id, base);
            }
        }
        let gmMetric = gmMetricsCache.get(series.id) ?? null;
        if (!gmMetric) {
            let gmMaxAbs = -Infinity;
            let xAtGmMaxAbs = null;
            for (const point of gm) {
                const x = point?.x;
                const y = point?.y;
                if (typeof x !== "number" || !Number.isFinite(x))
                    continue;
                if (typeof y !== "number" || !Number.isFinite(y))
                    continue;
                const absGm = Math.abs(y);
                if (absGm > gmMaxAbs) {
                    gmMaxAbs = absGm;
                    xAtGmMaxAbs = x;
                }
            }
            gmMetric = {
                gmMaxAbs: Number.isFinite(gmMaxAbs) ? gmMaxAbs : null,
                xAtGmMaxAbs,
            };
            if (activeFileCache) {
                gmMetricsCache.set(series.id, gmMetric);
            }
        }
        const strictFit = ssAuto?.strict ?? { ok: false, reason: "common.invalid_points" };
        const suggestedFit = ssAuto?.suggested ?? {
            ok: false,
            reason: "common.invalid_points",
        };
        const initRange = strictFit?.ok
            ? { x1: strictFit.x1, x2: strictFit.x2, source: "strict" }
            : suggestedFit?.ok
                ? { x1: suggestedFit.x1, x2: suggestedFit.x2, source: "suggested" }
                : null;
        const storedManual = manualBySeriesForActiveFile?.[series.id] ?? null;
        const resolveSelectedFit = () => {
            if (ssMethod === "legacy") {
                return {
                    method: "legacy",
                    confidence: "low",
                    fit: base.legacySsMin !== null
                        ? {
                            ok: true,
                            ss: base.legacySsMin,
                            x1: null,
                            x2: null,
                            r2: null,
                            decadeSpan: null,
                            n: null,
                            reason: "ok",
                        }
                        : { ok: false, reason: "common.not_enough_points" },
                    xAt: legacyXAtSsMin,
                };
            }
            if (ssMethod === "idWindow") {
                if (idWindowOk && idWindowFitMap) {
                    const cached = idWindowFitMap.get(series.id);
                    if (cached)
                        return cached;
                }
                const fit = idWindowOk
                    ? computeSubthresholdSwingFitInIdWindow(points, idLow, idHigh)
                    : { ok: false, reason: "idw.invalid_input" };
                const classification = classifySsFit("idWindow", fit, { idWindowRatio });
                const result = {
                    method: "idWindow",
                    confidence: classification.ss_confidence,
                    reason: classification.ss_reason,
                    fit,
                    xAt: fit?.x1 != null && fit?.x2 != null ? (fit.x1 + fit.x2) * 0.5 : null,
                };
                if (idWindowOk && idWindowFitMap) {
                    idWindowFitMap.set(series.id, result);
                }
                return result;
            }
            if (ssMethod === "manual") {
                const range = storedManual ?? initRange;
                const lo = range ? Math.min(range.x1, range.x2) : null;
                const hi = range ? Math.max(range.x1, range.x2) : null;
                const rangeKey = range && Number.isFinite(lo) && Number.isFinite(hi)
                    ? `${normalizeFloat(lo)}::${normalizeFloat(hi)}`
                    : "none";
                let cached = manualFitCache.get(series.id) ?? null;
                let fit;
                let classification;
                if (cached && cached.key === rangeKey) {
                    fit = cached.fit;
                    classification = cached.cls;
                }
                else {
                    fit = range
                        ? computeSubthresholdSwingFitInRange(points, lo, hi)
                        : { ok: false, reason: "manual.range_outside_domain" };
                    classification = classifySsFit("manual", fit);
                    if (activeFileCache) {
                        manualFitCache.set(series.id, { key: rangeKey, fit, cls: classification });
                    }
                }
                return {
                    method: "manual",
                    confidence: classification.ss_confidence,
                    reason: classification.ss_reason,
                    fit,
                    rangeSource: storedManual ? "manual" : range?.source ?? null,
                    xAt: fit?.x1 != null && fit?.x2 != null ? (fit.x1 + fit.x2) * 0.5 : null,
                };
            }
            const autoSelection = resolveAutoSsSelection({
                strict: strictFit,
                suggested: suggestedFit,
            });
            const classification = autoSelection.classification;
            const fit = autoSelection.fit;
            return {
                method: "auto",
                confidence: classification.ss_confidence,
                reason: classification.ss_reason,
                fit,
                rangeSource: autoSelection.source,
                xAt: fit?.x1 != null && fit?.x2 != null ? (fit.x1 + fit.x2) * 0.5 : null,
            };
        };
        const selected = resolveSelectedFit();
        const selectedFit = selected.fit;
        const selectedSs = selected?.confidence !== "fail" &&
            selectedFit?.ok &&
            Number.isFinite(selectedFit?.ss)
            ? selectedFit.ss
            : null;
        return {
            gm,
            ssDiagnostics,
            ssAuto,
            ssSelected: selected,
            j,
            metrics: {
                ion: base.ion,
                xAtIon: base.xAtIon ?? null,
                ioff: base.ioff,
                xAtIoff: base.xAtIoff ?? null,
                ionIoff: base.ion !== null && base.ioff !== null && base.ioff !== 0
                    ? base.ion / base.ioff
                    : null,
                gmMaxAbs: gmMetric.gmMaxAbs,
                xAtGmMaxAbs: gmMetric.xAtGmMaxAbs ?? null,
                ss: selectedSs,
                ssMethod: selected.method,
                ssConfidence: selected.confidence,
                ssReason: selected.reason ?? null,
                ssX1: Number.isFinite(selectedFit?.x1) ? selectedFit.x1 : null,
                ssX2: Number.isFinite(selectedFit?.x2) ? selectedFit.x2 : null,
                ssR2: Number.isFinite(selectedFit?.r2) ? selectedFit.r2 : null,
                ssSpanDec: Number.isFinite(selectedFit?.decadeSpan)
                    ? selectedFit.decadeSpan
                    : null,
                ssN: Number.isFinite(selectedFit?.n) ? selectedFit.n : null,
                xAtSs: selectedSs !== null ? selected.xAt : null,
                legacySsMin: base.legacySsMin,
                legacyXAtSsMin: base.legacyXAtSsMin ?? null,
                currentMethod: base.method ?? ionIoffMethod,
                currentCandidateWindows: base.candidateWindows ?? [],
                ionWindow: base.ionWindow ?? null,
                ioffWindow: base.ioffWindow ?? null,
                jon: areaValue !== null && base.ion !== null ? base.ion / areaValue : null,
                joff: areaValue !== null && base.ioff !== null ? base.ioff / areaValue : null,
            },
        };
    }, [activeFile, activeFileCache, areaValue, getSeriesGm, getSeriesJ, getSeriesSsAuto, getSeriesSsDiagnostics, gmModeKey, idHigh, idLow, idWindowKey, idWindowOk, idWindowRatio, ionIoffManualTargets?.ioffX, ionIoffManualTargets?.ionX, ionIoffMethod, manualBySeriesForActiveFile, pointsBySeriesId, resolvedXUnitMeta.factor, ssMethod]);
    const progressiveAnalysisHandleRef = useRef<ProgressiveAnalysisHandle | null>(null);
    const progressiveAnalysisJobIdRef = useRef(0);
    const [detailAnalysisState, setDetailAnalysisState] = useState<ProgressiveAnalysisState>(() => ({
        key: "",
        map: new Map(),
        completedCount: 0,
        totalCount: 0,
        pending: false,
    }));
    useEffect(() => {
        if (typeof window === "undefined")
            return undefined;
        progressiveAnalysisJobIdRef.current += 1;
        const jobId = progressiveAnalysisJobIdRef.current;
        const cancelScheduled = () => {
            const handle = progressiveAnalysisHandleRef.current;
            if (!handle)
                return;
            if (handle.type === "idle" &&
                typeof window.cancelIdleCallback === "function") {
                window.cancelIdleCallback(handle.id);
            }
            else if (handle.type === "timeout") {
                clearTimeout(handle.id);
            }
            progressiveAnalysisHandleRef.current = null;
        };
        cancelScheduled();
        if (!activeFile?.series?.length) {
            setDetailAnalysisState({
                key: detailAnalysisKey,
                map: new Map(),
                completedCount: 0,
                totalCount: 0,
                pending: false,
            });
            return cancelScheduled;
        }
        const totalCount = activeFile.series.length;
        const cached = activeFileCache?.analysisByConfigKey?.get(analysisCacheKey) ?? null;
        if (cached) {
            setDetailAnalysisState({
                key: detailAnalysisKey,
                map: cached,
                completedCount: totalCount,
                totalCount,
                pending: false,
            });
            return cancelScheduled;
        }
        const workingMap = new Map<string, any>();
        const prioritySeries = activeFile.series[0] ?? null;
        if (prioritySeries?.id) {
            const entry = buildSeriesAnalysisEntry(prioritySeries);
            if (entry) {
                workingMap.set(prioritySeries.id, entry);
            }
        }
        setDetailAnalysisState({
            key: detailAnalysisKey,
            map: new Map(workingMap),
            completedCount: workingMap.size,
            totalCount,
            pending: workingMap.size < totalCount,
        });
        const queue = activeFile.series.filter((series: any) => series?.id && !workingMap.has(series.id));
        const run = (_deadline?: IdleDeadline) => {
            if (progressiveAnalysisJobIdRef.current !== jobId)
                return;
            let processed = 0;
            while (queue.length) {
                if (_deadline) {
                    if (processed > 0 && _deadline.timeRemaining() < 5)
                        break;
                }
                else if (processed >= 2) {
                    break;
                }
                const nextSeries = queue.shift();
                if (!nextSeries?.id)
                    continue;
                const entry = buildSeriesAnalysisEntry(nextSeries);
                if (entry) {
                    workingMap.set(nextSeries.id, entry);
                }
                processed += 1;
            }
            const pending = queue.length > 0;
            setDetailAnalysisState({
                key: detailAnalysisKey,
                map: new Map(workingMap),
                completedCount: workingMap.size,
                totalCount,
                pending,
            });
            if (!pending) {
                cacheAnalysisMap(new Map(workingMap));
                progressiveAnalysisHandleRef.current = null;
                return;
            }
            schedule();
        };
        const schedule = () => {
            if (progressiveAnalysisJobIdRef.current !== jobId || !queue.length)
                return;
            if (typeof window.requestIdleCallback === "function") {
                const id = window.requestIdleCallback(run, { timeout: 240 });
                progressiveAnalysisHandleRef.current = { type: "idle", id };
                return;
            }
            const id = setTimeout(() => run(), 16);
            progressiveAnalysisHandleRef.current = { type: "timeout", id };
        };
        if (queue.length) {
            schedule();
        }
        else {
            cacheAnalysisMap(new Map(workingMap));
        }
        return cancelScheduled;
    }, [activeFile, activeFileCache, analysisCacheKey, buildSeriesAnalysisEntry, cacheAnalysisMap, detailAnalysisKey]);
    const detailAnalysisBySeriesId = useMemo(() => {
        if (detailAnalysisState.key === detailAnalysisKey) {
            return detailAnalysisState.map;
        }
        return activeFileCache?.analysisByConfigKey?.get(analysisCacheKey) ?? new Map();
    }, [activeFileCache, analysisCacheKey, detailAnalysisKey, detailAnalysisState.key, detailAnalysisState.map]);
    const analysisBySeriesId = useMemo(() => {
        return detailAnalysisBySeriesId;
        /*
        if (!activeFile?.fileId || !activeFile?.series?.length)
            return new Map();
        const map = new Map();
        const cache = getFileCache(activeFile.fileId, activeFile);
        const cached = cache?.analysisByConfigKey?.get(analysisCacheKey);
        if (cached)
            return cached;
        const ssDiagnosticsCache = cache?.ssDiagnosticsBySeriesId ?? new Map();
        const ssAutoCache = cache?.ssAutoBySeriesId ?? new Map();
        const baseMetricsCache = cache?.baseMetricsBySeriesId ?? new Map();
        const gmModeKey = gmMode === "legend" ? "legend" : "x";
        const gmMetricsCache = cache?.gmMetricsByMode?.[gmModeKey] ?? new Map();
        const manualFitCache = cache?.ssManualFitBySeriesId ?? new Map();
        const manualBySeries = manualBySeriesForActiveFile;
        const idLowRaw = Number(ssIdWindow?.low);
        const idHighRaw = Number(ssIdWindow?.high);
        const idWindowOk = Number.isFinite(idLowRaw) &&
            Number.isFinite(idHighRaw) &&
            idLowRaw > 0 &&
            idHighRaw > 0;
        const idLow = idWindowOk ? Math.min(idLowRaw, idHighRaw) : null;
        const idHigh = idWindowOk ? Math.max(idLowRaw, idHighRaw) : null;
        const idWindowRatio = idLow !== null && idHigh !== null && idLow > 0 ? idHigh / idLow : null;
        const idWindowKey = idWindowOk && idLow !== null && idHigh !== null
            ? `${normalizeFloat(idLow)}::${normalizeFloat(idHigh)}`
            : "invalid";
        const idWindowFitMap = (() => {
            if (!cache)
                return null;
            if (!idWindowOk)
                return null;
            let m = cache.ssIdWindowFitByKey.get(idWindowKey);
            if (!m) {
                m = new Map();
                cache.ssIdWindowFitByKey.set(idWindowKey, m);
            }
            return m;
        })();
        const areaKey = area !== null && Number.isFinite(area) && area > 0
            ? String(normalizeFloat(Number(area)))
            : null;
        const jCacheBySeriesId = (() => {
            if (!cache)
                return null;
            if (!areaKey)
                return null;
            let m = cache.jByAreaKey.get(areaKey);
            if (!m) {
                m = new Map();
                cache.jByAreaKey.set(areaKey, m);
            }
            return m;
        })();
        for (const series of activeFile.series) {
            const points = pointsBySeriesId.get(series.id) ?? [];
            const gm = gmBySeriesId.get(series.id) ?? [];
            let ssDiagnostics = ssDiagnosticsCache.get(series.id) ?? null;
            if (!ssDiagnostics) {
                ssDiagnostics = computeSubthresholdSwing(points);
                if (cache)
                    ssDiagnosticsCache.set(series.id, ssDiagnostics);
            }
            let ssAuto = ssAutoCache.get(series.id) ?? null;
            if (!ssAuto) {
                ssAuto = computeSubthresholdSwingFitAuto(points);
                if (cache)
                    ssAutoCache.set(series.id, ssAuto);
            }
            const j = (() => {
                if (!jCacheBySeriesId)
                    return null;
                const areaValue = area !== null && Number.isFinite(area) && area > 0 ? area : null;
                if (areaValue === null)
                    return null;
                const normalizedAreaValue = areaValue;
                const existing = jCacheBySeriesId.get(series.id) ?? null;
                if (existing)
                    return existing;
                const arr = points.map((p: any) => ({
                    x: p?.x ?? null,
                    y: typeof p?.y === "number" && Number.isFinite(p.y)
                        ? Math.abs(p.y) / Number(normalizedAreaValue)
                        : null,
                    yPositive: typeof p?.y === "number" && Number.isFinite(p.y) && p.y !== 0
                        ? Math.abs(p.y) / Number(normalizedAreaValue)
                        : null,
                    yAbsPositive: typeof p?.y === "number" && Number.isFinite(p.y) && p.y !== 0
                        ? Math.abs(p.y) / Number(normalizedAreaValue)
                        : null,
                }));
                jCacheBySeriesId.set(series.id, arr);
                return arr;
            })();
            let base = ionIoffMethod === "auto" ? baseMetricsCache.get(series.id) ?? null : null;
            let legacySsMin = Infinity;
            let legacyXAtSsMin = null;
            for (const p of ssDiagnostics ?? []) {
                const x = p?.x;
                const y = p?.y;
                if (!Number.isFinite(x) || !Number.isFinite(y))
                    continue;
                if (y > 0 && y < legacySsMin) {
                    legacySsMin = y;
                    legacyXAtSsMin = x;
                }
            }
            if (!base) {
                // Use transfer-curve bias windows instead of single-point extrema.
                base = {
                    ...computeBaseCurrentMetrics({
                        manualTargets: ionIoffMethod === "manual"
                            ? {
                                ionX: Number.isFinite(Number(ionIoffManualTargets?.ionX))
                                    ? Number(ionIoffManualTargets?.ionX) / resolvedXUnitMeta.factor
                                    : null,
                                ioffX: Number.isFinite(Number(ionIoffManualTargets?.ioffX))
                                    ? Number(ionIoffManualTargets?.ioffX) / resolvedXUnitMeta.factor
                                    : null,
                            }
                            : null,
                        method: ionIoffMethod,
                        points,
                        sourceFile: activeFile,
                    }),
                    legacySsMin: Number.isFinite(legacySsMin) ? legacySsMin : null,
                    legacyXAtSsMin,
                };
                if (cache && ionIoffMethod === "auto")
                    baseMetricsCache.set(series.id, base);
            }
            const ionFinite = base.ion;
            const ioffFinite = base.ioff;
            const xAtIon = base.xAtIon ?? null;
            const xAtIoff = base.xAtIoff ?? null;
            const legacySsMinFinite = base.legacySsMin;
            const legacyXAtSsMinResolved = base.legacyXAtSsMin ?? null;
            let gmMetric = gmMetricsCache.get(series.id) ?? null;
            if (!gmMetric) {
                let gmMaxAbs = -Infinity;
                let xAtGmMaxAbs = null;
                for (const p of gm) {
                    const x = p?.x;
                    const y = p?.y;
                    if (typeof x !== "number" || !Number.isFinite(x))
                        continue;
                    if (typeof y !== "number" || !Number.isFinite(y))
                        continue;
                    const absGm = Math.abs(y);
                    if (absGm > gmMaxAbs) {
                        gmMaxAbs = absGm;
                        xAtGmMaxAbs = x;
                    }
                }
                gmMetric = {
                    gmMaxAbs: Number.isFinite(gmMaxAbs) ? gmMaxAbs : null,
                    xAtGmMaxAbs,
                };
                if (cache)
                    gmMetricsCache.set(series.id, gmMetric);
            }
            const gmMaxAbsFinite = gmMetric.gmMaxAbs;
            const xAtGmMaxAbs = gmMetric.xAtGmMaxAbs ?? null;
            const strictFit = ssAuto?.strict ?? { ok: false, reason: "common.invalid_points" };
            const suggestedFit = ssAuto?.suggested ?? {
                ok: false,
                reason: "common.invalid_points",
            };
            const initRange = strictFit?.ok
                ? { x1: strictFit.x1, x2: strictFit.x2, source: "strict" }
                : suggestedFit?.ok
                    ? { x1: suggestedFit.x1, x2: suggestedFit.x2, source: "suggested" }
                    : null;
            const storedManual = manualBySeries?.[series.id] ?? null;
            const resolveSelectedFit = () => {
                if (ssMethod === "legacy") {
                    return {
                        method: "legacy",
                        confidence: "low",
                        fit: legacySsMinFinite !== null
                            ? {
                                ok: true,
                                ss: legacySsMinFinite,
                                x1: null,
                                x2: null,
                                r2: null,
                                decadeSpan: null,
                                n: null,
                                reason: "ok",
                            }
                            : { ok: false, reason: "common.not_enough_points" },
                        xAt: legacyXAtSsMin,
                    };
                }
                if (ssMethod === "idWindow") {
                    if (idWindowOk && idWindowFitMap) {
                        const cached = idWindowFitMap.get(series.id);
                        if (cached)
                            return cached;
                    }
                    const fit = idWindowOk
                        ? computeSubthresholdSwingFitInIdWindow(points, idLow, idHigh)
                        : { ok: false, reason: "idw.invalid_input" };
                    const cls = classifySsFit("idWindow", fit, { idWindowRatio });
                    const result = {
                        method: "idWindow",
                        confidence: cls.ss_confidence,
                        reason: cls.ss_reason,
                        fit,
                        xAt: fit?.x1 != null && fit?.x2 != null ? (fit.x1 + fit.x2) * 0.5 : null,
                    };
                    if (idWindowOk && idWindowFitMap)
                        idWindowFitMap.set(series.id, result);
                    return result;
                }
                if (ssMethod === "manual") {
                    const range = storedManual ?? initRange;
                    const lo = range ? Math.min(range.x1, range.x2) : null;
                    const hi = range ? Math.max(range.x1, range.x2) : null;
                    const rangeKey = range && Number.isFinite(lo) && Number.isFinite(hi)
                        ? `${normalizeFloat(lo)}::${normalizeFloat(hi)}`
                        : "none";
                    let cached = manualFitCache.get(series.id) ?? null;
                    let fit;
                    let cls;
                    if (cached && cached.key === rangeKey) {
                        fit = cached.fit;
                        cls = cached.cls;
                    }
                    else {
                        fit = range
                            ? computeSubthresholdSwingFitInRange(points, lo, hi)
                            : { ok: false, reason: "manual.range_outside_domain" };
                        cls = classifySsFit("manual", fit);
                        if (cache)
                            manualFitCache.set(series.id, { key: rangeKey, fit, cls });
                    }
                    return {
                        method: "manual",
                        confidence: cls.ss_confidence,
                        reason: cls.ss_reason,
                        fit,
                        rangeSource: storedManual ? "manual" : range?.source ?? null,
                        xAt: fit?.x1 != null && fit?.x2 != null ? (fit.x1 + fit.x2) * 0.5 : null,
                    };
                }
                const autoSelection = resolveAutoSsSelection({
                    strict: strictFit,
                    suggested: suggestedFit,
                });
                const cls = autoSelection.classification;
                const fit = autoSelection.fit;
                return {
                    method: "auto",
                    confidence: cls.ss_confidence,
                    reason: cls.ss_reason,
                    fit,
                    rangeSource: autoSelection.source,
                    xAt: fit?.x1 != null && fit?.x2 != null
                        ? (fit.x1 + fit.x2) * 0.5
                        : null,
                };
            };
            const selected = resolveSelectedFit();
            const selectedFit = selected.fit;
            const selectedSs = selected?.confidence !== "fail" &&
                selectedFit?.ok &&
                Number.isFinite(selectedFit?.ss)
                ? selectedFit.ss
                : null;
            map.set(series.id, {
                gm,
                ssDiagnostics,
                ssAuto,
                ssSelected: selected,
                j,
                metrics: {
                    ion: ionFinite,
                    xAtIon,
                    ioff: ioffFinite,
                    xAtIoff,
                    ionIoff: ionFinite !== null && ioffFinite !== null && ioffFinite !== 0
                        ? ionFinite / ioffFinite
                        : null,
                    gmMaxAbs: gmMaxAbsFinite,
                    xAtGmMaxAbs,
                    ss: selectedSs,
                    ssMethod: selected.method,
                    ssConfidence: selected.confidence,
                    ssReason: selected.reason ?? null,
                    ssX1: Number.isFinite(selectedFit?.x1) ? selectedFit.x1 : null,
                    ssX2: Number.isFinite(selectedFit?.x2) ? selectedFit.x2 : null,
                    ssR2: Number.isFinite(selectedFit?.r2) ? selectedFit.r2 : null,
                    ssSpanDec: Number.isFinite(selectedFit?.decadeSpan)
                        ? selectedFit.decadeSpan
                        : null,
                    ssN: Number.isFinite(selectedFit?.n) ? selectedFit.n : null,
                    xAtSs: selectedSs !== null ? selected.xAt : null,
                    legacySsMin: legacySsMinFinite,
                    legacyXAtSsMin: legacyXAtSsMinResolved,
                    currentMethod: base.method ?? ionIoffMethod,
                    currentCandidateWindows: base.candidateWindows ?? [],
                    ionWindow: base.ionWindow ?? null,
                    ioffWindow: base.ioffWindow ?? null,
                    jon: area !== null && ionFinite !== null ? ionFinite / Number(area) : null,
                    joff: area !== null && ioffFinite !== null ? ioffFinite / Number(area) : null,
                },
            });
        }
        if (cache?.analysisByConfigKey) {
            if (!cache.analysisByConfigKey.has(analysisCacheKey) &&
                cache.analysisByConfigKey.size >= 24) {
                const oldestKey = cache.analysisByConfigKey.keys().next();
                if (!oldestKey.done) {
                    cache.analysisByConfigKey.delete(oldestKey.value);
                }
            }
            cache.analysisByConfigKey.set(analysisCacheKey, map);
        }
        return map;
        */
    }, [detailAnalysisBySeriesId]);
    const ssComputedApplicable = useMemo(() => {
        if (!activeFile?.series?.length)
            return false;
        for (const series of activeFile.series) {
            const analysis = analysisBySeriesId.get(series?.id);
            const selectedFit = analysis?.ssSelected?.fit ?? null;
            if (selectedFit?.ok && Number.isFinite(selectedFit?.ss)) {
                return true;
            }
            const strictFit = analysis?.ssAuto?.strict ?? null;
            if (strictFit?.ok && Number.isFinite(strictFit?.ss)) {
                return true;
            }
            const suggestedFit = analysis?.ssAuto?.suggested ?? null;
            if (suggestedFit?.ok && Number.isFinite(suggestedFit?.ss)) {
                return true;
            }
            const diagnostics = analysis?.ssDiagnostics ?? null;
            if (Array.isArray(diagnostics) &&
                diagnostics.some((point: any) => Number.isFinite(point?.y))) {
                return true;
            }
        }
        return false;
    }, [activeFile?.series, analysisBySeriesId]);
    const ssApplicable = transferMetricsApplicable && (ssHeuristicApplicable || ssComputedApplicable);
    const effectivePlotType = useMemo(() => {
        if (plotType === "j" && !area)
            return "iv";
        if (plotType === "ss" && !ssApplicable)
            return "iv";
        return plotType;
    }, [area, plotType, ssApplicable]);
    const plotSeriesCacheKey = useMemo(() => `${analysisCacheKey}::plot:${effectivePlotType}`, [analysisCacheKey, effectivePlotType]);
    const currentManualBiasApplicable = transferMetricsApplicable && effectivePlotType === "iv" && ionIoffMethod === "manual" && Boolean(focusedSeriesId);
    const handlePlotTypeChange = React.useCallback((nextPlotType: PlotTypeOption) => {
        startTransition(() => {
            setPlotType(nextPlotType);
        });
    }, []);
    const plotYFactor = useMemo(() => resolvedYUnitMeta.factor, [resolvedYUnitMeta.factor]);
    const plotXFactor = useMemo(() => resolvedXUnitMeta.factor, [resolvedXUnitMeta.factor]);
    const plotYUnitLabel = useMemo(() => {
        if (effectivePlotType === "gm")
            return toConductanceUnitLabel(resolvedYUnitMeta.label, gmUi.denomUnit);
        if (effectivePlotType === "j")
            return `${resolvedYUnitMeta.label}/Area`;
        // SS tab main plot is I-V in log(|I|), so keep current unit here.
        return resolvedYUnitMeta.label;
    }, [resolvedYUnitMeta.label, effectivePlotType, gmUi.denomUnit]);
    useEffect(() => {
        const seriesList = activeFile?.series ?? [];
        if (!seriesList.length) {
            if (focusedSeriesId !== null) {
                setFocusedSeriesId(null);
            }
            return;
        }
        if (focusedSeriesId &&
            seriesList.some((series: any) => series?.id === focusedSeriesId)) {
            return;
        }
        const nextFocusedSeriesId = seriesList[0]?.id ?? null;
        if (nextFocusedSeriesId !== focusedSeriesId) {
            setFocusedSeriesId(nextFocusedSeriesId);
        }
    }, [activeFile?.fileId, activeFile?.series, effectivePlotType, focusedSeriesId]);
    useEffect(() => {
        if (effectivePlotType !== "ss")
            return;
        if (ssMethod !== "manual")
            return;
        const fileId = activeFile?.fileId ?? null;
        if (!fileId || !focusedSeriesId)
            return;
        const existing = ssManualRanges?.[fileId]?.[focusedSeriesId] ?? null;
        if (existing && Number.isFinite(existing.x1) && Number.isFinite(existing.x2)) {
            return;
        }
        const analysis = detailAnalysisBySeriesId.get(focusedSeriesId) ??
            buildSeriesAnalysisEntry(activeFile?.series?.find((series: any) => series?.id === focusedSeriesId));
        const strict = analysis?.ssAuto?.strict ?? null;
        const suggested = analysis?.ssAuto?.suggested ?? null;
        const init = strict?.ok
            ? { x1: strict.x1, x2: strict.x2 }
            : suggested?.ok
                ? { x1: suggested.x1, x2: suggested.x2 }
                : null;
        if (!init || !Number.isFinite(init.x1) || !Number.isFinite(init.x2))
            return;
        setSsManualRanges((prev: any) => {
            const prevFile = prev?.[fileId] ?? {};
            if (prevFile?.[focusedSeriesId])
                return prev;
            return {
                ...(prev || {}),
                [fileId]: {
                    ...prevFile,
                    [focusedSeriesId]: { x1: init.x1, x2: init.x2 },
                },
            };
        });
    }, [
        activeFile?.fileId,
        activeFile?.series,
        buildSeriesAnalysisEntry,
        detailAnalysisBySeriesId,
        effectivePlotType,
        focusedSeriesId,
        setSsManualRanges,
        ssManualRanges,
        ssMethod,
    ]);
    const plotSeriesByType = useMemo(() => {
        if (!activeFile?.fileId || !activeFile?.series?.length) {
            return { iv: [], gm: [], ss: [], j: [] };
        }
        const cache = getFileCache(activeFile.fileId, activeFile);
        const cached = cache?.plotSeriesByConfigKey?.get(plotSeriesCacheKey);
        if (cached) {
            return cached;
        }
        const base = activeFile.series.map((series: any) => ({
            ...series,
            data: pointsBySeriesId.get(series.id) ?? [],
        }));
        const computed = {
            iv: base,
            ss: base,
            gm: effectivePlotType === "gm"
                ? activeFile.series.map((series: any) => ({
                    ...series,
                    data: getSeriesGm(series),
                }))
                : [],
            j: effectivePlotType === "j"
                ? activeFile.series.map((series: any) => ({
                    ...series,
                    data: getSeriesJ(series) ?? [],
                }))
                : [],
        };
        if (cache?.plotSeriesByConfigKey) {
            cache.plotSeriesByConfigKey.set(plotSeriesCacheKey, computed);
        }
        return computed;
    }, [activeFile, effectivePlotType, getFileCache, getSeriesGm, getSeriesJ, plotSeriesCacheKey, pointsBySeriesId]);
    const focusedAnalysis = useMemo(() => {
        if (!focusedSeriesId)
            return null;
        const cached = detailAnalysisBySeriesId.get(focusedSeriesId) ?? null;
        if (cached)
            return cached;
        const focusedSeries = activeFile?.series?.find((series: any) => series?.id === focusedSeriesId);
        if (!focusedSeries)
            return null;
        return buildSeriesAnalysisEntry(focusedSeries);
    }, [activeFile?.series, buildSeriesAnalysisEntry, detailAnalysisBySeriesId, focusedSeriesId]);
    const focusedSsOverlay = useMemo(() => {
        if (!focusedSeriesId)
            return null;
        const analysis = focusedAnalysis;
        const ssAuto = analysis?.ssAuto ?? null;
        const strict = ssAuto?.strict ?? null;
        const suggested = ssAuto?.suggested ?? null;
        const fileId = activeFile?.fileId ?? null;
        const manualStored = fileId ? ssManualRanges?.[fileId]?.[focusedSeriesId] : null;
        if (ssMethod === "manual") {
            const fit = analysis?.ssSelected?.fit ?? null;
            const storedX1 = Number(manualStored?.x1);
            const storedX2 = Number(manualStored?.x2);
            const x1 = Number.isFinite(storedX1)
                ? storedX1
                : Number.isFinite(fit?.x1)
                    ? fit.x1
                    : null;
            const x2 = Number.isFinite(storedX2)
                ? storedX2
                : Number.isFinite(fit?.x2)
                    ? fit.x2
                    : null;
            if (!Number.isFinite(x1) || !Number.isFinite(x2))
                return null;
            return { x1, x2, kind: "manual" };
        }
        if (ssMethod === "idWindow") {
            const fit = analysis?.ssSelected?.fit ?? null;
            const x1 = Number(fit?.x1);
            const x2 = Number(fit?.x2);
            if (!Number.isFinite(x1) || !Number.isFinite(x2))
                return null;
            return { x1, x2, kind: "idWindow" };
        }
        if (ssMethod === "legacy")
            return null;
        // Auto (strict), show suggested band if strict fails but suggestion exists.
        if (strict?.ok && Number.isFinite(strict?.x1) && Number.isFinite(strict?.x2)) {
            return { x1: strict.x1, x2: strict.x2, kind: "autoStrict" };
        }
        if (suggested?.ok && Number.isFinite(suggested?.x1) && Number.isFinite(suggested?.x2)) {
            return { x1: suggested.x1, x2: suggested.x2, kind: "autoSuggested" };
        }
        return null;
    }, [
        activeFile?.fileId,
        focusedAnalysis,
        focusedSeriesId,
        ssManualRanges,
        ssMethod,
    ]);
    const focusedFitLine = useMemo(() => {
        if (!ssShowFitLine)
            return null;
        if (!focusedSeriesId)
            return null;
        const selected = focusedAnalysis?.ssSelected ?? null;
        if (selected?.confidence === "fail")
            return null;
        const fit = selected?.fit ?? null;
        if (!fit?.ok)
            return null;
        if (!Number.isFinite(fit?.a) || !Number.isFinite(fit?.b))
            return null;
        if (!Number.isFinite(fit?.x1) || !Number.isFinite(fit?.x2))
            return null;
        const x1 = fit.x1;
        const x2 = fit.x2;
        const y1 = Math.pow(10, fit.a * x1 + fit.b);
        const y2 = Math.pow(10, fit.a * x2 + fit.b);
        if (!Number.isFinite(y1) || !Number.isFinite(y2) || y1 <= 0 || y2 <= 0)
            return null;
        return [
            { x: x1, y: y1 },
            { x: x2, y: y2 },
        ];
    }, [
        focusedAnalysis?.ssSelected,
        focusedSeriesId,
        ssShowFitLine,
    ]);
    const focusedFitLineForRender = useMemo(() => {
        if (!Array.isArray(focusedFitLine))
            return null;
        return downsamplePointsForDisplay(focusedFitLine, MAX_RENDER_SERIES_POINTS);
    }, [focusedFitLine]);
    const ssOverlayStyle = useMemo(() => {
        const kind = focusedSsOverlay?.kind ?? "";
        if (kind === "autoStrict") {
            return { fill: "#22c55e", fillOpacity: 0.08, stroke: "#22c55e", strokeOpacity: 0.45 };
        }
        if (kind === "autoSuggested") {
            return { fill: "#f59e0b", fillOpacity: 0.08, stroke: "#f59e0b", strokeOpacity: 0.45 };
        }
        if (kind === "idWindow") {
            return { fill: "#a855f7", fillOpacity: 0.08, stroke: "#a855f7", strokeOpacity: 0.45 };
        }
        if (kind === "manual") {
            return { fill: "#60a5fa", fillOpacity: 0.08, stroke: "#60a5fa", strokeOpacity: 0.45 };
        }
        return { fill: "#60a5fa", fillOpacity: 0.08, stroke: "#60a5fa", strokeOpacity: 0.45 };
    }, [focusedSsOverlay?.kind]);
    const focusedCurrentOverlays = useMemo(() => {
        if (!transferMetricsApplicable)
            return [];
        const metrics = focusedAnalysis?.metrics ?? null;
        const candidateWindows = Array.isArray(metrics?.currentCandidateWindows)
            ? metrics.currentCandidateWindows
            : [];
        const overlays = [];
        for (const window of candidateWindows) {
            const x1 = Number(window?.x1);
            const x2 = Number(window?.x2);
            if (!Number.isFinite(x1) || !Number.isFinite(x2))
                continue;
            overlays.push({
                key: `candidate-${window.key}`,
                x1,
                x2,
                fill: "#94a3b8",
                fillOpacity: 0.05,
                stroke: "#94a3b8",
                strokeOpacity: 0.28,
                strokeDasharray: "4 4",
                strokeWidth: 1.2,
            });
        }
        const pushSelected = (window: any, role: "ion" | "ioff") => {
            const x1 = Number(window?.x1);
            const x2 = Number(window?.x2);
            if (!Number.isFinite(x1) || !Number.isFinite(x2))
                return;
            const color = role === "ion" ? "#22c55e" : "#ef4444";
            const targetX = Number(window?.targetX);
            const lower = Math.min(x1, x2);
            const upper = Math.max(x1, x2);
            const targetMatchesLower = Number.isFinite(targetX) && Math.abs(targetX - lower) <= 1e-12;
            const targetMatchesUpper = Number.isFinite(targetX) && Math.abs(targetX - upper) <= 1e-12;
            overlays.push({
                key: `selected-${role}`,
                x1,
                x2,
                fill: color,
                fillOpacity: 0.1,
                hideEndLine: targetMatchesUpper,
                hideStartLine: targetMatchesLower,
                stroke: color,
                strokeOpacity: 0.52,
                strokeWidth: 2,
            });
        };
        pushSelected(metrics?.ionWindow, "ion");
        pushSelected(metrics?.ioffWindow, "ioff");
        return overlays;
    }, [focusedAnalysis?.metrics, transferMetricsApplicable]);
    const focusedCurrentSummary = useMemo(() => {
        if (!transferMetricsApplicable)
            return null;
        const metrics = focusedAnalysis?.metrics ?? null;
        if (!metrics)
            return "Ion/Ioff is available only on transfer curves.";
        if (ionIoffMethod === "manual" &&
            (!String(ionIoffManualTargets?.ionX ?? "").trim() ||
                !String(ionIoffManualTargets?.ioffX ?? "").trim())) {
            return "Manual Ion/Ioff needs both Ion x and Ioff x inputs.";
        }
        const ionSummary = formatCurrentWindowSummary(metrics?.ionWindow, plotXFactor, 4);
        const ioffSummary = formatCurrentWindowSummary(metrics?.ioffWindow, plotXFactor, 4);
        const modeLabel = metrics?.currentMethod === "manual" ? "Manual bias" : "Auto";
        return `Ion/Ioff (${modeLabel}): Ion ${ionSummary} | Ioff ${ioffSummary}`;
    }, [
        focusedAnalysis?.metrics,
        ionIoffManualTargets?.ioffX,
        ionIoffManualTargets?.ionX,
        ionIoffMethod,
        plotXFactor,
        transferMetricsApplicable,
    ]);
    const focusedCurrentLegend = useMemo(() => {
        if (!transferMetricsApplicable)
            return null;
        return ionIoffMethod === "manual"
            ? "Gray bands show auto candidates; drag the green/red bias markers or edit Ion x / Ioff x. The colored tint shows the averaging window used around each manual bias."
            : "Gray bands show auto candidates; green and red bands mark the selected Ion and Ioff windows.";
    }, [ionIoffMethod, transferMetricsApplicable]);
    const currentOverlaysForPlot = useMemo(() => effectivePlotType === "ss" ? [] : focusedCurrentOverlays, [effectivePlotType, focusedCurrentOverlays]);
    const showCurrentContext = transferMetricsApplicable && effectivePlotType !== "ss";
    const currentBiasMarkers = useMemo(() => {
        if (!currentManualBiasApplicable)
            return [];
        const markers: Array<{
            key: string;
            label: string;
            role: CurrentBiasRole;
            x: number;
            stroke: string;
            strokeOpacity: number;
            strokeWidth: number;
            strokeDasharray: string;
        }> = [];
        const ionRaw = Number(ionIoffManualTargets?.ionX);
        if (Number.isFinite(ionRaw)) {
            markers.push({
                key: "ion-bias",
                label: "Ion",
                role: "ion",
                x: ionRaw / plotXFactor,
                stroke: "#22c55e",
                strokeOpacity: 0.88,
                strokeWidth: 2.5,
                strokeDasharray: "6 4",
            });
        }
        const ioffRaw = Number(ionIoffManualTargets?.ioffX);
        if (Number.isFinite(ioffRaw)) {
            markers.push({
                key: "ioff-bias",
                label: "Ioff",
                role: "ioff",
                x: ioffRaw / plotXFactor,
                stroke: "#ef4444",
                strokeOpacity: 0.88,
                strokeWidth: 2.5,
                strokeDasharray: "6 4",
            });
        }
        return markers;
    }, [currentManualBiasApplicable, ionIoffManualTargets?.ioffX, ionIoffManualTargets?.ionX, plotXFactor]);
    const focusedSeriesXs = useMemo(() => {
        if (!focusedSeriesId)
            return [];
        const points = pointsBySeriesId.get(focusedSeriesId) ?? [];
        return points
            .map((point: any) => Number(point?.x))
            .filter((value: number) => Number.isFinite(value));
    }, [focusedSeriesId, pointsBySeriesId]);
    const focusedSeriesColor = useMemo(() => {
        const idx = (plotSeriesByType?.iv ?? []).findIndex((s: any) => s?.id === focusedSeriesId);
        if (idx < 0)
            return COLORS[0];
        return COLORS[idx % COLORS.length];
    }, [focusedSeriesId, plotSeriesByType?.iv]);
    const ssSummary = useMemo(() => {
        if (effectivePlotType !== "ss")
            return null;
        if (!focusedSeriesId || !focusedAnalysis)
            return null;
        const selected = focusedAnalysis?.ssSelected ?? null;
        const fit = selected?.fit ?? null;
        const conf = String(selected?.confidence || "fail");
        const method = String(selected?.method || ssMethod || "auto");
        const strict = focusedAnalysis?.ssAuto?.strict ?? null;
        const suggested = focusedAnalysis?.ssAuto?.suggested ?? null;
        const ss = conf !== "fail" && fit?.ok && Number.isFinite(fit?.ss) ? fit.ss : null;
        const r2 = Number.isFinite(fit?.r2) ? fit.r2 : null;
        const span = Number.isFinite(fit?.decadeSpan) ? fit.decadeSpan : null;
        const n = Number.isFinite(fit?.n) ? fit.n : null;
        const x1 = Number.isFinite(fit?.x1) ? fit.x1 : null;
        const x2 = Number.isFinite(fit?.x2) ? fit.x2 : null;
        const suggestedRange = !strict?.ok && suggested?.ok && Number.isFinite(suggested?.x1) && Number.isFinite(suggested?.x2)
            ? { x1: suggested.x1, x2: suggested.x2 }
            : null;
        const reason = conf === "fail"
            ? String(selected?.reason || strict?.reason || fit?.reason || "common.invalid_points")
            : String(selected?.reason || fit?.reason || "ok");
        return {
            ss,
            r2,
            span,
            n,
            x1,
            x2,
            confidence: conf,
            method,
            reason,
            suggestedRange,
        };
    }, [effectivePlotType, focusedAnalysis, focusedSeriesId, ssMethod]);
    const yScaleMode = useMemo(() => {
        const mode = String(axis?.yScale ?? "linear");
        if (mode === "logAbs")
            return "logAbs";
        if (mode === "log")
            return "log";
        return "linear";
    }, [axis?.yScale]);
    const overviewYScaleType = useMemo(() => (yScaleMode === "linear" ? "linear" : "log"), [yScaleMode]);
    const plotYKey = useMemo(() => {
        if (yScaleMode === "logAbs")
            return "yAbsPositive";
        if (yScaleMode === "log")
            return "yPositive";
        return "y";
    }, [yScaleMode]);
    const displayPlotSeries = useMemo(() => {
        const byType = plotSeriesByType ?? { iv: [], gm: [], ss: [], j: [] };
        if (effectivePlotType === "gm")
            return byType.gm ?? [];
        if (effectivePlotType === "j")
            return byType.j ?? [];
        if (effectivePlotType === "ss")
            return byType.ss ?? byType.iv ?? [];
        return byType.iv ?? [];
    }, [effectivePlotType, plotSeriesByType]);
    const renderPointBudget = useMemo(() => effectivePlotType === "gm" ? GM_RENDER_POINT_BUDGET : DEFAULT_RENDER_POINT_BUDGET, [effectivePlotType]);
    const renderMaxPointsPerSeries = useMemo(() => {
        const seriesCount = Math.max(1, displayPlotSeries.length);
        const adaptive = Math.floor(renderPointBudget / seriesCount);
        return Math.max(MIN_RENDER_SERIES_POINTS, Math.min(MAX_RENDER_SERIES_POINTS, adaptive));
    }, [displayPlotSeries.length, renderPointBudget]);
    const renderPlotSeries = useMemo(() => {
        if (!displayPlotSeries.length)
            return displayPlotSeries;
        const cacheKey = displayPlotSeries as unknown as object;
        let cacheBucket = renderSeriesCacheRef.current.get(cacheKey);
        if (!cacheBucket) {
            cacheBucket = new Map<number, any[]>();
            renderSeriesCacheRef.current.set(cacheKey, cacheBucket);
        }
        const cachedSeries = cacheBucket.get(renderMaxPointsPerSeries);
        if (cachedSeries)
            return cachedSeries;
        const computedSeries = displayPlotSeries.map((series: any) => {
            const fullData = Array.isArray(series?.data) ? series.data : [];
            const nextData = downsamplePointsForDisplay(fullData, renderMaxPointsPerSeries);
            if (nextData === fullData)
                return series;
            return {
                ...series,
                data: nextData,
            };
        });
        cacheBucket.set(renderMaxPointsPerSeries, computedSeries);
        return computedSeries;
    }, [displayPlotSeries, renderMaxPointsPerSeries]);
    const renderOriginSelectionLegend = React.useCallback((legendProps: any) => {
        const payload = Array.isArray(legendProps?.payload) ? legendProps.payload : [];
        if (!payload.length)
            return null;
        return (<ul className="m-0 p-0 list-none">
        {payload.map((entry: any, idx: number) => {
                const fallbackSeries = renderPlotSeries?.[idx];
                const seriesId = String(fallbackSeries?.id ?? "");
                const checked = seriesId ? selectedOriginSeriesKeySet.has(seriesId) : false;
                const label = String(entry?.value ?? fallbackSeries?.name ?? "");
                const color = String(entry?.color || fallbackSeries?.color || "#8884d8");
                const disabled = !seriesId;
                return (<li key={seriesId || `${label}-${idx}`} className="mb-1 last:mb-0">
              <div className={`group flex items-center gap-2 text-[11px] leading-4 ${disabled ? "opacity-60 cursor-default" : "cursor-pointer"}`}>
                <span className="inline-block h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }}/>
                <button type="button" aria-pressed={checked} aria-label={label} disabled={disabled} onClick={() => {
                        if (!disabled)
                            toggleOriginSeriesSelection(seriesId);
                    }} className={`shrink-0 ${disabled ? "cursor-default" : "cursor-pointer"}`}>
                  <span className="clickable-ckb" data-state={checked ? "checked" : "unchecked"}>
                    {checked ? <Check size={10} className="text-white" strokeWidth={4}/> : null}
                  </span>
                </button>
                <span className="truncate max-w-[130px] text-text-secondary" title={label}>
                  {label}
                </span>
              </div>
            </li>);
            })}
      </ul>);
    }, [renderPlotSeries, selectedOriginSeriesKeySet, toggleOriginSeriesSelection]);
    const autoMinMax = useMemo(() => {
        const fileId = activeFile?.fileId ?? null;
        const cache = fileId ? getFileCache(fileId, activeFile) : null;
        const areaKeyForMinMax = area && Number.isFinite(area) && area > 0 ? String(normalizeFloat(area)) : "";
        const minMaxKey = `${effectivePlotType}::${gmMode}::${plotYKey}::${areaKeyForMinMax}`;
        if (cache?.minMaxByKey?.has(minMaxKey)) {
            return cache.minMaxByKey.get(minMaxKey);
        }
        const computed = computeMinMax(displayPlotSeries, { yKey: plotYKey });
        if (cache?.minMaxByKey)
            cache.minMaxByKey.set(minMaxKey, computed);
        return computed;
    }, [
        activeFile?.fileId,
        area,
        displayPlotSeries,
        effectivePlotType,
        getFileCache,
        gmMode,
        plotYKey,
    ]);
    const autoMinY = autoMinMax?.minY ?? null;
    const autoMaxY = autoMinMax?.maxY ?? null;
    const effectiveYScale = useMemo(() => {
        if (yScaleMode === "linear")
            return "linear";
        if (autoMinY === null || autoMaxY === null)
            return "linear";
        if (autoMaxY <= 0)
            return "linear";
        return yScaleMode; // 'log' | 'logAbs'
    }, [autoMaxY, autoMinY, yScaleMode]);
    const yScaleWarning = useMemo(() => {
        if (yScaleMode === "linear")
            return "";
        if (effectiveYScale !== yScaleMode) {
            return "Log scale requires positive values (use Log(|y|) if your data crosses 0).";
        }
        return "";
    }, [effectiveYScale, yScaleMode]);
    const xDomain = useMemo(() => {
        const auto = autoMinMax.minX === null || autoMinMax.maxX === null
            ? [0, 1]
            : padLinearDomain(autoMinMax.minX, autoMinMax.maxX);
        const minUser = parseOptionalNumber(axis?.xMin);
        const maxUser = parseOptionalNumber(axis?.xMax);
        const min = minUser !== null ? minUser / plotXFactor : auto[0];
        const max = maxUser !== null ? maxUser / plotXFactor : auto[1];
        return padLinearDomain(min, max);
    }, [autoMinMax.maxX, autoMinMax.minX, axis?.xMax, axis?.xMin, plotXFactor]);
    const yDomain = useMemo<[number, number]>(() => {
        const auto: [number, number] = autoMinMax.minY === null || autoMinMax.maxY === null
            ? effectiveYScale === "linear"
                ? [0, 1]
                : [1e-3, 1]
            : effectiveYScale === "linear"
                ? padLinearDomain(autoMinMax.minY, autoMinMax.maxY)
                : padLogDomain(autoMinMax.minY, autoMinMax.maxY);
        const minUserRaw = parseOptionalNumber(axis?.yMin);
        const maxUserRaw = parseOptionalNumber(axis?.yMax);
        const minUser = minUserRaw !== null ? minUserRaw / plotYFactor : null;
        const maxUser = maxUserRaw !== null ? maxUserRaw / plotYFactor : null;
        let min = minUser ?? auto[0];
        let max = maxUser ?? auto[1];
        if (effectiveYScale !== "linear") {
            if (min <= 0)
                min = auto[0];
            if (max <= 0)
                max = auto[1];
            if (min <= 0 || max <= 0)
                return auto;
            return padLogDomain(min, max);
        }
        return padLinearDomain(min, max);
    }, [
        autoMinMax.maxY,
        autoMinMax.minY,
        axis?.yMax,
        axis?.yMin,
        effectiveYScale,
        plotYFactor,
    ]);
    const focusedSsDiagnostics = useMemo(() => {
        if (effectivePlotType !== "ss")
            return null;
        if (!ssDiagnosticsEnabled)
            return null;
        const data = focusedAnalysis?.ssDiagnostics ?? null;
        return Array.isArray(data) ? data : null;
    }, [effectivePlotType, focusedAnalysis?.ssDiagnostics, ssDiagnosticsEnabled]);
    const focusedSsDiagnosticsForRender = useMemo(() => {
        if (!Array.isArray(focusedSsDiagnostics))
            return null;
        return downsamplePointsForDisplay(focusedSsDiagnostics, MAX_RENDER_SERIES_POINTS);
    }, [focusedSsDiagnostics]);
    const diagnosticsChartVisible = effectivePlotType === "ss" && Boolean(focusedSsDiagnostics);
    const isMainChartSizeReady = useContainerSizeReady(mainChartContainerRef, Boolean(activeFile?.series?.length));
    const isDiagnosticsChartSizeReady = useContainerSizeReady(diagnosticsChartContainerRef, diagnosticsChartVisible);
    const ssDiagnosticsMinMax = useMemo(() => {
        if (!focusedSsDiagnostics)
            return { minX: null, maxX: null, minY: null, maxY: null };
        return computeMinMax([{ data: focusedSsDiagnostics }]);
    }, [focusedSsDiagnostics]);
    const ssDiagnosticsBaseYDomain = useMemo(() => {
        const minY = ssDiagnosticsMinMax?.minY ?? null;
        const maxY = ssDiagnosticsMinMax?.maxY ?? null;
        if (minY === null || maxY === null)
            return [0, 1];
        return padLinearDomain(minY, maxY);
    }, [ssDiagnosticsMinMax?.maxY, ssDiagnosticsMinMax?.minY]);
    const ssDiagnosticsYTicks = useMemo(() => {
        return (buildOriginAutoTicks(ssDiagnosticsBaseYDomain[0], ssDiagnosticsBaseYDomain[1], 6) ??
            buildNiceTicks(ssDiagnosticsBaseYDomain[0], ssDiagnosticsBaseYDomain[1], 6, {
                preferTightRange: false,
            }));
    }, [ssDiagnosticsBaseYDomain]);
    const ssDiagnosticsYDomain = useMemo(() => {
        if (Array.isArray(ssDiagnosticsYTicks) && ssDiagnosticsYTicks.length >= 2) {
            return [
                Number(ssDiagnosticsYTicks[0]),
                Number(ssDiagnosticsYTicks[ssDiagnosticsYTicks.length - 1]),
            ];
        }
        return ssDiagnosticsBaseYDomain;
    }, [ssDiagnosticsBaseYDomain, ssDiagnosticsYTicks]);
    const xTicks = useMemo(() => {
        const mode = String(axis?.xTicks ?? "auto");
        if (mode === "auto") {
            const tightTicks = buildNiceTicks(xDomain[0], xDomain[1], 6, {
                preferTightRange: true,
            });
            return tightTicks ?? buildOriginAutoTicks(xDomain[0], xDomain[1], 6);
        }
        if (mode === "step") {
            const stepRaw = parseOptionalNumber(axis?.xStep);
            const step = stepRaw !== null ? stepRaw / plotXFactor : null;
            return step ? buildStepTicks(xDomain[0], xDomain[1], step) : null;
        }
        const count = Math.max(2, Math.floor(Number(axis?.xTickCount) || 6));
        return buildNiceTicks(xDomain[0], xDomain[1], count, {
            preferTightRange: false,
        });
    }, [axis?.xStep, axis?.xTickCount, axis?.xTicks, plotXFactor, xDomain]);
    const originChartXRange = useMemo(() => {
        const ticks = Array.isArray(xTicks) && xTicks.length >= 2 ? xTicks : null;
        const minCandidate = ticks ? Number(ticks[0]) : Number(xDomain?.[0]);
        const maxCandidate = ticks ? Number(ticks[ticks.length - 1]) : Number(xDomain?.[1]);
        if (!Number.isFinite(minCandidate) || !Number.isFinite(maxCandidate))
            return null;
        const min = Math.min(minCandidate, maxCandidate);
        const max = Math.max(minCandidate, maxCandidate);
        if (!(max > min))
            return null;
        return { min, max };
    }, [xDomain, xTicks]);
    useEffect(() => {
        originChartXRangeRef.current = originChartXRange;
    }, [originChartXRange]);
    const yTicks = useMemo(() => {
        const mode = String(axis?.yTicks ?? "nice");
        if (mode === "auto") {
            if (effectiveYScale !== "linear") {
                const min = Number(yDomain?.[0]);
                const max = Number(yDomain?.[1]);
                if (!Number.isFinite(min) || !Number.isFinite(max))
                    return null;
                const lo = Math.min(min, max);
                const hi = Math.max(min, max);
                if (!(hi > 0))
                    return null;
                const safeLo = lo > 0 ? lo : hi / 1000;
                const expMin = Math.floor(Math.log10(safeLo));
                const expMax = Math.ceil(Math.log10(hi));
                const decades = Math.max(1, expMax - expMin);
                const decadeStep = Math.max(1, Math.ceil(decades / 6));
                return buildLogTicks(yDomain[0], yDomain[1], decadeStep);
            }
            return buildOriginAutoTicks(yDomain[0], yDomain[1], 6);
        }
        if (effectiveYScale !== "linear") {
            if (mode !== "decades")
                return null;
            return buildLogTicks(yDomain[0], yDomain[1], axis?.yDecadeStep);
        }
        if (mode === "step") {
            const stepRaw = parseOptionalNumber(axis?.yStep);
            const step = stepRaw !== null ? stepRaw / plotYFactor : null;
            return step ? buildStepTicks(yDomain[0], yDomain[1], step) : null;
        }
        const count = Math.max(2, Math.floor(Number(axis?.yTickCount) || 6));
        return buildNiceTicks(yDomain[0], yDomain[1], count, {
            preferTightRange: false,
        });
    }, [
        axis?.yDecadeStep,
        axis?.yStep,
        axis?.yTickCount,
        axis?.yTicks,
        effectiveYScale,
        plotYFactor,
        yDomain,
    ]);
    const originChartYRange = useMemo(() => {
        const ticks = Array.isArray(yTicks) && yTicks.length >= 2 ? yTicks : null;
        const minCandidate = ticks ? Number(ticks[0]) : Number(yDomain?.[0]);
        const maxCandidate = ticks ? Number(ticks[ticks.length - 1]) : Number(yDomain?.[1]);
        if (!Number.isFinite(minCandidate) || !Number.isFinite(maxCandidate))
            return null;
        const min = Math.min(minCandidate, maxCandidate);
        const max = Math.max(minCandidate, maxCandidate);
        if (!(max > min))
            return null;
        const mode: "linear" | "log" = effectiveYScale === "linear" ? "linear" : "log";
        if (mode === "log" && (!(min > 0) || !(max > 0)))
            return null;
        return { mode, min, max };
    }, [effectiveYScale, yDomain, yTicks]);
    useEffect(() => {
        originChartYRangeRef.current = originChartYRange;
    }, [originChartYRange]);
    const displayXTicks = useMemo(() => (Array.isArray(xTicks) ? xTicks.map((tick: any) => Number(tick) * plotXFactor) : null), [plotXFactor, xTicks]);
    // Keep tooltip x precision higher than axis labels by default; allow manual override in settings.
    const xTickDigitsDisplay = useMemo(() => inferTickDigitsFromTicks(displayXTicks), [displayXTicks]);
    const xTooltipDigitsAuto = useMemo(() => Math.min(8, Math.max(2, xTickDigitsDisplay + 2)), [xTickDigitsDisplay]);
    const xTooltipDigits = useMemo(() => {
        const manualDigits = parseOptionalNumber(axis?.xTooltipDigits);
        if (manualDigits === null)
            return xTooltipDigitsAuto;
        return Math.max(0, Math.min(20, Math.round(manualDigits)));
    }, [axis?.xTooltipDigits, xTooltipDigitsAuto]);
    const xLabelInterval = useMemo(() => computeLabelInterval(xTicks, 7), [xTicks]);
    const mainChartRenderKey = useMemo(() => [
        effectiveActiveFileId ?? "no-file",
        effectivePlotType,
        axis?.yScale ?? "linear",
        focusedSeriesId ?? "no-focus",
    ].join("::"), [
        effectiveActiveFileId,
        effectivePlotType,
        focusedSeriesId,
        axis?.yScale,
    ]);
    const isMetricsDetailsPending = detailAnalysisState.key === detailAnalysisKey && detailAnalysisState.pending;
    const metricsRows = useMemo(() => {
        if (!activeFile?.series?.length)
            return [];
        return activeFile.series.map((series: any) => {
            const analysis = detailAnalysisBySeriesId.get(series.id) ??
                (focusedSeriesId === series.id ? focusedAnalysis : null);
            return {
                id: series.id,
                name: series.name,
                group: Number(series.groupIndex ?? 0) + 1,
                yCol: series.yCol,
                isPending: !analysis && isMetricsDetailsPending,
                ...analysis?.metrics,
            };
        });
    }, [activeFile, detailAnalysisBySeriesId, focusedAnalysis, focusedSeriesId, isMetricsDetailsPending]);
    const persistIonIoffManualTargets = React.useCallback((targets: any) => {
        apiService
            .updateDeviceAnalysisSettings({
            ionIoffManualIonX: String(targets?.ionX ?? "").trim(),
            ionIoffManualIoffX: String(targets?.ioffX ?? "").trim(),
        })
            .catch(() => { });
    }, []);
    const commitManualRange = React.useCallback((fileId: any, seriesId: any, range: any) => {
        if (!fileId || !seriesId)
            return;
        if (!range)
            return;
        const x1 = Number(range?.x1);
        const x2 = Number(range?.x2);
        if (!Number.isFinite(x1) || !Number.isFinite(x2))
            return;
        const lo = Math.min(x1, x2);
        const hi = Math.max(x1, x2);
        setSsManualRanges((prev: any) => {
            const prevFile = prev?.[fileId] ?? {};
            const prevRange = prevFile?.[seriesId] ?? null;
            if (Number(prevRange?.x1) === lo && Number(prevRange?.x2) === hi) {
                return prev;
            }
            return {
                ...(prev || {}),
                [fileId]: {
                    ...prevFile,
                    [seriesId]: { x1: lo, x2: hi },
                },
            };
        });
    }, [setSsManualRanges]);
    const handleCurrentBiasOverlayCommit = React.useCallback((role: CurrentBiasRole, x: number) => {
        if (!Number.isFinite(x))
            return;
        const nextValue = formatBiasInputValue(x, plotXFactor);
        const nextTargets = {
            ionX: role === "ion"
                ? nextValue
                : String(ionIoffManualTargets?.ionX ?? ""),
            ioffX: role === "ioff"
                ? nextValue
                : String(ionIoffManualTargets?.ioffX ?? ""),
        };
        setIonIoffManualTargets((prev: any) => {
            const prevIon = String(prev?.ionX ?? "");
            const prevIoff = String(prev?.ioffX ?? "");
            if (prevIon === nextTargets.ionX && prevIoff === nextTargets.ioffX) {
                return prev;
            }
            return {
                ...(prev || {}),
                ionX: nextTargets.ionX,
                ioffX: nextTargets.ioffX,
            };
        });
        persistIonIoffManualTargets(nextTargets);
    }, [
        ionIoffManualTargets?.ioffX,
        ionIoffManualTargets?.ionX,
        persistIonIoffManualTargets,
        plotXFactor,
        setIonIoffManualTargets,
    ]);
    const handleSsOverlayCommit = React.useCallback((range: SsRange) => {
        const fileId = activeFile?.fileId ?? null;
        const seriesId = focusedSeriesId ?? null;
        if (!fileId || !seriesId)
            return;
        commitManualRange(fileId, seriesId, range);
    }, [activeFile?.fileId, commitManualRange, focusedSeriesId]);
    useEffect(() => {
        if (ionIoffMethod !== "manual")
            return;
        if (!transferMetricsApplicable)
            return;
        if (!focusedSeriesId)
            return;
        const ionFilled = String(ionIoffManualTargets?.ionX ?? "").trim().length > 0;
        const ioffFilled = String(ionIoffManualTargets?.ioffX ?? "").trim().length > 0;
        if (ionFilled && ioffFilled)
            return;
        const points = pointsBySeriesId.get(focusedSeriesId) ?? [];
        if (!points.length)
            return;
        const autoMetrics = computeBaseCurrentMetrics({
            points,
            sourceFile: activeFile,
        });
        const nextIonX = ionFilled
            ? String(ionIoffManualTargets?.ionX ?? "")
            : Number.isFinite(autoMetrics?.xAtIon)
                ? formatBiasInputValue(Number(autoMetrics.xAtIon), plotXFactor)
                : "";
        const nextIoffX = ioffFilled
            ? String(ionIoffManualTargets?.ioffX ?? "")
            : Number.isFinite(autoMetrics?.xAtIoff)
                ? formatBiasInputValue(Number(autoMetrics.xAtIoff), plotXFactor)
                : "";
        if (!nextIonX && !nextIoffX)
            return;
        setIonIoffManualTargets((prev: any) => {
            const prevIon = String(prev?.ionX ?? "");
            const prevIoff = String(prev?.ioffX ?? "");
            if (prevIon === nextIonX && prevIoff === nextIoffX) {
                return prev;
            }
            return {
                ...(prev || {}),
                ionX: nextIonX,
                ioffX: nextIoffX,
            };
        });
    }, [
        activeFile,
        focusedSeriesId,
        ionIoffManualTargets?.ioffX,
        ionIoffManualTargets?.ionX,
        ionIoffMethod,
        plotXFactor,
        pointsBySeriesId,
        setIonIoffManualTargets,
        transferMetricsApplicable,
    ]);
    const handleSelectFile = React.useCallback((fileId: any) => {
        if (!fileId)
            return;
        preserveScrollPosition(() => setActiveFileId(fileId));
    }, [setActiveFileId]);
    const buildSsTooltip = React.useCallback((row: any) => {
        if (!row)
            return "";
        const parts = [];
        if (row.ssMethod)
            parts.push(`method=${row.ssMethod}`);
        if (row.ssConfidence)
            parts.push(`confidence=${row.ssConfidence}`);
        if (row.ssReason)
            parts.push(`reason=${row.ssReason}`);
        if (Number.isFinite(row.ssR2))
            parts.push(`r2=${formatNumber(row.ssR2, { digits: 4 })}`);
        if (Number.isFinite(row.ssSpanDec))
            parts.push(`spanDec=${formatNumber(row.ssSpanDec, { digits: 2 })}`);
        if (Number.isFinite(row.ssN))
            parts.push(`n=${row.ssN}`);
        if (Number.isFinite(row.ssX1) && Number.isFinite(row.ssX2)) {
            parts.push(`range=[${formatNumber(row.ssX1, { digits: 4 })}, ${formatNumber(row.ssX2, { digits: 4 })}]`);
        }
        if (Number.isFinite(row.legacySsMin)) {
            parts.push(`legacySSmin=${formatNumber(row.legacySsMin, { digits: 2 })}`);
            if (Number.isFinite(row.legacyXAtSsMin)) {
                parts.push(`x@legacy=${formatNumber(row.legacyXAtSsMin, { digits: 4 })}`);
            }
        }
        return parts.join(" | ");
    }, []);
    const buildCurrentTooltip = React.useCallback((role: "ion" | "ioff" | "ratio", row: any) => {
        if (!row)
            return "";
        if (role === "ratio") {
            const parts = [`method=${row.currentMethod ?? "unavailable"}`];
            if (row.ionWindow) {
                parts.push(`Ion ${formatCurrentWindowSummary(row.ionWindow, plotXFactor, xTooltipDigits)}`);
            }
            if (row.ioffWindow) {
                parts.push(`Ioff ${formatCurrentWindowSummary(row.ioffWindow, plotXFactor, xTooltipDigits)}`);
            }
            if (Array.isArray(row.currentCandidateWindows) && row.currentCandidateWindows.length) {
                parts.push(`candidates=${row.currentCandidateWindows
                    .map((window: any) => formatCurrentWindowSummary(window, plotXFactor, xTooltipDigits))
                    .join(" | ")}`);
            }
            return parts.join(" | ");
        }
        const window = role === "ion" ? row.ionWindow : row.ioffWindow;
        return formatCurrentWindowSummary(window, plotXFactor, xTooltipDigits);
    }, [plotXFactor, xTooltipDigits]);
    const calculatedParametersColumnWidths = useMemo(() => calculatedParametersMode === "transfer"
        ? TRANSFER_CALCULATED_PARAMETERS_COLUMN_WIDTHS_PX
        : DERIVATIVE_ONLY_CALCULATED_PARAMETERS_COLUMN_WIDTHS_PX, [calculatedParametersMode]);
    const calculatedParametersTableMinWidth = useMemo(() => calculatedParametersColumnWidths.reduce((total, width) => total + width, 0), [calculatedParametersColumnWidths]);
    const metricsRowElements = useMemo(() => metricsRows.map((row: any) => (<CalculatedParametersRow key={row.id} row={row} isPending={Boolean(row?.isPending)} buildCurrentTooltip={buildCurrentTooltip} buildSsTooltip={buildSsTooltip} showTransferMetrics={calculatedParametersMode === "transfer"}/>)), [buildCurrentTooltip, buildSsTooltip, calculatedParametersMode, metricsRows]);
    const calculatedParametersSummary = useMemo(() => calculatedParametersMode === "transfer"
        ? `${gmUi.summaryLabel}: max |${gmUi.metricSymbol}|, SS: fit (mV/dec), J uses |I|/Area`
        : calculatedParametersMode === "output"
            ? `${gmUi.summaryLabel}: max |${gmUi.metricSymbol}| (output)`
            : `${gmUi.summaryLabel}: max |${gmUi.metricSymbol}|`, [calculatedParametersMode, gmUi.metricSymbol, gmUi.summaryLabel]);
    const metricsProgressText = useMemo(() => isMetricsDetailsPending
        ? `${calculatedParametersSummary} | Computing details ${detailAnalysisState.completedCount}/${detailAnalysisState.totalCount}`
        : calculatedParametersSummary, [calculatedParametersSummary, detailAnalysisState.completedCount, detailAnalysisState.totalCount, isMetricsDetailsPending]);
    if (!processedData || processedData.length === 0)
        return null;
    return (<div className="h-full min-h-0 grid grid-cols-1 md:grid-rows-1 md:grid-cols-[var(--analysis-sidebar-width)_minmax(0,1fr)] gap-1 md:gap-1" ref={toastContainerRef} style={{
            "--analysis-sidebar-width": "clamp(240px, var(--sidebar-width), 420px)",
        } as CSSProperties}>
      <aside
        id="device-analysis-overview-sidebar"
        className="md:min-h-0 flex flex-col h-full"
      >
        <OverviewGrid processedData={processedData} processingStatus={processingStatus} activeFileId={effectiveActiveFileId} onSelectFile={handleSelectFile} onVisibleFileIdsChange={setOverviewVisibleFileIds} selectedOriginCanvasKeySet={selectedOriginCanvasKeySet} onToggleOriginCanvasSelection={toggleOriginCanvasSelection} originExportMode={resolvedOriginExportMode} originCanvasExportScope={originCanvasExportScope} xUnitFactor={resolvedXUnitMeta.factor} xUnitLabel={resolvedXUnitMeta.label} yUnitFactor={resolvedYUnitMeta.factor} yUnitLabel={resolvedYUnitMeta.label} yScale={overviewYScaleType}/>
      </aside>

      <ScrollArea className="md:min-h-0 min-w-0" axis="y" viewportClassName="flex flex-col min-h-full">
        <section className="flex min-w-0 flex-col flex-1 gap-1 pr-1" aria-label="Device Analysis results">
          <section aria-label="Device Analysis chart">
        <Card variant="panel" className="flex min-w-0 flex-col">

          <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
            <div className="flex items-center gap-4 flex-wrap">
              <PlotTypeToggle activePlotType={effectivePlotType} ssApplicable={ssApplicable} areaAvailable={Boolean(area)} onChange={handlePlotTypeChange}/>



              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <Select id="device-analysis-y-unit-select" size="md" value={yUnit} onChange={(next: any) => {
            const nextUnit = normalizeDeviceAnalysisYUnit(next, "A");
            userChangedYUnitRef.current = true;
            setYUnit(nextUnit);
            apiService
                .updateDeviceAnalysisSettings({ yUnit: nextUnit })
                .catch(() => { });
        }} options={[
            {
                value: "A",
                label: "A",
            },
            {
                value: "mA",
                label: "mA",
            },
            {
                value: "uA",
                label: "µA",
            },
            {
                value: "nA",
                label: "nA",
            },
            {
                value: "pA",
                label: "pA",
            },
        ]} aria-label="Y unit" className="w-fit da-neutral-select" stableWidth data-cta="Device Analysis" data-cta-position="y-unit" data-cta-copy="y unit"/>
                </div>

                <div className="flex items-center gap-1">
                  {effectivePlotType === "ss" ? (<span className="text-xs text-text-primary font-mono whitespace-nowrap">
                      log(|I|)
                    </span>) : (<Select id="device-analysis-y-scale-select" size="md" value={axis.yScale === "logAbs" ? "log" : axis.yScale} onChange={(next: any) => {
                const nextScale = next === "log" ? "log" : "linear";
                userChangedYScaleRef.current = true;
                setAxis((prev: any) => {
                    const nextTicks = nextScale === "linear" ? "nice" : "decades";
                    return {
                        ...prev,
                        yScale: nextScale,
                        yTicks: nextTicks,
                    };
                });
                apiService
                    .updateDeviceAnalysisSettings({ yScale: nextScale })
                    .catch(() => { });
            }} options={[
                {
                    value: "linear",
                    label: "Linear",
                },
                {
                    value: "log",
                    label: "Log",
                },
            ]} aria-label="Y scale" className="w-fit da-neutral-select" stableWidth data-cta="Device Analysis" data-cta-position="y-scale" data-cta-copy="y scale"/>)}
                </div>

                {effectivePlotType !== "iv" && activeFile?.series?.length ? (<div className="flex items-center gap-1">
                    <Select id="device-analysis-curve-select" size="md" value={focusedSeriesId ?? ""} onChange={(next: any) => setFocusedSeriesId(next)} options={(activeFile?.series ?? []).map((s: any) => ({
                value: s.id,
                label: s.name,
            }))} className="w-fit max-w-[180px] da-neutral-select" placeholder="Select curve"/>
                  </div>) : null}

                {effectivePlotType === "gm" ? (<div className="flex items-center gap-1">
                    <span className="text-xs text-text-secondary whitespace-nowrap">
                      gₘ:
                    </span>
                    <Select id="device-analysis-gm-mode-select" size="md" value={gmMode} onChange={(next: any) => setGmMode(next === "legend" ? "legend" : "x")} options={gmUi.modeOptions} className="w-[170px]"/>
                  </div>) : null}

                {effectivePlotType === "ss" ? (<div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-text-secondary whitespace-nowrap">
                        SS:
                      </span>
                      <Select id="device-analysis-ss-method-select" size="md" value={ssMethod} onChange={(next: any) => {
                const method = next === "auto" ||
                    next === "manual" ||
                    next === "idWindow" ||
                    next === "legacy"
                    ? next
                    : "auto";
                setSsMethod(method);
                apiService
                    .updateDeviceAnalysisSettings({
                    ssMethodDefault: method,
                })
                    .catch(() => { });
            }} options={[
                { value: "auto", label: "Auto (strict)" },
                { value: "manual", label: "Manual (drag)" },
                { value: "idWindow", label: "|Id| window" },
                { value: "legacy", label: "Legacy (min deriv)" },
            ]} className="w-[150px]"/>
                    </div>

                    <Button variant="text" size="sm" onClick={() => {
                setSsMethod("auto");
                apiService
                    .updateDeviceAnalysisSettings({ ssMethodDefault: "auto" })
                    .catch(() => { });
            }} className="h-[38px] px-2 text-xs border border-border/50 hover:bg-bg-subtle" title="Reset SS method to Auto (strict)">
                      Reset
                    </Button>

                    <Button variant={ssShowFitLine ? "secondary" : "text"} size="sm" onClick={() => {
                const next = !ssShowFitLine;
                setSsShowFitLine(next);
                apiService
                    .updateDeviceAnalysisSettings({ ssShowFitLine: next })
                    .catch(() => { });
            }} className="h-[38px] px-2 text-xs" title="Toggle fit line overlay (focused curve only)">
                      Fit line
                    </Button>

                    <Button variant={ssDiagnosticsEnabled ? "secondary" : "text"} size="sm" onClick={() => {
                const next = !ssDiagnosticsEnabled;
                setSsDiagnosticsEnabled(next);
                apiService
                    .updateDeviceAnalysisSettings({
                    ssDiagnosticsEnabled: next,
                })
                    .catch(() => { });
            }} className="h-[38px] px-2 text-xs" title={t("da_chart_ss_diagnostics_toggle_title")}>
                      {t("da_chart_ss_diagnostics")}
                    </Button>

                    {ssMethod === "idWindow" ? (<div className="flex items-center gap-1 text-xs text-text-secondary">
                        <span className="whitespace-nowrap">|Id|:</span>
                        <input id="device-analysis-ss-id-low" value={ssIdWindow?.low ?? ""} onChange={(e: any) => setSsIdWindow((prev: any) => ({
                    ...(prev || {}),
                    low: e.target.value,
                }))} onBlur={() => {
                    const low = Number(ssIdWindow?.low);
                    const high = Number(ssIdWindow?.high);
                    if (Number.isFinite(low) &&
                        Number.isFinite(high) &&
                        low > 0 &&
                        high > 0) {
                        apiService
                            .updateDeviceAnalysisSettings({
                            ssIdLow: low,
                            ssIdHigh: high,
                        })
                            .catch(() => { });
                    }
                }} placeholder="low (A)" className="bg-bg-page border border-border rounded-lg h-[38px] px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-focus/40 w-[90px]"/>
                        <span>~</span>
                        <input id="device-analysis-ss-id-high" value={ssIdWindow?.high ?? ""} onChange={(e: any) => setSsIdWindow((prev: any) => ({
                    ...(prev || {}),
                    high: e.target.value,
                }))} onBlur={() => {
                    const low = Number(ssIdWindow?.low);
                    const high = Number(ssIdWindow?.high);
                    if (Number.isFinite(low) &&
                        Number.isFinite(high) &&
                        low > 0 &&
                        high > 0) {
                        apiService
                            .updateDeviceAnalysisSettings({
                            ssIdLow: low,
                            ssIdHigh: high,
                        })
                            .catch(() => { });
                    }
                }} placeholder="high (A)" className="bg-bg-page border border-border rounded-lg h-[38px] px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-focus/40 w-[90px]"/>
                      </div>) : null}
                  </div>) : null}

                {transferMetricsApplicable ? (<div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-text-secondary whitespace-nowrap">
                        Ion/Ioff:
                      </span>
                      <Select id="device-analysis-current-method-select" size="md" value={ionIoffMethod} onChange={(next: any) => {
                const method = next === "manual" ? "manual" : "auto";
                setIonIoffMethod(method);
                apiService
                    .updateDeviceAnalysisSettings({
                    ionIoffMethodDefault: method,
                })
                    .catch(() => { });
            }} options={[
                { value: "auto", label: "Auto windows" },
                { value: "manual", label: "Manual bias" },
            ]} className="w-[150px]"/>
                    </div>

                    {ionIoffMethod === "manual" ? (<div className="flex items-center gap-1 text-xs text-text-secondary">
                        <span className="whitespace-nowrap">Ion x:</span>
                        <input id="device-analysis-ion-x-input" value={ionIoffManualTargets?.ionX ?? ""} onChange={(e: any) => {
                    setIonIoffManualTargets((prev: any) => ({
                    ...(prev || {}),
                    ionX: e.target.value,
                }));
                }} onBlur={() => {
                    apiService
                        .updateDeviceAnalysisSettings({
                        ionIoffManualIonX: String(ionIoffManualTargets?.ionX ?? "").trim(),
                    })
                        .catch(() => { });
                }} placeholder={`e.g. ${formatNumber((Number(xDomain?.[1]) || 1) * plotXFactor, { digits: 2 })}`} className="bg-bg-page border border-border rounded-lg h-[38px] px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-focus/40 w-[90px]"/>
                        <span className="whitespace-nowrap">Ioff x:</span>
                        <input id="device-analysis-ioff-x-input" value={ionIoffManualTargets?.ioffX ?? ""} onChange={(e: any) => {
                    setIonIoffManualTargets((prev: any) => ({
                    ...(prev || {}),
                    ioffX: e.target.value,
                }));
                }} onBlur={() => {
                    apiService
                        .updateDeviceAnalysisSettings({
                        ionIoffManualIoffX: String(ionIoffManualTargets?.ioffX ?? "").trim(),
                    })
                        .catch(() => { });
                }} placeholder="e.g. 0" className="bg-bg-page border border-border rounded-lg h-[38px] px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-focus/40 w-[90px]"/>
                      </div>) : null}
                  </div>) : null}

                {showFileSelect ? (<Select id="device-analysis-file-select" size="md" value={effectiveActiveFileId ?? ""} onChange={(val: any) => handleSelectFile(val)} options={processedData.map((f: any) => ({
            value: f.fileId,
            label: f.fileName,
        }))} className="w-[240px] da-neutral-select" placeholder="Select File" data-cta="Device Analysis" data-cta-position="file-select" data-cta-copy="file select"/>) : null}
                <Button id="device-analysis-axis-toggle-btn" variant="secondary" size="sm" onClick={() => setShowAxisControls((v: any) => !v)} className="h-[38px] px-3 text-xs border-border bg-bg-page hover:bg-bg-surface-hover" title="Axis settings">
                  Axis
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <span className="whitespace-nowrap">
                Area (for J = |I|/Area):
              </span>
              <input id="device-analysis-area-input" value={areaInput} onChange={(e: any) => setAreaInput(e.target.value)} placeholder="e.g. 1e-4" className="bg-bg-page border border-border rounded-lg h-[38px] px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-focus/40 w-[100px]"/>
            </div>

          </div>

          {effectivePlotType === "ss" && ssSummary ? (<SsSummaryStrip summary={ssSummary}/>) : null}
          {showCurrentContext ? (<div className="mb-3 flex flex-col gap-1 rounded-lg border border-border/60 bg-bg-page/70 px-3 py-2 text-xs text-text-secondary">
              <div className="text-text-primary">
                {focusedCurrentSummary}
              </div>
              {focusedCurrentLegend ? (<div>{focusedCurrentLegend}</div>) : null}
            </div>) : null}

          {showAxisControls && (<div className="bg-bg-page border border-border rounded-lg p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-xs font-semibold text-text-primary">
                  Axis Settings
                </div>
                <Button variant="text" size="sm" onClick={() => setAxis((prev: any) => ({
                ...prev,
                xMin: "",
                xMax: "",
                xTicks: "auto",
                xTickCount: 6,
                xStep: "",
                xTooltipDigits: "",
                yMin: "",
                yMax: "",
                yScale: "linear",
                yTicks: "nice",
                yTickCount: 6,
                yStep: "",
                yDecadeStep: 1,
            }))} className="h-6 px-2 text-xs text-text-secondary hover:text-text-primary">
                  Reset
                </Button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold text-text-secondary">
                    X Axis
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input id="device-analysis-axis-x-min" value={axis.xMin} onChange={(e: any) => setAxis((prev: any) => ({ ...prev, xMin: e.target.value }))} placeholder="min (auto)" className="bg-bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-focus/40"/>
                    <input id="device-analysis-axis-x-max" value={axis.xMax} onChange={(e: any) => setAxis((prev: any) => ({ ...prev, xMax: e.target.value }))} placeholder="max (auto)" className="bg-bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-focus/40"/>
                  </div>

                  <div className="grid grid-cols-3 gap-2 items-center">
                    <select value={axis.xTicks} onChange={(e: any) => setAxis((prev: any) => ({ ...prev, xTicks: e.target.value }))} className="bg-bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-focus/40" title="Tick mode">
                      <option value="auto">ticks: auto</option>
                      <option value="nice">ticks: nice</option>
                      <option value="step">ticks: step</option>
                    </select>
                    <input id="device-analysis-axis-x-tick-count" value={axis.xTickCount} onChange={(e: any) => setAxis((prev: any) => ({
                ...prev,
                xTickCount: e.target.value,
            }))} disabled={axis.xTicks !== "nice"} placeholder="count" className="bg-bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-focus/40 disabled:opacity-50" title="Nice tick count"/>
                    <input id="device-analysis-axis-x-step" value={axis.xStep} onChange={(e: any) => setAxis((prev: any) => ({ ...prev, xStep: e.target.value }))} disabled={axis.xTicks !== "step"} placeholder="step" className="bg-bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-focus/40 disabled:opacity-50" title="Step tick increment"/>
                  </div>

                  <div className="grid grid-cols-3 gap-2 items-center">
                    <div className="text-[11px] text-text-secondary">
                      {t("da_chart_axis_x_tooltip_digits")}
                    </div>
                    <input id="device-analysis-axis-x-tooltip-digits" value={axis.xTooltipDigits} onChange={(e: any) => setAxis((prev: any) => ({ ...prev, xTooltipDigits: e.target.value }))} inputMode="numeric" placeholder={t("da_chart_axis_x_tooltip_digits_placeholder", { auto: xTooltipDigitsAuto })} className="col-span-2 bg-bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-focus/40" title={t("da_chart_axis_x_tooltip_digits_title")}/>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] font-semibold text-text-secondary">
                    Y Axis
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input id="device-analysis-axis-y-min" value={axis.yMin} onChange={(e: any) => setAxis((prev: any) => ({ ...prev, yMin: e.target.value }))} placeholder={`min (auto) (${plotYUnitLabel})`} className="bg-bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-focus/40"/>
                    <input id="device-analysis-axis-y-max" value={axis.yMax} onChange={(e: any) => setAxis((prev: any) => ({ ...prev, yMax: e.target.value }))} placeholder={`max (auto) (${plotYUnitLabel})`} className="bg-bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-focus/40"/>
                  </div>

                  <div className="grid grid-cols-3 gap-2 items-center">
                    <select value={axis.yScale} onChange={(e: any) => {
                const nextScale = e.target.value;
                const nextTicks = nextScale === "linear" ? "nice" : "decades";
                userChangedYScaleRef.current = true;
                setAxis((prev: any) => ({
                    ...prev,
                    yScale: nextScale,
                    yTicks: nextTicks,
                }));
                if (nextScale === "linear" || nextScale === "log") {
                    apiService
                        .updateDeviceAnalysisSettings({ yScale: nextScale })
                        .catch(() => { });
                }
            }} className="bg-bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-focus/40" title="Scale">
                      <option value="linear">scale: linear</option>
                      <option value="log">scale: log</option>
                      <option value="logAbs">scale: log(|y|)</option>
                    </select>
                    <select value={axis.yTicks} onChange={(e: any) => setAxis((prev: any) => ({ ...prev, yTicks: e.target.value }))} className="bg-bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-focus/40" title="Tick mode">
                      <option value="auto">ticks: auto</option>
                      <option value="nice" disabled={effectiveYScale !== "linear"}>
                        ticks: nice
                      </option>
                      <option value="step" disabled={effectiveYScale !== "linear"}>
                        ticks: step
                      </option>
                      <option value="decades" disabled={effectiveYScale === "linear"}>
                        ticks: decades
                      </option>
                    </select>
                    {effectiveYScale === "linear" ? (axis.yTicks === "step" ? (<input id="device-analysis-axis-y-step" value={axis.yStep} onChange={(e: any) => setAxis((prev: any) => ({
                    ...prev,
                    yStep: e.target.value,
                }))} placeholder={`step (${plotYUnitLabel})`} className="bg-bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-focus/40" title="Major tick increment"/>) : (<input id="device-analysis-axis-y-tick-count" value={axis.yTickCount} onChange={(e: any) => setAxis((prev: any) => ({
                    ...prev,
                    yTickCount: e.target.value,
                }))} disabled={axis.yTicks !== "nice"} placeholder="count" className="bg-bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-focus/40 disabled:opacity-50" title="Nice tick count"/>)) : (<input id="device-analysis-axis-y-decade-step" value={axis.yDecadeStep} onChange={(e: any) => setAxis((prev: any) => ({
                    ...prev,
                    yDecadeStep: e.target.value,
                }))} disabled={axis.yTicks !== "decades"} placeholder="decade step" className="bg-bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-focus/40 disabled:opacity-50" title="Major tick increment (decades)"/>)}
                  </div>

                  {yScaleWarning ? (<div className="text-[11px] text-yellow-500">
                      {yScaleWarning}
                    </div>) : null}
                </div>
              </div>
            </div>)}

          {activeFile?.series?.length ? (<div className="flex flex-col">


              {effectivePlotType === "gm" &&
                gmMode === "legend" &&
                !gmLegendStatus.ok ? (<div className="text-[11px] text-red-500 mb-2">
                  {gmLegendStatus.message}
                </div>) : null}

              {effectivePlotType === "gm" ? (<div className="text-[11px] text-text-secondary mb-2">
                  {t("da_chart_gm_note", { label: gmUi.summaryLabel })}
                </div>) : null}

              {resolvedOriginExportMode === "merged" ? (<div className="mb-3 rounded-xl border border-border bg-bg-page/40 px-3 py-2">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-text-primary">
                        {t("da_origin_collect_actions_title")}
                      </div>
                      <div className="text-[11px] text-text-secondary leading-5">
                        {t("da_origin_collection_current_file_summary", {
                            count: currentCollectedSeriesCount,
                            total: activeOriginSeries.length,
                        })}
                      </div>
                      {focusedSeriesId ? (<div className="text-[11px] text-text-secondary leading-5">
                          {t("da_origin_collection_match_filtered_hint", {
                                label: focusedOriginSeriesDisplayLabel,
                            })}
                        </div>) : null}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        variant="ghost"
                        size="control"
                        onClick={selectAllOriginSeriesForActiveFile}
                        title={t("da_origin_collection_select_all_current")}
                        aria-label={t("da_origin_collection_select_all_current")}
                      >
                        {t("da_origin_collection_select_all_current")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="control"
                        onClick={clearOriginSeriesSelectionForActiveFile}
                        disabled={currentCollectedSeriesCount <= 0}
                        title={t("da_origin_collection_clear_current")}
                        aria-label={t("da_origin_collection_clear_current")}
                      >
                        {t("da_origin_collection_clear_current")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="control"
                        onClick={handleCollectMatchingLegendAcrossFilteredFiles}
                        disabled={!focusedSeriesId || overviewVisibleFileIds.length <= 0}
                        title={t("da_origin_collection_match_filtered")}
                        aria-label={t("da_origin_collection_match_filtered")}
                      >
                        {t("da_origin_collection_match_filtered")}
                      </Button>
                    </div>
                  </div>
                </div>) : null}
              <div ref={mainChartContainerRef} className="h-[500px] min-h-[500px] flex-shrink-0">
                {isMainChartSizeReady ? (<MainPlotChart
                    key={mainChartRenderKey}
                    plotType={effectivePlotType}
                    activeFile={activeFile}
                    seriesList={renderPlotSeries}
                    xDomain={xDomain}
                    xTicks={xTicks}
                    plotXFactor={plotXFactor}
                    plotXUnitLabel={resolvedXUnitMeta.label}
                    xTickDigits={xTickDigitsDisplay}
                    xTooltipDigits={xTooltipDigits}
                    xLabelInterval={xLabelInterval}
                    effectiveYScale={effectiveYScale}
                    yDomain={yDomain}
                    yTicks={yTicks}
                    yScaleMode={yScaleMode}
                    plotYFactor={plotYFactor}
                    plotYUnitLabel={plotYUnitLabel}
                    focusedSeriesId={focusedSeriesId}
                    focusedFitLine={focusedFitLineForRender}
                    focusedSeriesColor={focusedSeriesColor}
                    highlightOverlays={currentOverlaysForPlot}
                    currentBiasMarkers={currentBiasMarkers}
                    focusedSsOverlay={focusedSsOverlay}
                    ssOverlayStyle={ssOverlayStyle}
                    interactiveSeriesXs={focusedSeriesXs}
                    currentBiasInteraction={currentManualBiasApplicable
                    ? {
                        enabled: true,
                        markers: currentBiasMarkers,
                        onCommit: handleCurrentBiasOverlayCommit,
                    }
                    : null}
                    ssInteraction={effectivePlotType === "ss" && ssMethod === "manual"
                    ? {
                        enabled: true,
                        range: focusedSsOverlay,
                        onCommit: handleSsOverlayCommit,
                    }
                    : null}
                    legendWidth={MAIN_PLOT_LEGEND_WIDTH}
                    legendContent={renderOriginSelectionLegend}
                  />) : (<div className="h-full w-full"/>) }
              </div>

              {effectivePlotType === "ss" && focusedSsDiagnosticsForRender ? (<div className="mt-4">
                  <div className="text-xs text-text-secondary mb-2">
                    {t("da_chart_ss_diagnostics")}
                  </div>
                  <div ref={diagnosticsChartContainerRef} className="h-[260px] min-h-[260px] flex-shrink-0">
                    {isDiagnosticsChartSizeReady ? (<SsDiagnosticsChart data={focusedSsDiagnosticsForRender} xDomain={xDomain} xTicks={xTicks} xFactor={plotXFactor} xUnitLabel={resolvedXUnitMeta.label} xLabelInterval={xLabelInterval} xTickDigits={xTickDigitsDisplay} xTooltipDigits={xTooltipDigits} yDomain={ssDiagnosticsYDomain} yTicks={ssDiagnosticsYTicks} overlay={focusedSsOverlay} overlayStyle={ssOverlayStyle} ssReferenceValue={ssSummary?.ss} seriesColor={focusedSeriesColor} rightReservedWidth={MAIN_PLOT_LEGEND_WIDTH + 15}/>) : (<div className="h-full w-full"/>)}
                  </div>
                </div>) : null}
            </div>) : (<div className="flex items-center justify-center h-[300px] text-text-secondary">
              No series data for this file.
            </div>)}
        </Card>
      </section>

          {activeFile?.series?.length ? (<Card variant="panel" className="flex min-w-0 flex-col flex-1">
            <div className="mb-3 flex min-w-0 items-center justify-between gap-3 flex-wrap">
              <div className="flex min-w-0 items-center gap-3 flex-wrap">
                <h3 className="text-sm font-semibold text-text-primary">
                  {t("da_analysis_results_title")}
                </h3>
                <Tabs idBase="device-analysis-results-tabs" value={resultsTab} onChange={(next) => setResultsTab(next === "export" ? "export" : "metrics")} size="sm" hoverPreview={false} groupLabel={t("da_analysis_results_title")} itemClassName="!px-3" options={[
                {
                    value: "metrics",
                    label: t("da_analysis_results_tab_metrics"),
                },
                {
                    value: "export",
                    label: t("da_analysis_results_tab_export"),
                },
            ]}/>
              </div>
              <div
                className="min-w-0 flex-1 truncate text-right text-xs text-text-secondary"
                title={resultsTab === "metrics" ? metricsProgressText : exportSelectionSummary}
              >
                {resultsTab === "metrics" ? metricsProgressText : exportSelectionSummary}
              </div>
            </div>

            {resultsTab === "metrics" ? (<ScrollArea axis="x" className="da-calculated-parameters-scroll-area min-w-0 w-full">
                <table
                  className="w-full table-fixed text-sm border-collapse"
                  style={{ minWidth: calculatedParametersTableMinWidth }}
                >
                  <colgroup>
                    {calculatedParametersColumnWidths.map((width, index) => (<col key={index} style={{ width }}/>))}
                  </colgroup>
                  <thead className="sticky top-0 bg-bg-surface z-10">
                    <tr className="border-b border-border">
                      <th
                        rowSpan={2}
                        className="p-2 text-[14px] font-semibold tracking-wide text-text-secondary text-center whitespace-nowrap align-middle"
                      >
                        {t("da_calc_group_series")}
                      </th>
                      {transferMetricsApplicable ? (<>
                          <th colSpan={2} className="p-2 text-[14px] font-semibold tracking-wide text-text-secondary text-center border-l border-border bg-emerald-500/5">
                            {t("da_calc_group_on_state")}
                          </th>
                          <th colSpan={2} className="p-2 text-[14px] font-semibold tracking-wide text-text-secondary text-center border-l border-border bg-cyan-500/5">
                            {t("da_calc_group_off_state")}
                          </th>
                          <th className="p-2 text-[14px] font-semibold tracking-wide text-text-secondary text-center border-l border-border">
                            {t("da_calc_group_ratio")}
                          </th>
                        </>) : null}
                      <th colSpan={2} className="p-2 text-[14px] font-semibold tracking-wide text-text-secondary text-center border-l border-border bg-amber-500/5">
                        {t("da_calc_group_derivative")}
                      </th>
                      {transferMetricsApplicable ? (<>
                          <th colSpan={2} className="p-2 text-[14px] font-semibold tracking-wide text-text-secondary text-center border-l border-border bg-rose-500/5">
                            {t("da_calc_group_ss")}
                          </th>
                          <th
                            className="p-2 text-[14px] font-semibold tracking-wide text-text-secondary text-center border-l border-border"
                            title={t("da_calc_group_jon_hint")}
                          >
                            {t("da_calc_group_jon")}
                          </th>
                        </>) : null}
                    </tr>
                    <tr className="border-b border-border">
                      {transferMetricsApplicable ? (<>
                          <th className="p-2 text-[14px] font-semibold text-text-secondary text-center whitespace-nowrap border-l border-border bg-emerald-500/5">
                            |I|on
                          </th>
                          <th className="p-2 text-[14px] font-semibold text-text-secondary text-center whitespace-nowrap border-l border-border bg-emerald-500/5">
                            x
                          </th>
                          <th className="p-2 text-[14px] font-semibold text-text-secondary text-center whitespace-nowrap border-l border-border bg-cyan-500/5">
                            |I|off
                          </th>
                          <th className="p-2 text-[14px] font-semibold text-text-secondary text-center whitespace-nowrap border-l border-border bg-cyan-500/5">
                            x
                          </th>
                          <th className="p-2 text-[14px] font-semibold text-text-secondary text-center whitespace-nowrap border-l border-border">
                            Ion/Ioff
                          </th>
                        </>) : null}
                      <th className="p-2 text-[14px] font-semibold text-text-secondary text-center whitespace-nowrap border-l border-border bg-amber-500/5">
                        {gmUi.metricHeader}
                      </th>
                      <th className="p-2 text-[14px] font-semibold text-text-secondary text-center whitespace-nowrap border-l border-border bg-amber-500/5">
                        x
                      </th>
                      {transferMetricsApplicable ? (<>
                          <th className="p-2 text-[14px] font-semibold text-text-secondary text-center whitespace-nowrap border-l border-border bg-rose-500/5">
                            SS
                          </th>
                          <th className="p-2 text-[14px] font-semibold text-text-secondary text-center whitespace-nowrap border-l border-border bg-rose-500/5">
                            x
                          </th>
                          <th className="p-2 text-[14px] font-semibold text-text-secondary text-center whitespace-nowrap border-l border-border" title={t("da_calc_group_jon_hint")}>
                            Jon
                          </th>
                        </>) : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {metricsRowElements}
                  </tbody>
                </table>
              </ScrollArea>) : (<div className="flex min-w-0 flex-col gap-3">
                <div className="rounded-xl border border-border bg-bg-page/40 px-4 py-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-xs font-semibold text-text-primary">
                          {t("da_origin_export_settings_title")}
                        </div>
                        <span className="inline-flex items-center rounded-full border border-border bg-bg-surface px-2 py-0.5 text-[10px] font-medium text-text-secondary">
                          {exportModeBadgeLabel}
                        </span>
                      </div>
                      <div className="text-[11px] text-text-secondary leading-5">
                        {exportSelectionSummary}
                      </div>
                      <div className="text-[11px] text-text-secondary leading-5">
                        {originExportModeHint}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-text-secondary whitespace-nowrap">
                        {t("da_origin_export_mode_label")}
                      </span>
                      <Select
                        id="device-analysis-origin-export-mode-select"
                        size="md"
                        value={resolvedOriginExportMode}
                        onChange={(next: any) => handleOriginExportModeChange(next === "workbookSheets"
                            ? "workbookSheets"
                            : next === "separate"
                                ? "separate"
                                : "merged")}
                        options={[
                        {
                            value: "merged",
                            label: t("da_origin_export_mode_merged"),
                        },
                        {
                            value: "workbookSheets",
                            label: t("da_origin_export_mode_workbook_sheets"),
                        },
                        {
                            value: "separate",
                            label: t("da_origin_export_mode_separate"),
                        },
                    ]}
                        className="w-fit da-neutral-select"
                        stableWidth
                        data-cta="Device Analysis"
                        data-cta-position="export-pane"
                        data-cta-copy="origin export mode"
                      />
                      <span className="text-xs text-text-secondary whitespace-nowrap">
                        {t("da_origin_canvas_scope_label")}
                      </span>
                      <Select
                        id="device-analysis-origin-canvas-scope-select"
                        size="md"
                        value={originCanvasExportScope}
                        onChange={(next: any) => {
                        const normalizedScope = next === "current" ||
                            next === "filtered" ||
                            next === "selected" ||
                            next === "all"
                            ? next
                            : "filtered";
                        setOriginCanvasExportScope(normalizedScope);
                    }}
                        options={[
                        {
                            value: "all",
                            label: t("da_origin_canvas_scope_all"),
                        },
                        {
                            value: "current",
                            label: t("da_origin_canvas_scope_current"),
                        },
                        {
                            value: "filtered",
                            label: t("da_origin_canvas_scope_filtered"),
                        },
                        {
                            value: "selected",
                            label: t("da_origin_canvas_scope_selected"),
                        },
                    ]}
                        className="w-fit da-neutral-select"
                        stableWidth
                        data-cta="Device Analysis"
                        data-cta-position="export-pane"
                        data-cta-copy="origin canvas export scope"
                      />
                      <span className="text-xs text-text-secondary whitespace-nowrap">
                        {t("da_origin_curve_export_mode_label")}
                      </span>
                      <Select
                        id="device-analysis-origin-curve-export-mode-select"
                        size="md"
                        value={resolvedCurveExportMode}
                        onChange={(next: any) => {
                        setOriginCurveExportMode(next === "select" ? "select" : "all");
                    }}
                        options={[
                        {
                            value: "all",
                            label: t("da_origin_curve_export_mode_all"),
                        },
                        {
                            value: "select",
                            label: t("da_origin_curve_export_mode_select"),
                        },
                    ]}
                        className="w-fit da-neutral-select"
                        stableWidth
                        data-cta="Device Analysis"
                        data-cta-position="export-pane"
                        data-cta-copy="origin curve export mode"
                      />
                      {showFilteredCanvasKindSelect ? (<>
                          <span className="text-xs text-text-secondary whitespace-nowrap">
                            {t("da_origin_filtered_canvas_kind_label")}
                          </span>
                          <Select
                            id="device-analysis-origin-filtered-canvas-kind-select"
                            size="md"
                            value={originFilteredCanvasKind}
                            onChange={(next: any) => {
                            setOriginFilteredCanvasKind(next === "transfer" ? "transfer" : "output");
                        }}
                            options={[
                            {
                                value: "transfer",
                                label: t("da_origin_filtered_canvas_kind_transfer"),
                            },
                            {
                                value: "output",
                                label: t("da_origin_filtered_canvas_kind_output"),
                            },
                        ]}
                            className="w-fit da-neutral-select"
                            stableWidth
                            data-cta="Device Analysis"
                            data-cta-position="export-pane"
                            data-cta-copy="origin filtered canvas kind"
                          />
                        </>) : null}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0 text-[11px] text-text-secondary leading-5">
                      {resolvedOriginExportMode === "merged"
                        ? t("da_origin_export_summary_merged", {
                            curves: selectedOriginSeriesTotalCount,
                            files: selectedCanvasCount,
                          })
                        : separateCanvasScopeSummary}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          void handleOpenInOrigin();
                        }}
                      >
                        {t("da_open_in_origin")}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          void handleExportOriginZip();
                        }}
                      >
                        {t("da_export_origin_zip")}
                      </Button>
                      {resolvedOriginExportMode === "merged" ? (<Button variant="ghost" size="control" onClick={clearAllOriginSeriesSelections} disabled={selectedOriginSeriesTotalCount <= 0} title={t("da_origin_collection_clear_all")} aria-label={t("da_origin_collection_clear_all")}>
                          {t("da_origin_collection_clear_all")}
                        </Button>) : null}
                    </div>
                  </div>
                </div>

                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-text-primary">
                      {exportListTitle}
                    </div>
                  </div>
                </div>

                {exportListEntries.length ? (<ScrollArea axis="y" className="min-w-0 w-full max-h-[320px]" viewportClassName="pr-2">
                    <div className="space-y-2">
                      {exportListEntries.map((entry: any) => (<div
                          key={entry.fileId}
                          className={`rounded-xl border border-border bg-bg-page/40 px-3 py-2.5 ${isExportListCanvasSelectionMode ? "cursor-pointer" : ""}`}
                          onClick={isExportListCanvasSelectionMode
                            ? () => {
                                toggleOriginCanvasSelection(entry.fileId);
                              }
                            : undefined}
                          onKeyDown={isExportListCanvasSelectionMode
                            ? (event) => {
                                if (event.key !== "Enter" && event.key !== " ") return;
                                event.preventDefault();
                                toggleOriginCanvasSelection(entry.fileId);
                              }
                            : undefined}
                          role={isExportListCanvasSelectionMode ? "button" : undefined}
                          tabIndex={isExportListCanvasSelectionMode ? 0 : undefined}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleSelectFile(entry.fileId);
                              }}
                              className="min-w-0 flex-1 text-left"
                            >
                              <div className="flex items-center gap-2 flex-wrap text-[11px] text-text-secondary">
                                <div className="truncate text-sm font-medium text-text-primary">
                                  {entry.fileName}
                                </div>
                                <span className="inline-flex items-center rounded-full bg-bg-surface px-2 py-0.5">
                                  {t("da_origin_collection_file_curves", {
                                        count: entry.selectedCount,
                                    })}
                                </span>
                                {isExportListCanvasSelectionMode && entry.isCanvasSelected ? (<span className="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-accent">
                                    {t("da_origin_export_list_selected_badge")}
                                  </span>) : null}
                              </div>
                            </button>
                            {isExportListCanvasSelectionMode ? null : resolvedOriginExportMode === "merged" ? (<Button variant="text" size="sm" className="shrink-0 px-2 text-xs text-text-secondary hover:text-text-primary" onClick={() => {
                    clearOriginSeriesSelectionForFile(entry.fileId);
                }} title={exportEntryActionLabel} aria-label={exportEntryActionLabel} hidden={resolvedCurveExportMode !== "select"}>
                                {exportEntryActionLabel}
                              </Button>) : isManualCanvasScope ? (<Button variant="text" size="sm" className="shrink-0 px-2 text-xs text-text-secondary hover:text-text-primary" onClick={() => {
                    toggleOriginCanvasSelection(entry.fileId);
                }} title={exportEntryActionLabel} aria-label={exportEntryActionLabel}>
                                {exportEntryActionLabel}
                              </Button>) : null}
                          </div>
                          <div className="mt-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={(event) => {
                    event.stopPropagation();
                    if (resolvedCurveExportMode === "all") {
                        setOriginCurveExportMode("select");
                    }
                    if (entry.allSeriesSelected) {
                        clearOriginSeriesSelectionForFile(entry.fileId);
                        return;
                    }
                    selectAllOriginSeriesForFile(entry.fileId);
                }}
                                className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-bg-surface px-2 py-1 text-[11px] leading-none text-text-secondary hover:text-text-primary"
                              >
                                <span className="clickable-ckb" data-state={entry.allSeriesSelected ? "checked" : "unchecked"}>
                                  {entry.allSeriesSelected ? <Check size={10} className="text-white" strokeWidth={4}/> : null}
                                </span>
                                <span className="whitespace-nowrap">{t("da_origin_curve_export_pick_all")}</span>
                              </button>
                              {entry.series.map((series: any) => (<button
                                  key={series.key}
                                  type="button"
                                  onClick={(event) => {
                    event.stopPropagation();
                    if (resolvedCurveExportMode === "all") {
                        setOriginCurveExportMode("select");
                    }
                    toggleOriginSeriesSelectionForFile(entry.fileId, series.key);
                }}
                                  className={`inline-flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] leading-none ${series.selected
                                        ? "border-accent/30 bg-accent/5 text-text-primary"
                                        : "border-border bg-bg-surface text-text-secondary"} ${resolvedCurveExportMode === "select"
                                        ? "cursor-pointer"
                                        : "cursor-default"}`}
                                >
                                  <span className="clickable-ckb shrink-0" data-state={series.selected ? "checked" : "unchecked"}>
                                    {series.selected ? <Check size={10} className="text-white" strokeWidth={4}/> : null}
                                  </span>
                                  <span className="truncate whitespace-nowrap">{series.label}</span>
                                </button>))}
                            </div>
                          </div>
                        </div>))}
                    </div>
                  </ScrollArea>) : (<div className="rounded-xl border border-dashed border-border bg-bg-page/40 px-4 py-6 text-sm text-text-secondary">
                    {exportListEmptyText}
                  </div>)}
              </div>)}
          </Card>) : null}
        </section>
      </ScrollArea>

      <Toast message={toast.message} isVisible={toast.isVisible} onClose={closeToast} type={toast.type} containerRef={toastContainerRef} position="absolute"/>
    </div>);
};
export default React.memo(AnalysisCharts);
