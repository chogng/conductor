import React, { startTransition, useEffect, useMemo, useRef, useState, type CSSProperties, } from "react";
import { Check } from "lucide-react";
import { computeCentralDerivative, computeSubthresholdSwing, computeSubthresholdSwingFitAuto, computeSubthresholdSwingFitInIdWindow, computeSubthresholdSwingFitInRange, classifySsFit, computeLegendDerivativeSeries, formatNumber, } from "../lib/analysisMath";
import { apiService } from "../services/apiService";
import Select from "../../../../components/ui/Select";
import Button from "../../../../components/ui/Button";
import Card from "../../../../components/ui/Card";
import ScrollArea from "../../../../components/ui/ScrollArea";
import Toast from "../../../../components/ui/Toast";
import { useLanguage } from "../../../../hooks/useLanguage";
import { COLORS } from "../lib/chartColors";
import { DEFAULT_ORIGIN_PLOT_OPTIONS } from "../lib/originPlotOptions";
import type { ToastState, ToastType } from "../../shared/lib/sharedTypes";
import { useAnalysisFileCache } from "../useAnalysisFileCache";
import { useContainerSizeReady } from "../useContainerSizeReady";
import { useOriginCanvasExport } from "../useOriginCanvasExport";
import { useResidentMainPlot } from "../useResidentMainPlot";
import OverviewGrid from "./OverviewGrid";
import CalculatedParametersRow from "./CalculatedParametersRow";
import { buildLogTicks, buildNiceTicks, buildOriginAutoTicks, buildPoints, buildStepTicks, computeLabelInterval, computeMinMax, downsamplePointsForDisplay, inferTickDigitsFromTicks, normalizeFloat, normalizeVarToken, padLinearDomain, padLogDomain, parseOptionalNumber, preserveScrollPosition, varTokenToSymbol, } from "../lib/analysisChartsUtils";
import { getDeviceAnalysisYUnitMeta, normalizeDeviceAnalysisYUnit, } from "../lib/deviceAnalysisUnits";
import MainPlotChart from "./MainPlotChart";
import SsDiagnosticsChart from "./SsDiagnosticsChart";
import SsSummaryStrip from "./SsSummaryStrip";
type SsManualDraft = {
    fileId: any;
    seriesId: any;
    x1: number;
    x2: number;
};
type SsRange = {
    x1: number;
    x2: number;
};
type SsDragMode = "new" | "left" | "right" | "move";
type SsDragState = {
    active: boolean;
    mode: SsDragMode;
    fileId: any;
    seriesId: any;
    startX: number;
    startRange: SsRange | null;
    draftRange: SsRange | null;
};
type IvGmPlotType = "iv" | "gm";
const MAX_RENDER_SERIES_POINTS = 600;
const MIN_RENDER_SERIES_POINTS = 120;
const DEFAULT_RENDER_POINT_BUDGET = 12000;
const GM_RENDER_POINT_BUDGET = 9000;
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
type FormatOriginTranslateFn = (key: string, params?: Record<string, unknown>) => string;
type OriginCsvBridge = {
    runOriginCsv: (payload: {
        csv: {
            name: string;
            text: string;
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
            axis?: {
                commands?: string[];
            };
        };
    }) => Promise<unknown>;
};
const AnalysisCharts = ({ processedData, processingStatus, activeFileId: controlledActiveFileId = undefined, onActiveFileIdChange = undefined, showFileSelect = true, ssMethod = "auto", setSsMethod = () => { }, ssDiagnosticsEnabled = true, setSsDiagnosticsEnabled = () => { }, ssShowFitLine = true, setSsShowFitLine = () => { }, ssIdWindow = { low: "1e-11", high: "1e-9" }, setSsIdWindow = () => { }, ssManualRanges = {}, setSsManualRanges = () => { }, originOpenPlotOptions = DEFAULT_ORIGIN_PLOT_OPTIONS, }: any) => {
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
    const [plotType, setPlotType] = useState("iv"); // 'iv' | 'gm' | 'ss' | 'j'
    const [focusedSeriesId, setFocusedSeriesId] = useState(null);
    const [yUnit, setYUnit] = useState("A"); // 'A' | 'uA' | 'nA'
    const userChangedYUnitRef = useRef(false);
    const userChangedYScaleRef = useRef(false);
    const [gmMode, setGmMode] = useState("x"); // 'x' | 'legend'
    const [areaInput, setAreaInput] = useState("");
    const [showAxisControls, setShowAxisControls] = useState(false);
    const [ssManualDraft, setSsManualDraft] = useState<SsManualDraft | null>(null);
    const ssDragStateRef = useRef<SsDragState | null>(null);
    const ssDragCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const ssKeyStateRef = useRef({ shift: false, alt: false });
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
                const normalizedSettings = settings as { yScale?: string; yUnit?: string } | null | undefined;
                const unit = normalizeDeviceAnalysisYUnit(normalizedSettings?.yUnit, "");
                const yScale = normalizedSettings?.yScale;
                if (cancelled)
                    return;
                if (!userChangedYUnitRef.current && unit) {
                    setYUnit(unit);
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
    useEffect(() => {
        const updateKeys = (e: any) => {
            ssKeyStateRef.current = {
                shift: Boolean(e?.shiftKey),
                alt: Boolean(e?.altKey),
            };
        };
        const cancelActiveDrag = (e: any) => {
            const drag = ssDragStateRef.current;
            if (!drag?.active)
                return;
            e?.preventDefault?.();
            if (ssDragCommitTimerRef.current) {
                clearTimeout(ssDragCommitTimerRef.current);
                ssDragCommitTimerRef.current = null;
            }
            ssDragStateRef.current = null;
            setSsManualDraft(null);
            const fileId = drag?.fileId ?? null;
            const seriesId = drag?.seriesId ?? null;
            const startRange = drag?.startRange ?? null;
            if (!fileId || !seriesId)
                return;
            const x1 = Number(startRange?.x1);
            const x2 = Number(startRange?.x2);
            if (Number.isFinite(x1) && Number.isFinite(x2)) {
                setSsManualRanges((prev: any) => {
                    const prevFile = prev?.[fileId] ?? {};
                    return {
                        ...(prev || {}),
                        [fileId]: {
                            ...prevFile,
                            [seriesId]: { x1, x2 },
                        },
                    };
                });
                return;
            }
            // No prior range: revert to "unset" (remove key) if a draft already committed.
            setSsManualRanges((prev: any) => {
                const prevFile = prev?.[fileId] ?? {};
                if (!Object.prototype.hasOwnProperty.call(prevFile, seriesId))
                    return prev;
                const { [seriesId]: _omit, ...restFile } = prevFile;
                const next = { ...(prev || {}) };
                if (Object.keys(restFile).length === 0) {
                    const { [fileId]: _omitFile, ...rest } = next;
                    return rest;
                }
                next[fileId] = restFile;
                return next;
            });
        };
        const onKeyDown = (e: any) => {
            updateKeys(e);
            if (e?.key === "Escape")
                cancelActiveDrag(e);
        };
        const onKeyUp = (e: any) => updateKeys(e);
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
        };
    }, [setSsManualRanges]);
    const currentUnitMeta = useMemo(() => {
        const unit = String(yUnit || "A");
        if (unit === "uA")
            return { value: "uA", label: "µA", factor: 1e6 };
        if (unit === "nA")
            return { value: "nA", label: "nA", factor: 1e9 };
        return { value: "A", label: "A", factor: 1 };
    }, [yUnit]);
    const effectiveActiveFileId = useMemo(() => {
        if (!processedData?.length)
            return null;
        if (activeFileId && processedData.some((f: any) => f.fileId === activeFileId)) {
            return activeFileId;
        }
        return processedData[0].fileId;
    }, [activeFileId, processedData]);
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
        clearOriginCanvasSelection,
        selectedOriginCanvasKeySet,
        selectedOriginSeriesKeySet,
        toggleOriginCanvasSelection,
        toggleOriginSeriesSelection,
        selectAllOriginCanvases,
    } = useOriginCanvasExport({
        activeFile,
        axisYScale: axis?.yScale,
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
    });
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
    const ssHeuristicApplicable = useMemo(() => {
        if (activeFile?.supportsSs === true)
            return true;
        if (activeFile?.supportsSs === false)
            return false;
        const xAxisRole = String(activeFile?.xAxisRole || "").toLowerCase();
        if (xAxisRole)
            return xAxisRole === "vg";
        const curveType = String(activeFile?.curveType || "").toLowerCase();
        if (curveType)
            return curveType.includes("vg") || curveType.includes("transfer");
        const label = String(activeFile?.xLabel || "").toLowerCase();
        return label.includes("vg");
    }, [activeFile?.curveType, activeFile?.supportsSs, activeFile?.xAxisRole, activeFile?.xLabel]);
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
        const cache = getFileCache(activeFile.fileId);
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
    const gmBySeriesId = useMemo(() => {
        if (!activeFile?.fileId || !activeFile?.series?.length)
            return new Map();
        const cache = getFileCache(activeFile.fileId);
        if (!cache)
            return new Map();
        if (gmMode === "x") {
            const map = cache.gmByMode.x;
            for (const series of activeFile.series) {
                if (map.has(series.id))
                    continue;
                const points = pointsBySeriesId.get(series.id) ?? [];
                map.set(series.id, computeCentralDerivative(points));
            }
            return map;
        }
        // gmMode === "legend"
        const map = cache.gmByMode.legend;
        if (cache.gmLegendComputed)
            return map;
        cache.gmLegendComputed = true;
        const legendMode = activeFile?.legend?.mode ?? null;
        if (legendMode !== "yCol" && legendMode !== "group")
            return map;
        const buckets = new Map();
        for (const series of activeFile.series) {
            const param = series?.legendValue;
            if (typeof param !== "number" || !Number.isFinite(param))
                continue;
            const xArr = activeFile?.xGroups?.[series.groupIndex];
            const yArr = series?.y;
            if (!xArr || !yArr)
                continue;
            const bucketKey = legendMode === "yCol" ? `g:${series.groupIndex}` : `y:${series.yCol}`;
            const list = buckets.get(bucketKey) ?? [];
            list.push({ id: series.id, x: xArr, y: yArr, param });
            buckets.set(bucketKey, list);
        }
        for (const list of buckets.values()) {
            const derived = computeLegendDerivativeSeries(list);
            for (const [id, data] of derived.entries()) {
                map.set(id, data);
            }
        }
        return map;
    }, [activeFile, getFileCache, gmMode, pointsBySeriesId]);
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
    const analysisBySeriesId = useMemo(() => {
        if (!activeFile?.fileId || !activeFile?.series?.length)
            return new Map();
        const map = new Map();
        const cache = getFileCache(activeFile.fileId);
        const ssDiagnosticsCache = cache?.ssDiagnosticsBySeriesId ?? new Map();
        const ssAutoCache = cache?.ssAutoBySeriesId ?? new Map();
        const baseMetricsCache = cache?.baseMetricsBySeriesId ?? new Map();
        const gmModeKey = gmMode === "legend" ? "legend" : "x";
        const gmMetricsCache = cache?.gmMetricsByMode?.[gmModeKey] ?? new Map();
        const manualFitCache = cache?.ssManualFitBySeriesId ?? new Map();
        const manualBySeries = activeFile?.fileId && ssManualRanges?.[activeFile.fileId]
            ? ssManualRanges[activeFile.fileId]
            : {};
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
        const areaKey = area && Number.isFinite(area) && area > 0
            ? String(normalizeFloat(area))
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
                const areaValue = typeof area === "number" && Number.isFinite(area) && area > 0 ? area : null;
                if (areaValue === null)
                    return null;
                const existing = jCacheBySeriesId.get(series.id) ?? null;
                if (existing)
                    return existing;
                const arr = points.map((p: any) => ({
                    x: p?.x ?? null,
                    y: typeof p?.y === "number" && Number.isFinite(p.y)
                        ? Math.abs(p.y) / areaValue
                        : null,
                    yPositive: typeof p?.y === "number" && Number.isFinite(p.y) && p.y !== 0
                        ? Math.abs(p.y) / areaValue
                        : null,
                    yAbsPositive: typeof p?.y === "number" && Number.isFinite(p.y) && p.y !== 0
                        ? Math.abs(p.y) / areaValue
                        : null,
                }));
                jCacheBySeriesId.set(series.id, arr);
                return arr;
            })();
            let base = baseMetricsCache.get(series.id) ?? null;
            if (!base) {
                // Scalar metrics (computed from |I| to support p/n-type)
                let ion = -Infinity;
                let xAtIon = null;
                let ioff = Infinity;
                let xAtIoff = null;
                for (const p of points) {
                    const x = p?.x;
                    const y = p?.y;
                    if (typeof x !== "number" || !Number.isFinite(x))
                        continue;
                    if (typeof y !== "number" || !Number.isFinite(y))
                        continue;
                    const absI = Math.abs(y);
                    if (absI > ion) {
                        ion = absI;
                        xAtIon = x;
                    }
                    if (absI > 0 && absI < ioff) {
                        ioff = absI;
                        xAtIoff = x;
                    }
                }
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
                base = {
                    ion: Number.isFinite(ion) ? ion : null,
                    xAtIon,
                    ioff: Number.isFinite(ioff) ? ioff : null,
                    xAtIoff,
                    legacySsMin: Number.isFinite(legacySsMin) ? legacySsMin : null,
                    legacyXAtSsMin,
                };
                if (cache)
                    baseMetricsCache.set(series.id, base);
            }
            const ionFinite = base.ion;
            const ioffFinite = base.ioff;
            const xAtIon = base.xAtIon ?? null;
            const xAtIoff = base.xAtIoff ?? null;
            const legacySsMinFinite = base.legacySsMin;
            const legacyXAtSsMin = base.legacyXAtSsMin ?? null;
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
                // Auto (strict) by default.
                const cls = classifySsFit("auto", strictFit);
                return {
                    method: "auto",
                    confidence: cls.ss_confidence,
                    reason: cls.ss_reason,
                    fit: strictFit,
                    xAt: strictFit?.x1 != null && strictFit?.x2 != null
                        ? (strictFit.x1 + strictFit.x2) * 0.5
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
                    legacyXAtSsMin,
                    jon: area && ionFinite !== null ? ionFinite / area : null,
                    joff: area && ioffFinite !== null ? ioffFinite / area : null,
                },
            });
        }
        return map;
    }, [
        activeFile,
        area,
        gmBySeriesId,
        gmMode,
        getFileCache,
        pointsBySeriesId,
        ssIdWindow?.high,
        ssIdWindow?.low,
        ssManualRanges,
        ssMethod,
    ]);
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
    const ssApplicable = ssHeuristicApplicable || ssComputedApplicable;
    const effectivePlotType = useMemo(() => {
        if (plotType === "j" && !area)
            return "iv";
        if (plotType === "ss" && !ssApplicable)
            return "iv";
        return plotType;
    }, [area, plotType, ssApplicable]);
    const { residentMainPlotTypes } = useResidentMainPlot({
        effectivePlotType,
    });
    useEffect(() => {
        const shouldEnableDrag = effectivePlotType === "ss" && ssMethod === "manual";
        const activeFileIdNow = activeFile?.fileId ?? null;
        const focusedSeriesIdNow = focusedSeriesId ?? null;
        const drag = ssDragStateRef.current;
        const dragActive = Boolean(drag?.active);
        const dragIsForCurrent = drag &&
            drag.fileId === activeFileIdNow &&
            drag.seriesId === focusedSeriesIdNow;
        if (!shouldEnableDrag || (dragActive && !dragIsForCurrent)) {
            if (ssDragCommitTimerRef.current) {
                clearTimeout(ssDragCommitTimerRef.current);
                ssDragCommitTimerRef.current = null;
            }
            ssDragStateRef.current = null;
            if (ssManualDraft)
                setSsManualDraft(null);
        }
    }, [activeFile?.fileId, effectivePlotType, focusedSeriesId, ssManualDraft, ssMethod]);
    const plotYFactor = useMemo(() => resolvedYUnitMeta.factor, [resolvedYUnitMeta.factor]);
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
        if (effectivePlotType === "iv")
            return;
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
        const analysis = analysisBySeriesId.get(focusedSeriesId);
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
        analysisBySeriesId,
        effectivePlotType,
        focusedSeriesId,
        setSsManualRanges,
        ssManualRanges,
        ssMethod,
    ]);
    const plotSeriesByType = useMemo(() => {
        if (!activeFile?.series?.length) {
            return { iv: [], gm: [], ss: [], j: [] };
        }
        const base = activeFile.series.map((series: any) => ({
            ...series,
            data: pointsBySeriesId.get(series.id) ?? [],
        }));
        return {
            iv: base,
            ss: base,
            gm: activeFile.series.map((series: any) => ({
                ...series,
                data: analysisBySeriesId.get(series.id)?.gm ?? [],
            })),
            j: activeFile.series.map((series: any) => ({
                ...series,
                data: analysisBySeriesId.get(series.id)?.j ?? [],
            })),
        };
    }, [activeFile, analysisBySeriesId, pointsBySeriesId]);
    const focusedAnalysis = useMemo(() => {
        if (!focusedSeriesId)
            return null;
        return analysisBySeriesId.get(focusedSeriesId) ?? null;
    }, [analysisBySeriesId, focusedSeriesId]);
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
            const draft = ssManualDraft &&
                ssManualDraft.fileId === fileId &&
                ssManualDraft.seriesId === focusedSeriesId
                ? ssManualDraft
                : null;
            const draftX1 = draft?.x1;
            const draftX2 = draft?.x2;
            const x1 = Number.isFinite(draftX1)
                ? draftX1
                : Number.isFinite(fit?.x1)
                    ? fit.x1
                    : Number(manualStored?.x1);
            const x2 = Number.isFinite(draftX2)
                ? draftX2
                : Number.isFinite(fit?.x2)
                    ? fit.x2
                    : Number(manualStored?.x2);
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
        ssManualDraft,
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
        const cache = fileId ? getFileCache(fileId) : null;
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
        const min = minUser ?? auto[0];
        const max = maxUser ?? auto[1];
        return padLinearDomain(min, max);
    }, [autoMinMax.maxX, autoMinMax.minX, axis?.xMax, axis?.xMin]);
    const yDomain = useMemo(() => {
        const auto = autoMinMax.minY === null || autoMinMax.maxY === null
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
    const ssDiagnosticsYDomain = useMemo(() => {
        const minY = ssDiagnosticsMinMax?.minY ?? null;
        const maxY = ssDiagnosticsMinMax?.maxY ?? null;
        if (minY === null || maxY === null)
            return [0, 1];
        return padLinearDomain(minY, maxY);
    }, [ssDiagnosticsMinMax?.maxY, ssDiagnosticsMinMax?.minY]);
    const ssDiagnosticsYTicks = useMemo(() => {
        return buildOriginAutoTicks(ssDiagnosticsYDomain[0], ssDiagnosticsYDomain[1], 6);
    }, [ssDiagnosticsYDomain]);
    const xTicks = useMemo(() => {
        const mode = String(axis?.xTicks ?? "auto");
        if (mode === "auto") {
            const tightTicks = buildNiceTicks(xDomain[0], xDomain[1], 6, {
                preferTightRange: true,
            });
            return tightTicks ?? buildOriginAutoTicks(xDomain[0], xDomain[1], 6);
        }
        if (mode === "step") {
            const step = parseOptionalNumber(axis?.xStep);
            return step ? buildStepTicks(xDomain[0], xDomain[1], step) : null;
        }
        const count = Math.max(2, Math.floor(Number(axis?.xTickCount) || 6));
        return buildNiceTicks(xDomain[0], xDomain[1], count, {
            preferTightRange: false,
        });
    }, [axis?.xStep, axis?.xTickCount, axis?.xTicks, xDomain]);
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
    const xTickDigits = useMemo(() => inferTickDigitsFromTicks(xTicks), [xTicks]);
    // Keep tooltip x precision higher than axis labels by default; allow manual override in settings.
    const xTooltipDigitsAuto = useMemo(() => Math.min(8, Math.max(2, xTickDigits + 2)), [xTickDigits]);
    const xTooltipDigits = useMemo(() => {
        const manualDigits = parseOptionalNumber(axis?.xTooltipDigits);
        if (manualDigits === null)
            return xTooltipDigitsAuto;
        return Math.max(0, Math.min(20, Math.round(manualDigits)));
    }, [axis?.xTooltipDigits, xTooltipDigitsAuto]);
    const xLabelInterval = useMemo(() => computeLabelInterval(xTicks, 7), [xTicks]);
    const ivGmActivePlotType = effectivePlotType === "iv" || effectivePlotType === "gm"
        ? (effectivePlotType as IvGmPlotType)
        : null;
    const ivGmStandbyPlotType = useMemo(() => {
        if (!ivGmActivePlotType)
            return null;
        const standby: IvGmPlotType = ivGmActivePlotType === "iv" ? "gm" : "iv";
        return residentMainPlotTypes.includes(standby) ? standby : null;
    }, [ivGmActivePlotType, residentMainPlotTypes]);
    const standbyMainChartProps = useMemo(() => {
        if (!ivGmStandbyPlotType)
            return null;
        if (!activeFile?.series?.length)
            return null;
        const byType = plotSeriesByType ?? { iv: [], gm: [], ss: [], j: [] };
        const standbyDisplaySeries = ivGmStandbyPlotType === "gm" ? byType.gm ?? [] : byType.iv ?? [];
        const renderPointBudget = ivGmStandbyPlotType === "gm"
            ? GM_RENDER_POINT_BUDGET
            : DEFAULT_RENDER_POINT_BUDGET;
        const seriesCount = Math.max(1, standbyDisplaySeries.length);
        const renderMaxPointsPerSeries = Math.max(MIN_RENDER_SERIES_POINTS, Math.min(MAX_RENDER_SERIES_POINTS, Math.floor(renderPointBudget / seriesCount)));
        const cacheKey = standbyDisplaySeries as unknown as object;
        let cacheBucket = renderSeriesCacheRef.current.get(cacheKey);
        if (!cacheBucket) {
            cacheBucket = new Map<number, any[]>();
            renderSeriesCacheRef.current.set(cacheKey, cacheBucket);
        }
        let standbyRenderSeries = cacheBucket.get(renderMaxPointsPerSeries);
        if (!standbyRenderSeries) {
            standbyRenderSeries = standbyDisplaySeries.map((series: any) => {
                const fullData = Array.isArray(series?.data) ? series.data : [];
                const nextData = downsamplePointsForDisplay(fullData, renderMaxPointsPerSeries);
                if (nextData === fullData)
                    return series;
                return {
                    ...series,
                    data: nextData,
                };
            });
            cacheBucket.set(renderMaxPointsPerSeries, standbyRenderSeries ?? []);
        }
        const fileId = activeFile?.fileId ?? null;
        const cache = fileId ? getFileCache(fileId) : null;
        const areaKeyForMinMax = area && Number.isFinite(area) && area > 0 ? String(normalizeFloat(area)) : "";
        const minMaxKey = `${ivGmStandbyPlotType}::${gmMode}::${plotYKey}::${areaKeyForMinMax}`;
        let standbyMinMax = cache?.minMaxByKey?.has(minMaxKey)
            ? cache.minMaxByKey.get(minMaxKey)
            : null;
        if (!standbyMinMax) {
            standbyMinMax = computeMinMax(standbyDisplaySeries, { yKey: plotYKey });
            if (cache?.minMaxByKey)
                cache.minMaxByKey.set(minMaxKey, standbyMinMax);
        }
        const autoX = !standbyMinMax || standbyMinMax.minX === null || standbyMinMax.maxX === null
            ? [0, 1]
            : padLinearDomain(standbyMinMax.minX, standbyMinMax.maxX);
        const minUser = parseOptionalNumber(axis?.xMin);
        const maxUser = parseOptionalNumber(axis?.xMax);
        const standbyXDomain = padLinearDomain(minUser ?? autoX[0], maxUser ?? autoX[1]);
        const tickMode = String(axis?.xTicks ?? "auto");
        const standbyXTicks = tickMode === "auto"
            ? buildNiceTicks(standbyXDomain[0], standbyXDomain[1], 6, {
                preferTightRange: true,
            }) ?? buildOriginAutoTicks(standbyXDomain[0], standbyXDomain[1], 6)
            : tickMode === "step"
                ? (() => {
                    const step = parseOptionalNumber(axis?.xStep);
                    return step ? buildStepTicks(standbyXDomain[0], standbyXDomain[1], step) : null;
                })()
                : buildNiceTicks(standbyXDomain[0], standbyXDomain[1], Math.max(2, Math.floor(Number(axis?.xTickCount) || 6)), {
                    preferTightRange: false,
                });
        const standbyXTickDigits = inferTickDigitsFromTicks(standbyXTicks);
        const standbyXTooltipDigitsAuto = Math.min(8, Math.max(2, standbyXTickDigits + 2));
        const manualDigits = parseOptionalNumber(axis?.xTooltipDigits);
        const standbyXTooltipDigits = manualDigits === null
            ? standbyXTooltipDigitsAuto
            : Math.max(0, Math.min(20, Math.round(manualDigits)));
        return {
            plotType: ivGmStandbyPlotType,
            seriesList: standbyRenderSeries ?? [],
            xDomain: standbyXDomain,
            xTicks: standbyXTicks,
            xTickDigits: standbyXTickDigits,
            xTooltipDigits: standbyXTooltipDigits,
            xLabelInterval: computeLabelInterval(standbyXTicks, 7),
            plotYUnitLabel: ivGmStandbyPlotType === "gm"
                ? toConductanceUnitLabel(resolvedYUnitMeta.label, gmUi.denomUnit)
                : resolvedYUnitMeta.label,
        };
    }, [
        activeFile?.fileId,
        activeFile?.series?.length,
        area,
        axis?.xMax,
        axis?.xMin,
        axis?.xStep,
        axis?.xTickCount,
        axis?.xTicks,
        axis?.xTooltipDigits,
        resolvedYUnitMeta.label,
        getFileCache,
        gmMode,
        gmUi.denomUnit,
        ivGmStandbyPlotType,
        plotSeriesByType,
        plotYKey,
    ]);
    const metricsRows = useMemo(() => {
        if (!activeFile?.series?.length)
            return [];
        return activeFile.series.map((series: any) => {
            const analysis = analysisBySeriesId.get(series.id);
            return {
                id: series.id,
                name: series.name,
                group: Number(series.groupIndex ?? 0) + 1,
                yCol: series.yCol,
                ...analysis?.metrics,
            };
        });
    }, [activeFile, analysisBySeriesId]);
    const snapXToSeries = React.useCallback((x: any, seriesId: any, { disableSnap = false }: any = {}) => {
        const raw = Number(x);
        if (!Number.isFinite(raw))
            return null;
        if (disableSnap)
            return raw;
        const pts = pointsBySeriesId.get(seriesId) ?? [];
        let best = null;
        let bestDist = Infinity;
        for (const p of pts) {
            const px = p?.x;
            if (!Number.isFinite(px))
                continue;
            const d = Math.abs(px - raw);
            if (d < bestDist) {
                bestDist = d;
                best = px;
            }
        }
        return best !== null ? best : raw;
    }, [pointsBySeriesId]);
    const commitManualRange = React.useCallback((fileId: any, seriesId: any, range: any, { immediate = false }: any = {}) => {
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
        const doCommit = () => {
            setSsManualRanges((prev: any) => {
                const prevFile = prev?.[fileId] ?? {};
                return {
                    ...(prev || {}),
                    [fileId]: {
                        ...prevFile,
                        [seriesId]: { x1: lo, x2: hi },
                    },
                };
            });
        };
        if (ssDragCommitTimerRef.current) {
            clearTimeout(ssDragCommitTimerRef.current);
            ssDragCommitTimerRef.current = null;
        }
        if (immediate) {
            doCommit();
            return;
        }
        ssDragCommitTimerRef.current = setTimeout(doCommit, 120);
    }, [setSsManualRanges]);
    const handleSsMouseDown = React.useCallback((e: any) => {
        if (ssMethod !== "manual")
            return;
        const fileId = activeFile?.fileId ?? null;
        const seriesId = focusedSeriesId ?? null;
        if (!fileId || !seriesId)
            return;
        const rawX = Number(e?.activeLabel);
        if (!Number.isFinite(rawX))
            return;
        const disableSnap = Boolean(ssKeyStateRef.current?.alt);
        const x = snapXToSeries(rawX, seriesId, { disableSnap });
        if (!Number.isFinite(x))
            return;
        const stored = ssManualRanges?.[fileId]?.[seriesId] ?? null;
        const draft = ssManualDraft &&
            ssManualDraft.fileId === fileId &&
            ssManualDraft.seriesId === seriesId
            ? ssManualDraft
            : null;
        const current = draft ?? stored;
        const hasCurrent = Number.isFinite(Number(current?.x1)) && Number.isFinite(Number(current?.x2));
        const shift = Boolean(ssKeyStateRef.current?.shift);
        let mode: SsDragMode = "new"; // new | left | right | move
        let startRange = hasCurrent
            ? { x1: Number(current.x1), x2: Number(current.x2) }
            : null;
        if (!shift && startRange) {
            const x1 = startRange.x1;
            const x2 = startRange.x2;
            const lo = Math.min(x1, x2);
            const hi = Math.max(x1, x2);
            const span = Math.abs((xDomain?.[1] ?? 1) - (xDomain?.[0] ?? 0));
            const tol = Math.max(1e-12, span * 0.015);
            if (Math.abs(x - lo) <= tol)
                mode = "left";
            else if (Math.abs(x - hi) <= tol)
                mode = "right";
            else if (x >= lo && x <= hi)
                mode = "move";
        }
        const initial = mode === "new" || !startRange ? { x1: x, x2: x } : { ...startRange };
        ssDragStateRef.current = {
            active: true,
            mode,
            fileId,
            seriesId,
            startX: x,
            startRange,
            draftRange: initial,
        };
        setSsManualDraft({ fileId, seriesId, x1: initial.x1, x2: initial.x2 });
    }, [
        activeFile?.fileId,
        focusedSeriesId,
        snapXToSeries,
        ssManualDraft,
        ssManualRanges,
        ssMethod,
        xDomain,
    ]);
    const handleSsMouseMove = React.useCallback((e: any) => {
        const drag = ssDragStateRef.current;
        if (!drag?.active)
            return;
        if (drag.mode !== "new" && drag.mode !== "left" && drag.mode !== "right" && drag.mode !== "move") {
            return;
        }
        const rawX = Number(e?.activeLabel);
        if (!Number.isFinite(rawX))
            return;
        const disableSnap = Boolean(ssKeyStateRef.current?.alt);
        const x = snapXToSeries(rawX, drag.seriesId, { disableSnap });
        if (!Number.isFinite(x))
            return;
        let next = null;
        if (drag.mode === "new") {
            next = { x1: drag.startX, x2: x };
        }
        else if (drag.mode === "left") {
            next = { x1: x, x2: drag.startRange?.x2 ?? x };
        }
        else if (drag.mode === "right") {
            next = { x1: drag.startRange?.x1 ?? x, x2: x };
        }
        else if (drag.mode === "move") {
            const base = drag.startRange;
            if (!base)
                return;
            const dx = x - drag.startX;
            let x1 = base.x1 + dx;
            let x2 = base.x2 + dx;
            const domLo = Number(xDomain?.[0]);
            const domHi = Number(xDomain?.[1]);
            if (Number.isFinite(domLo) && Number.isFinite(domHi)) {
                const lo = Math.min(x1, x2);
                const hi = Math.max(x1, x2);
                if (lo < domLo) {
                    const d = domLo - lo;
                    x1 += d;
                    x2 += d;
                }
                if (hi > domHi) {
                    const d = domHi - hi;
                    x1 += d;
                    x2 += d;
                }
            }
            next = { x1, x2 };
        }
        if (!next)
            return;
        drag.draftRange = next;
        ssDragStateRef.current = drag;
        setSsManualDraft({
            fileId: drag.fileId,
            seriesId: drag.seriesId,
            x1: next.x1,
            x2: next.x2,
        });
        commitManualRange(drag.fileId, drag.seriesId, next, { immediate: false });
    }, [commitManualRange, snapXToSeries, xDomain]);
    const handleSsMouseUp = React.useCallback(() => {
        const drag = ssDragStateRef.current;
        if (!drag?.active)
            return;
        const finalRange = drag.draftRange ?? drag.startRange;
        if (finalRange) {
            commitManualRange(drag.fileId, drag.seriesId, finalRange, { immediate: true });
        }
        ssDragStateRef.current = null;
        setSsManualDraft(null);
    }, [commitManualRange]);
    const handleSelectFile = React.useCallback((fileId: any) => {
        if (!fileId)
            return;
        preserveScrollPosition(() => startTransition(() => setActiveFileId(fileId)));
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
    const metricsRowElements = useMemo(() => metricsRows.map((row: any) => (<CalculatedParametersRow key={row.id} row={row} buildSsTooltip={buildSsTooltip}/>)), [buildSsTooltip, metricsRows]);
    if (!processedData || processedData.length === 0)
        return null;
    return (<div className="h-full min-h-0 grid grid-cols-1 md:grid-rows-1 md:grid-cols-[var(--analysis-sidebar-width)_minmax(0,1fr)] gap-1 md:gap-1" ref={toastContainerRef} style={{
            "--analysis-sidebar-width": "clamp(240px, var(--sidebar-width), 420px)",
        } as CSSProperties}>
      <aside
        id="device-analysis-overview-sidebar"
        className="md:min-h-0 flex flex-col h-full"
      >
        <OverviewGrid processedData={processedData} processingStatus={processingStatus} activeFileId={effectiveActiveFileId} onSelectFile={handleSelectFile} selectedOriginCanvasKeySet={selectedOriginCanvasKeySet} onToggleOriginCanvasSelection={toggleOriginCanvasSelection} onSelectAllOriginCanvases={selectAllOriginCanvases} onClearOriginCanvasSelection={clearOriginCanvasSelection} yUnitFactor={resolvedYUnitMeta.factor} yUnitLabel={resolvedYUnitMeta.label} yScale={overviewYScaleType}/>
      </aside>

      <ScrollArea className="md:min-h-0" axis="y" viewportClassName="flex flex-col min-h-full">
        <section className="flex flex-col flex-1 gap-1 pr-1" aria-label="Device Analysis results">
          <section aria-label="Device Analysis chart">
        <Card variant="panel" className="flex flex-col">

          <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
            <div className="flex items-center gap-4 flex-wrap">
              <div id="device-analysis-plot-type-toggle" className="tab_menu">
                <button id="device-analysis-plot-iv-btn" type="button" onClick={() => setPlotType("iv")} className={`tab_btn tab_btn--control ${effectivePlotType === "iv"
            ? "tab_btn--active"
            : "tab_btn--inactive"}`}>
                  I-V
                </button>
                <button id="device-analysis-plot-gm-btn" type="button" onClick={() => setPlotType("gm")} className={`tab_btn tab_btn--control ${effectivePlotType === "gm"
            ? "tab_btn--active"
            : "tab_btn--inactive"}`}>
                  gₘ
                </button>
                <button id="device-analysis-plot-ss-btn" type="button" onClick={() => ssApplicable && setPlotType("ss")} disabled={!ssApplicable} className={`tab_btn tab_btn--control ${effectivePlotType === "ss"
            ? "tab_btn--active"
            : "tab_btn--inactive"} ${!ssApplicable ? "opacity-50 cursor-not-allowed" : ""}`} title={!ssApplicable
            ? "SS is defined for transfer (Vg) curves. This file does not look like a Vg sweep."
            : ""}>
                  SS
                </button>
                <button id="device-analysis-plot-j-btn" type="button" onClick={() => setPlotType("j")} disabled={!area} className={`tab_btn tab_btn--control ${effectivePlotType === "j"
            ? "tab_btn--active"
            : "tab_btn--inactive"} ${!area ? "opacity-50 cursor-not-allowed" : ""}`} title={!area ? "Set a positive Area to enable J plot" : ""}>
                  J
                </button>
              </div>



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
            }} className="h-[38px] px-2 text-xs" title="Toggle SS(x) diagnostics plot">
                      Diagnostics
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

              <div ref={mainChartContainerRef} className="h-[500px] min-h-[500px] flex-shrink-0">
                {isMainChartSizeReady ? (ivGmActivePlotType ? (<div className="relative h-full w-full">
                    {standbyMainChartProps ? (<div className="absolute inset-0 opacity-0 pointer-events-none" aria-hidden="true">
                        <MainPlotChart
                          plotType={standbyMainChartProps.plotType}
                          activeFile={activeFile}
                          seriesList={standbyMainChartProps.seriesList}
                          axis={axis}
                          xDomain={standbyMainChartProps.xDomain}
                          xTicks={standbyMainChartProps.xTicks}
                          xTickDigits={standbyMainChartProps.xTickDigits}
                          xTooltipDigits={standbyMainChartProps.xTooltipDigits}
                          xLabelInterval={standbyMainChartProps.xLabelInterval}
                          yScaleMode={yScaleMode}
                          yTicksMode={axis?.yTicks}
                          plotYFactor={plotYFactor}
                          plotYUnitLabel={standbyMainChartProps.plotYUnitLabel}
                          focusedSeriesId={null}
                          focusedFitLine={null}
                          focusedSeriesColor={focusedSeriesColor}
                          focusedSsOverlay={null}
                          ssOverlayStyle={ssOverlayStyle}
                          legendWidth={0}
                          legendContent={undefined}
                        />
                      </div>) : null}
                    <div className="absolute inset-0">
                      <MainPlotChart
                        plotType={effectivePlotType}
                        activeFile={activeFile}
                        seriesList={renderPlotSeries}
                        axis={axis}
                        xDomain={xDomain}
                        xTicks={xTicks}
                        xTickDigits={xTickDigits}
                        xTooltipDigits={xTooltipDigits}
                        xLabelInterval={xLabelInterval}
                        yScaleMode={yScaleMode}
                        yTicksMode={axis?.yTicks}
                        plotYFactor={plotYFactor}
                        plotYUnitLabel={plotYUnitLabel}
                        focusedSeriesId={focusedSeriesId}
                        focusedFitLine={focusedFitLineForRender}
                        focusedSeriesColor={focusedSeriesColor}
                        focusedSsOverlay={focusedSsOverlay}
                        ssOverlayStyle={ssOverlayStyle}
                        legendWidth={220}
                        legendContent={renderOriginSelectionLegend}
                        onMouseDown={handleSsMouseDown}
                        onMouseMove={handleSsMouseMove}
                        onMouseUp={handleSsMouseUp}
                      />
                    </div>
                  </div>) : (<MainPlotChart
                    plotType={effectivePlotType}
                    activeFile={activeFile}
                    seriesList={renderPlotSeries}
                    axis={axis}
                    xDomain={xDomain}
                    xTicks={xTicks}
                    xTickDigits={xTickDigits}
                    xTooltipDigits={xTooltipDigits}
                    xLabelInterval={xLabelInterval}
                    yScaleMode={yScaleMode}
                    yTicksMode={axis?.yTicks}
                    plotYFactor={plotYFactor}
                    plotYUnitLabel={plotYUnitLabel}
                    focusedSeriesId={focusedSeriesId}
                    focusedFitLine={focusedFitLineForRender}
                    focusedSeriesColor={focusedSeriesColor}
                    focusedSsOverlay={focusedSsOverlay}
                    ssOverlayStyle={ssOverlayStyle}
                    legendWidth={220}
                    legendContent={renderOriginSelectionLegend}
                    onMouseDown={handleSsMouseDown}
                    onMouseMove={handleSsMouseMove}
                    onMouseUp={handleSsMouseUp}
                  />)) : (<div className="h-full w-full"/>) }
              </div>

              {effectivePlotType === "ss" && focusedSsDiagnosticsForRender ? (<div className="mt-4">
                  <div className="text-xs text-text-secondary mb-2">
                    Diagnostics: SS(x)
                  </div>
                  <div ref={diagnosticsChartContainerRef} className="h-[260px] min-h-[260px] flex-shrink-0">
                    {isDiagnosticsChartSizeReady ? (<SsDiagnosticsChart data={focusedSsDiagnosticsForRender} xDomain={xDomain} xTicks={xTicks} xLabelInterval={xLabelInterval} xTickDigits={xTickDigits} xTooltipDigits={xTooltipDigits} yDomain={ssDiagnosticsYDomain} yTicks={ssDiagnosticsYTicks} overlay={focusedSsOverlay} overlayStyle={ssOverlayStyle} ssReferenceValue={ssSummary?.ss} seriesColor={focusedSeriesColor}/>) : (<div className="h-full w-full"/>)}
                  </div>
                </div>) : null}
            </div>) : (<div className="flex items-center justify-center h-[300px] text-text-secondary">
              No series data for this file.
            </div>)}
        </Card>
      </section>

          {activeFile?.series?.length ? (<Card variant="panel" className="flex flex-col flex-1">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-sm font-semibold text-text-primary">
                Calculated Parameters
              </h3>
              <div className="text-xs text-text-secondary whitespace-nowrap">
                {gmUi.summaryLabel}: max |{gmUi.metricSymbol}| · SS: fit (mV/dec) ·
                J uses |I|/Area
              </div>
            </div>

            <ScrollArea axis="x" className="w-full">
              <table className="min-w-[1080px] w-full text-sm border-collapse">
                <thead className="sticky top-0 bg-bg-surface z-10">
                  <tr className="border-b border-border">
                    <th
                      rowSpan={2}
                      className="p-2 text-[14px] font-semibold tracking-wide text-text-secondary text-center whitespace-nowrap align-middle"
                    >
                      {t("da_calc_group_series")}
                    </th>
                    <th colSpan={2} className="p-2 text-[14px] font-semibold tracking-wide text-text-secondary text-center border-l border-border bg-emerald-500/5">
                      {t("da_calc_group_on_state")}
                    </th>
                    <th colSpan={2} className="p-2 text-[14px] font-semibold tracking-wide text-text-secondary text-center border-l border-border bg-cyan-500/5">
                      {t("da_calc_group_off_state")}
                    </th>
                    <th className="p-2 text-[14px] font-semibold tracking-wide text-text-secondary text-center border-l border-border">
                      {t("da_calc_group_ratio")}
                    </th>
                    <th colSpan={2} className="p-2 text-[14px] font-semibold tracking-wide text-text-secondary text-center border-l border-border bg-amber-500/5">
                      {t("da_calc_group_derivative")}
                    </th>
                    <th colSpan={2} className="p-2 text-[14px] font-semibold tracking-wide text-text-secondary text-center border-l border-border bg-rose-500/5">
                      {t("da_calc_group_ss")}
                    </th>
                    <th
                      className="p-2 text-[14px] font-semibold tracking-wide text-text-secondary text-center border-l border-border"
                      title={t("da_calc_group_jon_hint")}
                    >
                      {t("da_calc_group_jon")}
                    </th>
                  </tr>
                  <tr className="border-b border-border">
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
                    <th className="p-2 text-[14px] font-semibold text-text-secondary text-center whitespace-nowrap border-l border-border bg-amber-500/5">
                      {gmUi.metricHeader}
                    </th>
                    <th className="p-2 text-[14px] font-semibold text-text-secondary text-center whitespace-nowrap border-l border-border bg-amber-500/5">
                      x
                    </th>
                    <th className="p-2 text-[14px] font-semibold text-text-secondary text-center whitespace-nowrap border-l border-border bg-rose-500/5">
                      SS
                    </th>
                    <th className="p-2 text-[14px] font-semibold text-text-secondary text-center whitespace-nowrap border-l border-border bg-rose-500/5">
                      x
                    </th>
                    <th className="p-2 text-[14px] font-semibold text-text-secondary text-center whitespace-nowrap border-l border-border" title={t("da_calc_group_jon_hint")}>
                      Jon
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {metricsRowElements}
                </tbody>
              </table>
            </ScrollArea>
          </Card>) : null}
        </section>
      </ScrollArea>

      <Toast message={toast.message} isVisible={toast.isVisible} onClose={closeToast} type={toast.type} containerRef={toastContainerRef} position="absolute"/>
    </div>);
};
export default React.memo(AnalysisCharts);
