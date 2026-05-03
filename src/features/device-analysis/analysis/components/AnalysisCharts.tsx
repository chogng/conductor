import React, { startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronRight, SlidersHorizontal, X } from "lucide-react";
import { computeCentralDerivative, computeSubthresholdSwing, computeSubthresholdSwingFitAuto, computeSubthresholdSwingFitInRange, classifySsFit, formatNumber, interpolateCurveAtX, resolveAutoSsSelection, splitBidirectionalCurvePoints, } from "../lib/analysisMath";
import { apiService } from "../services/apiService";
import DropdownField from "../../../../components/ui/DropdownField";
import Input from "../../../../components/ui/Input";
import ContentView from "../../../../components/ui/ContentView";
import Dropdown from "../../../../components/ui/Dropdown";
import DropdownTrigger from "../../../../components/ui/DropdownTrigger";
import Menu from "../../../../components/ui/Menu";
import MenuItem from "../../../../components/ui/MenuItem";
import Button from "../../../../components/ui/Button";
import Card from "../../../../components/ui/Card";
import InlineEditableText from "../../../../components/ui/InlineEditableText";
import ScrollArea from "../../../../components/ui/ScrollArea";
import Tabs from "../../../../components/ui/Tabs";
import Toast from "../../../../components/ui/Toast";
import { useLanguage } from "../../../../hooks/useLanguage";
import { getChartColor, resolveSeriesChartColor } from "../lib/chartColors";
import {
  DEFAULT_ORIGIN_PLOT_OPTIONS,
  normalizeOriginPlotOptions,
  type OriginPlotOptions,
} from "../lib/originPlotOptions";
import {
  DEFAULT_PLOT_AXIS_SETTINGS,
  normalizePlotAxisSettings,
  type PlotAxisSettings,
} from "../lib/plotAxisSettings";
import {
  isDeviceAnalysisOriginExportMode,
  resolveDeviceAnalysisSeriesLabel,
  type DeviceAnalysisOriginExportContentKey,
  type DeviceAnalysisOriginExportMode,
} from "../lib/originSelectionExport";
import type { ToastState, ToastType } from "../../shared/lib/sharedTypes";
import { useAnalysisFileCache } from "../useAnalysisFileCache";
import {
  useOriginCanvasExport,
  resolveOriginSeriesMatchTokens,
  type DeviceAnalysisOriginFilteredCanvasKind,
  type DeviceAnalysisOriginCanvasExportScope,
  type DeviceAnalysisOriginCurveExportMode,
} from "../useOriginCanvasExport";
import OverviewGrid from "./OverviewGrid";
import CalculatedParametersRow from "./CalculatedParametersRow";
import { SIGNED_LOG_Y_DATA_KEY, buildLogTicks, buildNiceTicks, buildOriginAutoTicks, buildOriginLogAutoTicks, buildPoints, buildStepTicks, computeLabelInterval, computeMinMax, downsamplePointsForDisplay, inferTickDigitsFromTicks, normalizeFloat, normalizeVarToken, padLinearDomain, padLogDomain, parseOptionalNumber, preserveScrollPosition, varTokenToSymbol, withSignedLogPositivePoints, } from "../lib/analysisChartsUtils";
import { computeBaseCurrentMetrics, isOutputLikeDeviceAnalysisFile, isTransferLikeDeviceAnalysisFile, } from "../lib/deviceAnalysisMetrics";
import { ANALYSIS_CACHE_VERSION, canUseCachedBaseCurrent, } from "../lib/analysisCachePolicy";
import {
  DEVICE_ANALYSIS_CAPACITANCE_Y_UNIT_VALUES,
  DEVICE_ANALYSIS_CURRENT_Y_UNIT_VALUES,
  getDeviceAnalysisXUnitMeta,
  getDeviceAnalysisYUnitMeta,
  isDeviceAnalysisCapacitanceYUnit,
  isDeviceAnalysisCurrentYUnit,
  normalizeDeviceAnalysisYUnit,
  type DeviceAnalysisYUnit,
} from "../lib/deviceAnalysisUnits";
import { getDeviceAnalysisPerfNow, logDeviceAnalysisPerf, startDeviceAnalysisPerf } from "../../shared/lib/deviceAnalysisPerf";
import MainPlotChart from "./MainPlotChart";
import GmDiagnosticsChart from "./GmDiagnosticsChart";
import SsDiagnosticsChart from "./SsDiagnosticsChart";
import SsSummaryStrip from "./SsSummaryStrip";
import AnalysisDiagnosticsCard from "./AnalysisDiagnosticsCard";
import AxisSettingsPane from "./AxisSettingsPane";
type SsRange = {
    x1: number;
    x2: number;
};
type CurrentBiasRole = "ion" | "ioff";
type PlotTypeOption = "iv" | "gm" | "ss" | "vth" | "j";
type ResultsTabOption = "metrics" | "export" | "rc";
type RcGeometryEntry = {
    include?: boolean;
    length?: string;
    vds?: string;
    width?: string;
};
type RcGeometryByFileId = Record<string, Record<string, RcGeometryEntry>>;
type OriginExportContentOption = {
    group: "basic" | "derived";
    key: DeviceAnalysisOriginExportContentKey;
    labelKey: string;
};
type OriginExportContentMenuGroup = {
    key: OriginExportContentOption["group"];
    labelKey: string;
    options: OriginExportContentOption[];
};
type OriginCurveExportSeriesOption = {
    key: string;
    label: string;
    sourceFileId: string;
    sourceSeriesId: string;
};
const MAX_RENDER_SERIES_POINTS = 600;
const MIN_RENDER_SERIES_POINTS = 120;
const DEFAULT_RENDER_POINT_BUDGET = 12000;
const GM_RENDER_POINT_BUDGET = 9000;
const MAIN_PLOT_LEGEND_WIDTH = 220;
const TRANSFER_CALCULATED_PARAMETERS_COLUMN_WIDTHS_PX = [
    168, 128, 88, 128, 88, 120, 168, 88, 112, 112, 104, 88, 120,
];
const DERIVATIVE_ONLY_CALCULATED_PARAMETERS_COLUMN_WIDTHS_PX = [168, 168, 88];
const ANALYSIS_COMPACT_INPUT_WRAPPER_CLASS = "!space-y-0";
const ANALYSIS_COMPACT_INPUT_CLASS = "text-xs";
const ANALYSIS_COMPACT_PAGE_FIELD_CLASS =
    "!h-8 !gap-0 rounded-lg border border-border bg-bg-page px-2 py-1";
const TOOLTIP_SERIES_NAME_SEPARATOR = "\u0000";
const ORIGIN_EXPORT_CONTENT_OPTIONS: OriginExportContentOption[] = [
    { group: "basic", key: "iv", labelKey: "da_origin_export_content_iv" },
    { group: "basic", key: "metrics", labelKey: "da_origin_export_content_metrics" },
    { group: "derived", key: "gm", labelKey: "da_origin_export_content_gm" },
    { group: "derived", key: "gds", labelKey: "da_origin_export_content_gds" },
    { group: "derived", key: "ss", labelKey: "da_origin_export_content_ss" },
    { group: "derived", key: "vth", labelKey: "da_origin_export_content_vth" },
];
const DEFAULT_ORIGIN_EXPORT_CONTENT_KEYS: DeviceAnalysisOriginExportContentKey[] = ["iv"];
const ORIGIN_EXPORT_CONTENT_OPTION_GROUPS: Array<Pick<OriginExportContentMenuGroup, "key" | "labelKey">> = [
    { key: "basic", labelKey: "da_origin_export_content_group_basic" },
    { key: "derived", labelKey: "da_origin_export_content_group_derived" },
];
const resolvePrimaryExportContentLabelKey = (fileLike: any): string => {
    const curveType = String(fileLike?.curveType ?? "").trim().toLowerCase();
    if (curveType === "pv")
        return "da_origin_export_content_pv";
    if (curveType === "cv")
        return "da_origin_export_content_cv";
    if (curveType === "cf")
        return "da_origin_export_content_cf";
    return "da_origin_export_content_iv";
};
const resolveOriginExportContentOptionsForFile = (fileLike: any): OriginExportContentOption[] => {
    const curveType = String(fileLike?.curveType ?? "").trim().toLowerCase();
    const primaryOption: OriginExportContentOption = {
        group: "basic",
        key: "iv",
        labelKey: resolvePrimaryExportContentLabelKey(fileLike),
    };
    if (curveType === "pv" || curveType === "cv" || curveType === "cf")
        return [primaryOption];
    if (isTransferLikeDeviceAnalysisFile(fileLike)) {
        return [
            primaryOption,
            { group: "basic", key: "metrics", labelKey: "da_origin_export_content_metrics" },
            { group: "derived", key: "gm", labelKey: "da_origin_export_content_gm" },
            { group: "derived", key: "ss", labelKey: "da_origin_export_content_ss" },
            { group: "derived", key: "vth", labelKey: "da_origin_export_content_vth" },
        ];
    }
    if (isOutputLikeDeviceAnalysisFile(fileLike)) {
        return [
            primaryOption,
            { group: "basic", key: "metrics", labelKey: "da_origin_export_content_metrics" },
            { group: "derived", key: "gds", labelKey: "da_origin_export_content_gds" },
        ];
    }
    return [primaryOption];
};
const normalizeOriginExportContentKeysForOptions = (
    keys: readonly DeviceAnalysisOriginExportContentKey[] | null | undefined,
    options: readonly OriginExportContentOption[],
): DeviceAnalysisOriginExportContentKey[] => {
    const allowedKeys = new Set(options.map((option) => option.key));
    const normalized = (Array.isArray(keys) ? keys : DEFAULT_ORIGIN_EXPORT_CONTENT_KEYS)
        .filter((key): key is DeviceAnalysisOriginExportContentKey => allowedKeys.has(key));
    return normalized.length ? Array.from(new Set(normalized)) : DEFAULT_ORIGIN_EXPORT_CONTENT_KEYS;
};

type ChartHighlightOverlay = {
    key: string;
    fill: string;
    fillOpacity: number;
    hideEndLine?: boolean;
    hideStartLine?: boolean;
    stroke: string;
    strokeDasharray?: string;
    strokeOpacity: number;
    strokeWidth?: number;
    x1: number;
    x2: number;
};

type LegendEditingState = {
    fileId: string;
    seriesId: string;
};

type AxisTitleOverridesByFileId = Record<string, Partial<Record<"x" | "y", string>>>;

type VthBranch = "electron" | "hole";
type VthFitResult = {
    branch: VthBranch;
    intercept: number;
    r2: number;
    slope: number;
    vth: number;
    x1: number;
    x2: number;
    y1: number;
    y2: number;
};

const toSqrtCurrentPoints = (points: any[]) => (Array.isArray(points) ? points : [])
    .map((point: any) => {
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y))
        return null;
    return {
        x,
        y: Math.sqrt(Math.abs(y)),
        rawCurrent: y,
    };
})
    .filter((point): point is { rawCurrent: number; x: number; y: number } => point !== null && Number.isFinite(point.y));

const fitLinear = (points: Array<{ x: number; y: number }>) => {
    const n = points.length;
    if (n < 2)
        return null;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    for (const point of points) {
        sx += point.x;
        sy += point.y;
        sxx += point.x * point.x;
        sxy += point.x * point.y;
    }
    const denom = n * sxx - sx * sx;
    if (!Number.isFinite(denom) || denom === 0)
        return null;
    const slope = (n * sxy - sx * sy) / denom;
    const intercept = (sy - slope * sx) / n;
    if (!Number.isFinite(slope) || !Number.isFinite(intercept) || slope === 0)
        return null;
    const meanY = sy / n;
    let ssRes = 0;
    let ssTot = 0;
    for (const point of points) {
        const predicted = slope * point.x + intercept;
        ssRes += (point.y - predicted) ** 2;
        ssTot += (point.y - meanY) ** 2;
    }
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;
    return { intercept, r2, slope };
};

const pickVthLinearFit = (points: Array<{ x: number; y: number }>, branch: VthBranch): VthFitResult | null => {
    const sorted = points
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && point.y > 0)
        .slice()
        .sort((a, b) => a.x - b.x);
    if (sorted.length < 5)
        return null;
    const minWindow = Math.min(5, sorted.length);
    const maxWindow = Math.min(16, sorted.length);
    const maxY = Math.max(...sorted.map((point) => point.y));
    let best: (VthFitResult & { score: number }) | null = null;
    for (let windowSize = minWindow; windowSize <= maxWindow; windowSize += 1) {
        for (let start = 0; start <= sorted.length - windowSize; start += 1) {
            const window = sorted.slice(start, start + windowSize);
            const fit = fitLinear(window);
            if (!fit)
                continue;
            if (branch === "electron" && fit.slope <= 0)
                continue;
            if (branch === "hole" && fit.slope >= 0)
                continue;
            const ys = window.map((point) => point.y);
            const ySpan = Math.max(...ys) - Math.min(...ys);
            if (maxY > 0 && ySpan / maxY < 0.12)
                continue;
            const vth = -fit.intercept / fit.slope;
            if (!Number.isFinite(vth))
                continue;
            const x1 = window[0]!.x;
            const x2 = window[window.length - 1]!.x;
            const y1 = fit.slope * x1 + fit.intercept;
            const y2 = fit.slope * x2 + fit.intercept;
            if (!Number.isFinite(y1) || !Number.isFinite(y2))
                continue;
            const score = fit.r2 + Math.min(0.08, ySpan / Math.max(maxY, 1e-300) * 0.08) + windowSize * 0.002;
            if (!best || score > best.score) {
                best = {
                    branch,
                    intercept: fit.intercept,
                    r2: fit.r2,
                    score,
                    slope: fit.slope,
                    vth,
                    x1,
                    x2,
                    y1,
                    y2,
                };
            }
        }
    }
    if (!best)
        return null;
    const { score: _score, ...fit } = best;
    return fit;
};

const computeVthSqrtFits = (points: any[]): VthFitResult[] => {
    const sqrtPoints = toSqrtCurrentPoints(points);
    if (sqrtPoints.length < 5)
        return [];
    const valley = sqrtPoints.reduce((best, point) => point.y < best.y ? point : best, sqrtPoints[0]!);
    const holePoints = sqrtPoints.filter((point) => point.x <= valley.x);
    const electronPoints = sqrtPoints.filter((point) => point.x >= valley.x);
    return [
        pickVthLinearFit(holePoints, "hole"),
        pickVthLinearFit(electronPoints, "electron"),
    ].filter((fit): fit is VthFitResult => fit !== null);
};

type EditableLegendItemProps = {
    checked: boolean;
    color: string;
    disabled: boolean;
    isEditing: boolean;
    label: string;
    fontSize: number;
    onBeginEdit: () => void;
    onCancelEdit: () => void;
    onCommitEdit: () => void;
    onDraftChange: (nextValue: string) => void;
    onToggleVisible: () => void;
    draftValue: string;
    inputRef?: React.RefObject<HTMLInputElement | null>;
};

const EditableLegendItem = ({
    checked,
    color,
    disabled,
    isEditing,
    label,
    fontSize,
    onBeginEdit,
    onCancelEdit,
    onCommitEdit,
    onDraftChange,
    onToggleVisible,
    draftValue,
    inputRef,
}: EditableLegendItemProps) => (<li className="min-w-0 w-full overflow-hidden">
    <div
      className={`group flex min-w-0 w-full max-w-full items-center gap-1 overflow-hidden py-0 leading-4 ${disabled ? "opacity-60 cursor-default" : "cursor-pointer"}`}
      style={{ fontFamily: "Arial, sans-serif", fontSize }}
    >
      <button type="button" aria-pressed={checked} aria-label={label} disabled={disabled} onClick={onToggleVisible} className={`shrink-0 ${disabled ? "cursor-default" : "cursor-pointer"}`}>
        <span className="clickable-ckb" data-state={checked ? "checked" : "unchecked"}>
          {checked ? <Check size={10} className="text-white" strokeWidth={4}/> : null}
        </span>
      </button>
      <span className="inline-block h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }}/>
      <InlineEditableText
        editing={isEditing}
        draftValue={draftValue}
        inputRef={inputRef}
        onChange={onDraftChange}
        onCommit={onCommitEdit}
        onCancel={onCancelEdit}
        onStartEdit={onBeginEdit}
        title={`${label}\n双击可编辑`}
        value={label}
        className="min-w-0 max-w-full overflow-hidden"
        displayClassName="!text-text-primary"
        inputClassName="!w-full !text-text-primary"
        style={{ fontFamily: "Arial, sans-serif", fontSize }}
      />
    </div>
  </li>);

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
const toSecondDerivativeUnitLabel = (conductanceUnitLabel: string, xUnitLabel: string): string => {
    const xUnit = String(xUnitLabel ?? "").trim() || "X";
    return `${conductanceUnitLabel}/${xUnit}`;
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
    return parts.join(" | ");
};
const formatBiasInputValue = (xRaw: number, xFactor: number): string => String(normalizeFloat(xRaw * xFactor));
const formatCurveProbeBranchSuffix = (branchRaw: unknown): string => {
    const branch = String(branchRaw ?? "").trim().toLowerCase();
    if (branch === "forward")
        return " (forward)";
    if (branch === "reverse")
        return " (reverse)";
    return "";
};
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
const buildSeriesCurrentTargetsSignature = (targetsBySeries: Record<string, {
    ionX?: unknown;
    ioffX?: unknown;
}> | null | undefined): string => {
    if (!targetsBySeries)
        return "";
    return Object.keys(targetsBySeries)
        .sort()
        .map((seriesId) => {
        const entry = targetsBySeries[seriesId] ?? {};
        return `${seriesId}:${toStableNumericToken(entry?.ionX)}:${toStableNumericToken(entry?.ioffX)}`;
    })
        .join("|");
};
const collectChangedSeriesIds = (previousMap: Record<string, any> | null | undefined, nextMap: Record<string, any> | null | undefined, keys: Array<"ionX" | "ioffX" | "x1" | "x2">): string[] => {
    const previous = previousMap && typeof previousMap === "object" ? previousMap : {};
    const next = nextMap && typeof nextMap === "object" ? nextMap : {};
    const seriesIds = new Set([...Object.keys(previous), ...Object.keys(next)]);
    const changed: string[] = [];
    for (const seriesId of seriesIds) {
        const prevEntry = previous[seriesId] ?? {};
        const nextEntry = next[seriesId] ?? {};
        const didChange = keys.some((key) => toStableNumericToken(prevEntry?.[key]) !== toStableNumericToken(nextEntry?.[key]));
        if (didChange) {
            changed.push(seriesId);
        }
    }
    return changed.sort();
};
const inferUniformTickStep = (ticks: unknown, toleranceRatio = 1e-6): number | null => {
    if (!Array.isArray(ticks) || ticks.length < 2)
        return null;
    const values = ticks
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value));
    if (values.length < 2)
        return null;
    const deltas: number[] = [];
    for (let index = 1; index < values.length; index += 1) {
        const delta = values[index] - values[index - 1];
        if (!Number.isFinite(delta) || !(Math.abs(delta) > 0))
            return null;
        deltas.push(delta);
    }
    if (!deltas.length)
        return null;
    const base = deltas[0];
    const tolerance = Math.max(Math.abs(base) * toleranceRatio, 1e-12);
    if (!deltas.every((delta) => Math.abs(delta - base) <= tolerance))
        return null;
    return Math.abs(base);
};
const inferUniformLogTickStep = (ticks: unknown, toleranceRatio = 1e-6): number | null => {
    if (!Array.isArray(ticks) || ticks.length < 2)
        return null;
    const values = ticks
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
        .map((value) => Math.log10(value));
    return inferUniformTickStep(values, toleranceRatio);
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
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object";
const normalizeByFileIdRecord = <T,>(value: unknown, normalizeEntry: (entry: unknown) => T | null | undefined): Record<string, T> => {
    const raw = isRecord(value) ? value : {};
    const next: Record<string, T> = {};
    for (const [fileId, entry] of Object.entries(raw)) {
        const normalizedFileId = String(fileId ?? "").trim();
        if (!normalizedFileId)
            continue;
        const normalizedEntry = normalizeEntry(entry);
        if (normalizedEntry == null)
            continue;
        next[normalizedFileId] = normalizedEntry;
    }
    return next;
};
const normalizeVisibleSeriesByFileId = (value: unknown): Record<string, string[]> => {
    return normalizeByFileIdRecord(value, (seriesIds) => {
        if (!Array.isArray(seriesIds))
            return null;
        return Array.from(new Set(seriesIds
            .map((seriesId) => String(seriesId ?? "").trim())
            .filter(Boolean)));
    });
};
const normalizeSeriesLegendLabelsByFileId = (value: unknown): Record<string, Record<string, string>> => {
    return normalizeByFileIdRecord(value, (labels) => {
        if (!isRecord(labels))
            return null;
        const nextLabels: Record<string, string> = {};
        for (const [seriesId, label] of Object.entries(labels)) {
            const normalizedSeriesId = String(seriesId ?? "").trim();
            const normalizedLabel = String(label ?? "").trim();
            if (!normalizedSeriesId || !normalizedLabel)
                continue;
            nextLabels[normalizedSeriesId] = normalizedLabel;
        }
        return Object.keys(nextLabels).length ? nextLabels : null;
    });
};
const normalizeAxisTitleOverridesByFileId = (value: unknown): AxisTitleOverridesByFileId => {
    return normalizeByFileIdRecord(value, (labels) => {
        if (!isRecord(labels))
            return null;
        const nextLabels: Partial<Record<"x" | "y", string>> = {};
        for (const axisKey of ["x", "y"] as const) {
            const normalizedLabel = String(labels[axisKey] ?? "").trim();
            if (normalizedLabel) {
                nextLabels[axisKey] = normalizedLabel;
            }
        }
        return Object.keys(nextLabels).length ? nextLabels : null;
    });
};
const normalizeLinearLogScale = (value: unknown): "linear" | "log" => String(value ?? "").trim().toLowerCase() === "log" ? "log" : "linear";
const normalizeChartYScale = (value: unknown): "linear" | "log" | "logAbs" => {
    const normalized = String(value ?? "").trim();
    if (normalized === "logAbs")
        return "logAbs";
    return normalizeLinearLogScale(normalized);
};
const normalizeLogCurrentMode = (value: unknown): "all" | "positive" => String(value ?? "").trim() === "positive" ? "positive" : "all";
const normalizeYScaleByFileIdRecord = (value: unknown): Record<string, "linear" | "log"> => normalizeByFileIdRecord(value, normalizeLinearLogScale);
const normalizeYLogCurrentModeByFileIdRecord = (value: unknown): Record<string, "all" | "positive"> => normalizeByFileIdRecord(value, normalizeLogCurrentMode);
const stripSpecificAxisUnitSuffix = (labelRaw: unknown, unitRaw: unknown): string => {
    const label = String(labelRaw ?? "").trim();
    const unit = String(unitRaw ?? "").trim();
    if (!label || !unit)
        return label;
    const suffix = `(${unit})`;
    return label.endsWith(suffix) ? label.slice(0, -suffix.length).trim() : label;
};
const isCapacitanceCurve = (fileLike: any): boolean => {
    const curveType = String(fileLike?.curveType ?? "").trim().toLowerCase();
    return curveType === "cv" || curveType === "cf";
};
const isLinearDefaultCurve = (fileLike: any): boolean => {
    const curveType = String(fileLike?.curveType ?? "").trim().toLowerCase();
    return curveType === "cv" || curveType === "cf" || curveType === "pv";
};
const shouldUseStartupDefaultYScale = (fileLike: any): boolean =>
    isTransferLikeDeviceAnalysisFile(fileLike) || isLinearDefaultCurve(fileLike);
const resolveSpecialCurveType = (fileLike: any): "cv" | "cf" | "pv" | null => {
    const curveType = String(fileLike?.curveType ?? "").trim().toLowerCase();
    return curveType === "cv" || curveType === "cf" || curveType === "pv"
        ? curveType
        : null;
};
const resolveDefaultYUnitForFile = (fileLike: any): DeviceAnalysisYUnit => {
    if (isCapacitanceCurve(fileLike))
        return "pF";
    return normalizeDeviceAnalysisYUnit(fileLike?.yUnit, "A") || "A";
};
const resolveAllowedYUnitsForFile = (fileLike: any): readonly DeviceAnalysisYUnit[] => isCapacitanceCurve(fileLike)
    ? DEVICE_ANALYSIS_CAPACITANCE_Y_UNIT_VALUES
    : DEVICE_ANALYSIS_CURRENT_Y_UNIT_VALUES;
const isYUnitAllowedForFile = (unit: unknown, fileLike: any): unit is DeviceAnalysisYUnit => isCapacitanceCurve(fileLike)
    ? isDeviceAnalysisCapacitanceYUnit(unit)
    : isDeviceAnalysisCurrentYUnit(unit);
const normalizeYUnitByFileIdRecord = (value: unknown): Record<string, DeviceAnalysisYUnit> => {
    return normalizeByFileIdRecord(value, (unit) => {
        const normalizedUnit = normalizeDeviceAnalysisYUnit(unit, "A");
        return normalizedUnit || null;
    });
};
const buildTooltipSeriesName = (label: string, seriesId: unknown): string => `${label}${TOOLTIP_SERIES_NAME_SEPARATOR}${String(seriesId ?? "").trim()}`;
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
                columnLabels?: {
                    longNames?: string[];
                    units?: string[];
                };
                postCommands?: string[];
            };
            plot?: {
                postCommands?: string[];
            };
            axis?: {
                limits?: {
                    x?: {
                        from?: number;
                        to?: number;
                        step?: number;
                        scale?: string;
                    };
                    y?: {
                        from?: number;
                        to?: number;
                        step?: number;
                        scale?: string;
                    };
                };
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
type OriginExportContentTranslateFn = (key: string, params?: Record<string, string | number | boolean | null | undefined>) => string;
const OriginExportContentMenu = ({
    options,
    selectedKeys,
    setSelectedKeys,
    t,
}: {
    options: OriginExportContentOption[];
    selectedKeys: DeviceAnalysisOriginExportContentKey[];
    setSelectedKeys: React.Dispatch<React.SetStateAction<DeviceAnalysisOriginExportContentKey[]>>;
    t: OriginExportContentTranslateFn;
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const anchorRef = useRef<HTMLDivElement | null>(null);
    const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);
    const selectedLabels = options
        .filter((option) => selectedSet.has(option.key))
        .map((option) => t(option.labelKey));
    const summary = selectedLabels.join(" + ");
    const toggleContentKey = (key: DeviceAnalysisOriginExportContentKey) => {
        setSelectedKeys((prev) => {
            const current = Array.isArray(prev) && prev.length
                ? normalizeOriginExportContentKeysForOptions(prev, options)
                : DEFAULT_ORIGIN_EXPORT_CONTENT_KEYS;
            if (current.includes(key)) {
                if (current.length <= 1)
                    return current;
                return current.filter((item) => item !== key);
            }
            return [...current, key];
        });
    };
    const groupedOptions: OriginExportContentMenuGroup[] = ORIGIN_EXPORT_CONTENT_OPTION_GROUPS
        .map((group) => ({
            key: group.key,
            labelKey: group.labelKey,
            options: options.filter((option) => option.group === group.key),
        }))
        .filter((group) => group.options.length > 0);

    return (
      <div className="ui-select_warp w-fit da-neutral-select" data-style="select">
        <Dropdown isOpen={isOpen} onOpenChange={setIsOpen} anchorRef={anchorRef}>
          {({ setContentRef }) => (
            <>
              <DropdownTrigger
                fieldRef={anchorRef}
                id="device-analysis-origin-export-content-select"
                isOpen={isOpen}
                menuId="device-analysis-origin-export-content-menu"
                data-size="sm"
                onClick={() => setIsOpen((prev) => !prev)}
                fieldClassName="input_field ui-select_field--sm pr-1"
                className="input_native no-focus-outline p-0 text-left cursor-pointer select-none pr-6"
                indicatorClassName="absolute right-1 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none"
                indicator={
                  <ChevronDown
                    size={14}
                    className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                  />
                }
              >
                <span className="block truncate text-text-primary">{summary}</span>
              </DropdownTrigger>
              <ContentView
                isOpen={isOpen}
                align="left"
                zIndex={80}
                matchAnchorWidth
                triggerId="device-analysis-origin-export-content-select"
                menuId="device-analysis-origin-export-content-menu"
                anchorRef={anchorRef}
                contentRef={setContentRef}
                variant="menu"
              >
                {() => (
                  <Menu withScrollArea={false}>
                    <div className="ui-menu__list">
                      {groupedOptions.map((group) => (
                        <div
                          key={group.key}
                          role="group"
                          aria-label={t(group.labelKey)}
                          className="ui-menu__group"
                        >
                          {group.options.map((option) => {
                            const checked = selectedSet.has(option.key);
                            return (
                              <MenuItem
                                key={option.key}
                                role="menuitemcheckbox"
                                aria-checked={checked}
                                data-selected={checked || undefined}
                                onClick={() => toggleContentKey(option.key)}
                                className="group"
                                left={
                                  <span className="ui-menu__item-left">
                                    <span className="whitespace-nowrap">{t(option.labelKey)}</span>
                                  </span>
                                }
                                right={
                                  <span className="ui-menu__item-right">
                                    {checked ? <Check size={14} className="text-accent" /> : null}
                                  </span>
                                }
                              />
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </Menu>
                )}
              </ContentView>
            </>
          )}
        </Dropdown>
      </div>
    );
};

const OriginCurveExportMenu = ({
    curveOptions,
    selectedCurveOptionKeySet,
    mode,
    onSelectedCurveOptionKeysChange,
    scopedFileIds,
    setMode,
    replaceMatchingOriginSeriesAcrossFiles,
    t,
}: {
    curveOptions: OriginCurveExportSeriesOption[];
    selectedCurveOptionKeySet: Set<string>;
    mode: DeviceAnalysisOriginCurveExportMode;
    onSelectedCurveOptionKeysChange: (nextKeys: string[]) => void;
    scopedFileIds: string[];
    setMode: (next: DeviceAnalysisOriginCurveExportMode) => void;
    replaceMatchingOriginSeriesAcrossFiles: (options: {
        fileIds?: unknown[];
        sourceSeriesRefs?: Array<{ fileId?: unknown; seriesId?: unknown }>;
    }) => { matchedFileCount: number; matchedSeriesCount: number };
    t: OriginExportContentTranslateFn;
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [showPicker, setShowPicker] = useState(false);
    const anchorRef = useRef<HTMLDivElement | null>(null);
    const menuContentRef = useRef<HTMLDivElement | null>(null);
    const selectItemRef = useRef<HTMLDivElement | null>(null);
    const submenuContentRef = useRef<HTMLDivElement | null>(null);
    const selectedSourceIds = useMemo(() => {
        if (mode === "all") {
            return curveOptions.map((option) => option.key).filter(Boolean);
        }
        return curveOptions
            .map((option) => option.key)
            .filter((key) => selectedCurveOptionKeySet.has(key));
    }, [curveOptions, mode, selectedCurveOptionKeySet]);
    const selectedSourceSet = useMemo(() => new Set(selectedSourceIds), [selectedSourceIds]);
    const displayLabel = mode === "all"
        ? t("da_origin_curve_export_mode_all")
        : selectedSourceIds.length
            ? t("da_origin_curve_export_mode_select_count", { count: selectedSourceIds.length })
            : t("da_origin_curve_export_mode_select");
    const applySourceSelection = (sourceIds: string[]) => {
        setMode("select");
        onSelectedCurveOptionKeysChange(sourceIds);
        const selectedKeySet = new Set(sourceIds);
        replaceMatchingOriginSeriesAcrossFiles({
            fileIds: scopedFileIds,
            sourceSeriesRefs: curveOptions
                .filter((option) => selectedKeySet.has(option.key))
                .map((option) => ({
                    fileId: option.sourceFileId,
                    seriesId: option.sourceSeriesId,
                })),
        });
    };
    const toggleSourceSeries = (seriesKey: string) => {
        const next = selectedSourceSet.has(seriesKey)
            ? selectedSourceIds.filter((item) => item !== seriesKey)
            : [...selectedSourceIds, seriesKey];
        applySourceSelection(next);
    };
    useEffect(() => {
        if (!isOpen) return;

        const handleMouseDown = (event: MouseEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (anchorRef.current?.contains(target)) return;
            if (menuContentRef.current?.contains(target)) return;
            if (submenuContentRef.current?.contains(target)) return;
            setIsOpen(false);
            setShowPicker(false);
        };

        document.addEventListener("mousedown", handleMouseDown);
        return () => document.removeEventListener("mousedown", handleMouseDown);
    }, [isOpen]);

    return (
      <div className="ui-select_warp w-fit da-neutral-select" data-style="select">
        <Dropdown isOpen={isOpen} onOpenChange={(next) => {
            setIsOpen(next);
            if (next) setShowPicker(mode === "select");
            else setShowPicker(false);
        }} anchorRef={anchorRef} closeOnClickOutside={false}>
          {({ setContentRef }) => (
            <>
              <DropdownTrigger
                fieldRef={anchorRef}
                id="device-analysis-origin-curve-export-mode-select"
                isOpen={isOpen}
                menuId="device-analysis-origin-curve-export-mode-menu"
                data-size="sm"
                onClick={() => setIsOpen((prev) => !prev)}
                fieldClassName="input_field ui-select_field--sm pr-1"
                className="input_native no-focus-outline p-0 text-left cursor-pointer select-none pr-6"
                indicatorClassName="absolute right-1 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none"
                indicator={
                  <ChevronDown
                    size={14}
                    className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                  />
                }
              >
                <span className="block truncate text-text-primary">{displayLabel}</span>
              </DropdownTrigger>
              <ContentView
                isOpen={isOpen}
                align="left"
                zIndex={80}
                triggerId="device-analysis-origin-curve-export-mode-select"
                menuId="device-analysis-origin-curve-export-mode-menu"
                anchorRef={anchorRef}
                contentRef={(node) => {
                    menuContentRef.current = node;
                    setContentRef(node);
                }}
                variant="menu"
              >
                {() => (
                  <Menu withScrollArea={false}>
                    <div className="ui-menu__list">
                        <MenuItem
                          data-selected={mode === "all" || undefined}
                          onClick={() => {
                            setMode("all");
                            setShowPicker(false);
                            setIsOpen(false);
                          }}
                          onMouseEnter={() => setShowPicker(false)}
                          left={<span className="ui-menu__item-left whitespace-nowrap">{t("da_origin_curve_export_mode_all")}</span>}
                          right={<span className="ui-menu__item-right">{mode === "all" ? <Check size={14} className="text-accent" /> : null}</span>}
                        />
                        <MenuItem
                          ref={selectItemRef}
                          data-selected={mode === "select" || undefined}
                          onClick={() => {
                            setMode("select");
                            setShowPicker(true);
                          }}
                          onMouseEnter={() => setShowPicker(true)}
                          left={<span className="ui-menu__item-left whitespace-nowrap">{t("da_origin_curve_export_mode_select")}</span>}
                          right={<span className="ui-menu__item-right"><ChevronRight size={14} /></span>}
                        />
                    </div>
                  </Menu>
                )}
              </ContentView>
              <ContentView
                isOpen={isOpen && showPicker}
                align="left"
                side="right"
                zIndex={90}
                triggerId="device-analysis-origin-curve-export-mode-menu-select"
                menuId="device-analysis-origin-curve-export-picker-menu"
                anchorRef={selectItemRef}
                contentRef={(node) => {
                    submenuContentRef.current = node;
                }}
                variant="menu"
              >
                {() => (
                  <Menu withScrollArea={false}>
                    <ScrollArea
                      axis="y"
                      className="max-h-60"
                      viewportClassName="max-h-60"
                      viewportProps={{ style: { height: "auto", maxHeight: "15rem" } }}
                    >
                      <div className="ui-menu__list">
                        {curveOptions.map((option) => {
                          const key = String(option?.key ?? "");
                          const checked = selectedSourceSet.has(key);
                          return (
                            <MenuItem
                              key={key}
                              role="menuitemcheckbox"
                              aria-checked={checked}
                              data-selected={checked || undefined}
                              onClick={() => toggleSourceSeries(key)}
                              left={
                                <span className="ui-menu__item-left min-w-0">
                                  <span className="truncate">{option.label}</span>
                                </span>
                              }
                              right={
                                <span className="ui-menu__item-right">
                                  {checked ? <Check size={14} className="text-accent" /> : null}
                                </span>
                              }
                            />
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </Menu>
                )}
              </ContentView>
            </>
          )}
        </Dropdown>
      </div>
    );
};
const PlotTypeToggle = React.memo(function PlotTypeToggle({ activePlotType, primaryPlotLabel, derivativeLabel, gmApplicable, ssApplicable, vthApplicable, areaAvailable, onChange, }: {
    activePlotType: PlotTypeOption;
    primaryPlotLabel?: string;
    derivativeLabel: string;
    gmApplicable: boolean;
    ssApplicable: boolean;
    vthApplicable: boolean;
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
    return (<Tabs
        idBase="device-analysis-plot-type-tabs"
        value={displayedPlotType}
        onChange={(next) => selectPlotType(next as PlotTypeOption)}
        size="sm"
        hoverPreview={false}
        groupLabel="Plot type"
        itemClassName="!px-3"
        options={[
            {
                value: "iv",
                label: primaryPlotLabel || "I-V",
                id: "device-analysis-plot-iv-btn",
            },
            {
                value: "gm",
                label: derivativeLabel,
                id: "device-analysis-plot-gm-btn",
                disabled: !gmApplicable,
                title: !gmApplicable
                    ? "Only transfer/output curves support derivative plots"
                    : "",
            },
            {
                value: "ss",
                label: "SS",
                id: "device-analysis-plot-ss-btn",
                disabled: !ssApplicable,
                title: !ssApplicable
                    ? "SS is available when the selected data has a usable current-vs-bias sweep."
                    : "",
            },
            {
                value: "vth",
                label: "Vth",
                id: "device-analysis-plot-vth-btn",
                disabled: !vthApplicable,
                title: !vthApplicable
                    ? "Vth extraction is available for transfer curves."
                    : "",
            },
            {
                value: "j",
                label: "J",
                id: "device-analysis-plot-j-btn",
                disabled: !areaAvailable,
                title: !areaAvailable ? "Set a positive Area to enable J plot" : "",
            },
        ]}
      />);
});

const clampChartFontSize = (value: unknown, fallback: number): number => {
    const num = parseOptionalNumber(value);
    if (num === null)
        return fallback;
    return Math.min(96, Math.max(1, Math.round(num)));
};

const makeStrictLinearDomain = (min: unknown, max: unknown): [number, number] => {
    const minValue = Number(min);
    const maxValue = Number(max);
    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue))
        return [0, 1];
    const lo = Math.min(minValue, maxValue);
    const hi = Math.max(minValue, maxValue);
    if (lo === hi)
        return padLinearDomain(lo, hi);
    return [lo, hi];
};

const makeStrictLogDomain = (min: unknown, max: unknown): [number, number] | null => {
    const minValue = Number(min);
    const maxValue = Number(max);
    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue))
        return null;
    const lo = Math.min(minValue, maxValue);
    const hi = Math.max(minValue, maxValue);
    if (!(lo > 0) || !(hi > 0))
        return null;
    if (lo === hi)
        return padLogDomain(lo, hi);
    return [lo, hi];
};

const EMPTY_MIN_MAX = { minX: null, maxX: null, minY: null, maxY: null };
const computeDiagnosticsMinMax = (seriesList: any[]) => {
    if (!seriesList.length)
        return EMPTY_MIN_MAX;
    return computeMinMax(seriesList.map((series: any) => ({ data: series.data })));
};
const resolveDiagnosticsBaseYDomain = (
    minMax: { minY: number | null; maxY: number | null } | null | undefined,
    fallback: [number, number],
    includeZero = false,
): [number, number] => {
    const minY = minMax?.minY ?? null;
    const maxY = minMax?.maxY ?? null;
    if (minY === null || maxY === null)
        return fallback;
    return includeZero
        ? padLinearDomain(Math.min(minY, 0), Math.max(maxY, 0))
        : padLinearDomain(minY, maxY);
};
const buildDiagnosticsYTicks = (domain: [number, number]) => {
    return (buildOriginAutoTicks(domain[0], domain[1], 6) ??
        buildNiceTicks(domain[0], domain[1], 6, {
            preferTightRange: false,
        }));
};
const downsampleDiagnosticsSeriesForRender = (seriesList: any[]) => seriesList.map((series: any) => ({
    ...series,
    data: downsamplePointsForDisplay(series.data, MAX_RENDER_SERIES_POINTS),
}));
const resolveTickedDomain = (baseDomain: [number, number], ticks: unknown): [number, number] => {
    if (Array.isArray(ticks) && ticks.length >= 2) {
        return [
            Number(ticks[0]),
            Number(ticks[ticks.length - 1]),
        ];
    }
    return baseDomain;
};
const resolveScaledRangeFromTicks = ({
    domain,
    inferStep,
    scaleFactor,
    ticks,
}: {
    domain: [number, number];
    inferStep: (ticks: unknown) => number | null;
    scaleFactor: number;
    ticks: unknown;
}) => {
    const tickList = Array.isArray(ticks) && ticks.length >= 2 ? ticks : null;
    const minCandidateRaw = tickList ? Number(tickList[0]) : Number(domain?.[0]);
    const maxCandidateRaw = tickList ? Number(tickList[tickList.length - 1]) : Number(domain?.[1]);
    const stepRaw = inferStep(tickList);
    const minCandidate = minCandidateRaw * scaleFactor;
    const maxCandidate = maxCandidateRaw * scaleFactor;
    if (!Number.isFinite(minCandidate) || !Number.isFinite(maxCandidate))
        return null;
    const min = Math.min(minCandidate, maxCandidate);
    const max = Math.max(minCandidate, maxCandidate);
    if (!(max > min))
        return null;
    const step = Number.isFinite(stepRaw) ? Number(stepRaw) * scaleFactor : null;
    return { min, max, step };
};

const AnalysisCharts = ({ processedData, processingStatus, activeFileId: controlledActiveFileId = undefined, onActiveFileIdChange = undefined, showFileSelect = true, ionIoffMethod = "auto", setIonIoffMethod = () => { }, ionIoffManualTargetsByFileId = {}, setIonIoffManualTargetsByFileId = () => { }, ssMethod = "auto", setSsMethod = () => { }, ssDiagnosticsEnabled = true, setSsDiagnosticsEnabled = () => { }, vthDiagnosticsEnabled = false, setVthDiagnosticsEnabled = () => { }, gmDiagnosticsEnabled = false, setGmDiagnosticsEnabled = () => { }, ssShowFitLine = true, setSsShowFitLine = () => { }, ssManualRanges = {}, setSsManualRanges = () => { }, originOpenPlotOptions = DEFAULT_ORIGIN_PLOT_OPTIONS, onOriginOpenPlotOptionsChange = undefined, }: any) => {
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
    const [plotType, setPlotType] = useState<PlotTypeOption>("iv");
    const [focusedSeriesId, setFocusedSeriesId] = useState<string | null>(null);
    const [persistedYUnitByFileId, setPersistedYUnitByFileId] = useState<Record<string, DeviceAnalysisYUnit>>({});
    const [persistedYScaleByFileId, setPersistedYScaleByFileId] = useState<Record<string, "linear" | "log">>({});
    const [persistedYLogCurrentModeByFileId, setPersistedYLogCurrentModeByFileId] = useState<Record<string, "all" | "positive">>({});
    const [chartYScaleByFileId, setChartYScaleByFileId] = useState<Record<string, "linear" | "log" | "logAbs">>({});
    const [defaultYScaleForTransfer, setDefaultYScaleForTransfer] = useState<"linear" | "log">("log");
    const [defaultYScaleForOutput, setDefaultYScaleForOutput] = useState<"linear" | "log">("linear");
    const [defaultYScaleForCv, setDefaultYScaleForCv] = useState<"linear" | "log">("linear");
    const [defaultYScaleForCf, setDefaultYScaleForCf] = useState<"linear" | "log">("linear");
    const [defaultYScaleForPv, setDefaultYScaleForPv] = useState<"linear" | "log">("linear");
    const userChangedYUnitRef = useRef(false);
    const userChangedYScaleRef = useRef(false);
    const userChangedYLogCurrentModeRef = useRef(false);
    const [areaInput, setAreaInput] = useState("");
    const [showPlotSettingsPane, setShowPlotSettingsPane] = useState(false);
    const [originExportMode, setOriginExportMode] = useState<DeviceAnalysisOriginExportMode>("merged");
    const [originCanvasExportScope, setOriginCanvasExportScope] = useState<DeviceAnalysisOriginCanvasExportScope>("selected");
    const [originCurveExportMode, setOriginCurveExportMode] = useState<DeviceAnalysisOriginCurveExportMode>("all");
    const [originExportContentKeys, setOriginExportContentKeys] = useState<DeviceAnalysisOriginExportContentKey[]>(DEFAULT_ORIGIN_EXPORT_CONTENT_KEYS);
    const [originFilteredCanvasKind, setOriginFilteredCanvasKind] = useState<DeviceAnalysisOriginFilteredCanvasKind>("output");
    // User-picked curve legend template. File-level checkboxes are derived from this, not the source of truth.
    const [originCurveExportSelectedKeys, setOriginCurveExportSelectedKeys] = useState<string[] | null>(null);
    const [resultsTab, setResultsTab] = useState<ResultsTabOption>("metrics");
    const [rcGeometryByFileId, setRcGeometryByFileId] = useState<RcGeometryByFileId>({});
    const [rcAnalyzePending, setRcAnalyzePending] = useState(false);
    const [rcAnalyzeResult, setRcAnalyzeResult] = useState<any>(null);
    const [rcAnalyzeError, setRcAnalyzeError] = useState("");
    const [overviewVisibleFileIds, setOverviewVisibleFileIds] = useState<string[]>([]);
    const [visibleSeriesByFileId, setVisibleSeriesByFileId] = useState<Record<string, string[]>>({});
    const [seriesLegendLabelsByFileId, setSeriesLegendLabelsByFileId] = useState<Record<string, Record<string, string>>>({});
    const [axisTitleOverridesByFileId, setAxisTitleOverridesByFileId] = useState<AxisTitleOverridesByFileId>({});
    const [editingLegendLabel, setEditingLegendLabel] = useState<LegendEditingState | null>(null);
    const [editingLegendDraft, setEditingLegendDraft] = useState("");
    const originChartXRangeRef = useRef<{ min: number; max: number; step?: number | null; } | null>(null);
    const originChartYRangeRef = useRef<{ mode: "linear" | "log"; min: number; max: number; step?: number | null; } | null>(null);
    const editingLegendInputRef = useRef<HTMLInputElement | null>(null);
    const [axis, setAxisState] = useState<PlotAxisSettings>(DEFAULT_PLOT_AXIS_SETTINGS);
    const [plotAxisSettingsLoaded, setPlotAxisSettingsLoaded] = useState(false);
    const userChangedAxisSettingsRef = useRef(false);
    const plotAxisSettingsDirtyRef = useRef(false);
    const persistedPlotAxisSettingsRef = useRef<string | null>(null);
    const setAxis = React.useCallback((value: any) => {
        userChangedAxisSettingsRef.current = true;
        plotAxisSettingsDirtyRef.current = true;
        setAxisState((prev) => {
            const resolved = typeof value === "function" ? value(prev) : value;
            return normalizePlotAxisSettings(resolved, prev);
        });
    }, []);
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
                    analysisPlotAxisSettings?: unknown;
                    defaultYScaleForCf?: unknown;
                    defaultYScaleForCv?: unknown;
                    defaultYScaleForOutput?: unknown;
                    defaultYScaleForPv?: unknown;
                    defaultYScaleForSpecial?: unknown;
                    defaultYScaleForTransfer?: unknown;
                    originExportModeDefault?: string;
                    yUnitByFileId?: Record<string, unknown>;
                    yScaleByFileId?: Record<string, unknown>;
                    yLogCurrentModeByFileId?: Record<string, unknown>;
                } | null | undefined;
                const yUnitByFileId = normalizeYUnitByFileIdRecord(normalizedSettings?.yUnitByFileId);
                const yScaleByFileId = normalizeYScaleByFileIdRecord(normalizedSettings?.yScaleByFileId);
                const yLogCurrentModeByFileId = normalizeYLogCurrentModeByFileIdRecord(normalizedSettings?.yLogCurrentModeByFileId);
                const exportDefaultYScaleForTransfer = normalizeLinearLogScale(normalizedSettings?.defaultYScaleForTransfer ?? "log");
                const exportDefaultYScaleForOutput = normalizeLinearLogScale(normalizedSettings?.defaultYScaleForOutput ?? "linear");
                const legacyDefaultYScaleForSpecial = normalizeLinearLogScale(normalizedSettings?.defaultYScaleForSpecial ?? "linear");
                const exportDefaultYScaleForCv = normalizeLinearLogScale(normalizedSettings?.defaultYScaleForCv ?? legacyDefaultYScaleForSpecial);
                const exportDefaultYScaleForCf = normalizeLinearLogScale(normalizedSettings?.defaultYScaleForCf ?? legacyDefaultYScaleForSpecial);
                const exportDefaultYScaleForPv = normalizeLinearLogScale(normalizedSettings?.defaultYScaleForPv ?? legacyDefaultYScaleForSpecial);
                const exportMode = normalizedSettings?.originExportModeDefault;
                if (cancelled)
                    return;
                const normalizedAxisSettings = normalizePlotAxisSettings(normalizedSettings?.analysisPlotAxisSettings);
                persistedPlotAxisSettingsRef.current = JSON.stringify(normalizedAxisSettings);
                setPlotAxisSettingsLoaded(true);
                if (!userChangedAxisSettingsRef.current) {
                    setAxisState(normalizedAxisSettings);
                }
                setDefaultYScaleForTransfer(exportDefaultYScaleForTransfer);
                setDefaultYScaleForOutput(exportDefaultYScaleForOutput);
                setDefaultYScaleForCv(exportDefaultYScaleForCv);
                setDefaultYScaleForCf(exportDefaultYScaleForCf);
                setDefaultYScaleForPv(exportDefaultYScaleForPv);
                if (!userChangedYUnitRef.current) {
                    setPersistedYUnitByFileId(yUnitByFileId);
                }
                if (!userChangedYLogCurrentModeRef.current) {
                    setPersistedYLogCurrentModeByFileId(yLogCurrentModeByFileId);
                }
                if (isDeviceAnalysisOriginExportMode(exportMode)) {
                    setOriginExportMode(exportMode);
                }
                if (!userChangedYScaleRef.current) {
                    setPersistedYScaleByFileId(yScaleByFileId);
                    setChartYScaleByFileId((prev) => {
                        const next: Record<string, "linear" | "log" | "logAbs"> = {};
                        for (const [fileId, scale] of Object.entries(yScaleByFileId)) {
                            next[fileId] = normalizeChartYScale(prev?.[fileId] ?? scale);
                        }
                        for (const [fileId, scale] of Object.entries(prev ?? {})) {
                            if (next[fileId])
                                continue;
                            next[fileId] = normalizeChartYScale(scale);
                        }
                        return next;
                    });
                }
            }
            catch {
                // ignore settings load failures
                if (!cancelled) {
                    persistedPlotAxisSettingsRef.current = JSON.stringify(DEFAULT_PLOT_AXIS_SETTINGS);
                    setPlotAxisSettingsLoaded(true);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);
    const effectiveActiveFileId = useMemo(() => resolveAvailableActiveFileId(processedData, activeFileId), [activeFileId, processedData]);
    const getDefaultLinearLogYScaleForFile = React.useCallback((fileLike: any): "linear" | "log" => {
        const specialCurveType = resolveSpecialCurveType(fileLike);
        if (specialCurveType === "cv")
            return defaultYScaleForCv;
        if (specialCurveType === "cf")
            return defaultYScaleForCf;
        if (specialCurveType === "pv")
            return defaultYScaleForPv;
        if (isTransferLikeDeviceAnalysisFile(fileLike))
            return defaultYScaleForTransfer;
        if (isOutputLikeDeviceAnalysisFile(fileLike))
            return defaultYScaleForOutput;
        return "linear";
    }, [defaultYScaleForCf, defaultYScaleForCv, defaultYScaleForOutput, defaultYScaleForPv, defaultYScaleForTransfer]);
    const activePersistedYScale = useMemo(() => {
        const fileKey = String(effectiveActiveFileId ?? "").trim();
        if (!fileKey)
            return "linear";
        const file = processedData?.find((f: any) => String(f?.fileId ?? "").trim() === fileKey) ?? null;
        if (shouldUseStartupDefaultYScale(file))
            return getDefaultLinearLogYScaleForFile(file);
        return persistedYScaleByFileId[fileKey] ?? getDefaultLinearLogYScaleForFile(file);
    }, [effectiveActiveFileId, getDefaultLinearLogYScaleForFile, persistedYScaleByFileId, processedData]);
    const activeChartYScale = useMemo(() => {
        const fileKey = String(effectiveActiveFileId ?? "").trim();
        if (!fileKey)
            return activePersistedYScale;
        const file = processedData?.find((f: any) => String(f?.fileId ?? "").trim() === fileKey) ?? null;
        if (shouldUseStartupDefaultYScale(file) && chartYScaleByFileId[fileKey] === undefined)
            return getDefaultLinearLogYScaleForFile(file);
        return normalizeChartYScale(chartYScaleByFileId[fileKey] ?? activePersistedYScale);
    }, [activePersistedYScale, chartYScaleByFileId, effectiveActiveFileId, getDefaultLinearLogYScaleForFile, processedData]);
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
    useEffect(() => {
        setVisibleSeriesByFileId((prev) => {
            const normalizedPrev = normalizeVisibleSeriesByFileId(prev);
            const next: Record<string, string[]> = {};
            let changed = false;
            for (const file of Array.isArray(processedData) ? processedData : []) {
                const fileId = String(file?.fileId ?? "").trim();
                if (!fileId)
                    continue;
                const validSeriesIds = new Set<string>((Array.isArray(file?.series) ? file.series : [])
                    .map((series: any) => String(series?.id ?? "").trim())
                    .filter(Boolean));
                const previousSeriesIds = normalizedPrev[fileId] ?? [];
                const filteredSeriesIds = previousSeriesIds.filter((seriesId) => validSeriesIds.has(seriesId));
                next[fileId] = filteredSeriesIds.length ? filteredSeriesIds : Array.from(validSeriesIds);
                if (!changed) {
                    if (filteredSeriesIds.length !== previousSeriesIds.length ||
                        next[fileId].length !== previousSeriesIds.length ||
                        next[fileId].some((seriesId, index) => seriesId !== previousSeriesIds[index])) {
                        changed = true;
                    }
                }
            }
            if (!changed) {
                const prevKeys = Object.keys(normalizedPrev);
                const nextKeys = Object.keys(next);
                changed = prevKeys.length !== nextKeys.length ||
                    nextKeys.some((fileId) => !(fileId in normalizedPrev));
            }
            return changed ? next : prev;
        });
    }, [processedData]);
    useEffect(() => {
        setSeriesLegendLabelsByFileId((prev) => {
            const normalizedPrev = normalizeSeriesLegendLabelsByFileId(prev);
            const next: Record<string, Record<string, string>> = {};
            let changed = false;
            for (const file of Array.isArray(processedData) ? processedData : []) {
                const fileId = String(file?.fileId ?? "").trim();
                if (!fileId)
                    continue;
                const validSeriesIds = new Set<string>((Array.isArray(file?.series) ? file.series : [])
                    .map((series: any) => String(series?.id ?? "").trim())
                    .filter(Boolean));
                const prevLabels = normalizedPrev[fileId] ?? {};
                const nextLabels = Object.fromEntries(Object.entries(prevLabels).filter(([seriesId]) => validSeriesIds.has(seriesId)));
                if (Object.keys(nextLabels).length) {
                    next[fileId] = nextLabels;
                }
                if (!changed) {
                    const prevKeys = Object.keys(prevLabels);
                    const nextKeys = Object.keys(nextLabels);
                    changed = prevKeys.length !== nextKeys.length ||
                        nextKeys.some((seriesId) => prevLabels[seriesId] !== nextLabels[seriesId]);
                }
            }
            if (!changed) {
                const prevFileKeys = Object.keys(normalizedPrev);
                const nextFileKeys = Object.keys(next);
                changed = prevFileKeys.length !== nextFileKeys.length ||
                    nextFileKeys.some((fileId) => !(fileId in normalizedPrev));
            }
            return changed ? next : prev;
        });
    }, [processedData]);
    useEffect(() => {
        setAxisTitleOverridesByFileId((prev) => {
            const normalizedPrev = normalizeAxisTitleOverridesByFileId(prev);
            const next: AxisTitleOverridesByFileId = {};
            let changed = false;
            for (const file of Array.isArray(processedData) ? processedData : []) {
                const fileId = String(file?.fileId ?? "").trim();
                if (!fileId)
                    continue;
                const previousLabels = normalizedPrev[fileId];
                if (previousLabels) {
                    next[fileId] = previousLabels;
                }
            }
            const prevFileKeys = Object.keys(normalizedPrev);
            const nextFileKeys = Object.keys(next);
            changed = prevFileKeys.length !== nextFileKeys.length ||
                nextFileKeys.some((fileId) => !(fileId in normalizedPrev));
            return changed ? next : prev;
        });
    }, [processedData]);
    useEffect(() => {
        if (!editingLegendLabel)
            return;
        editingLegendInputRef.current?.focus();
        editingLegendInputRef.current?.select();
    }, [editingLegendLabel]);
    const resolveYUnitForFile = React.useCallback((fileLike: any): DeviceAnalysisYUnit => {
        const fileKey = String(fileLike?.fileId ?? "").trim();
        const fallbackUnit = resolveDefaultYUnitForFile(fileLike);
        if (!fileKey)
            return fallbackUnit;
        const persistedUnit = persistedYUnitByFileId[fileKey];
        return isYUnitAllowedForFile(persistedUnit, fileLike) ? persistedUnit : fallbackUnit;
    }, [persistedYUnitByFileId]);
    const visibleSeriesKeySet = useMemo(() => {
        const fileId = String(activeFile?.fileId ?? "").trim();
        if (!fileId)
            return new Set<string>();
        const hasConfiguredSeriesIds = Object.prototype.hasOwnProperty.call(visibleSeriesByFileId, fileId);
        const configuredSeriesIds = visibleSeriesByFileId[fileId];
        const fallbackSeriesIds = (Array.isArray(activeFile?.series) ? activeFile.series : [])
            .map((series: any) => String(series?.id ?? "").trim())
            .filter(Boolean);
        return new Set(hasConfiguredSeriesIds ? (configuredSeriesIds ?? []) : fallbackSeriesIds);
    }, [activeFile?.fileId, activeFile?.series, visibleSeriesByFileId]);
    const resolveFirstVisibleSeriesIdForFile = React.useCallback((fileIdRaw: any): string | null => {
        const fileId = String(fileIdRaw ?? "").trim();
        if (!fileId)
            return null;
        const file = processedData?.find((entry: any) => String(entry?.fileId ?? "").trim() === fileId);
        if (!file || !Array.isArray(file?.series))
            return null;
        const hasConfiguredSeriesIds = Object.prototype.hasOwnProperty.call(visibleSeriesByFileId, fileId);
        const configuredSeriesIds = hasConfiguredSeriesIds ? visibleSeriesByFileId[fileId] ?? [] : null;
        const visibleSet = configuredSeriesIds
            ? new Set(configuredSeriesIds.map((seriesId: any) => String(seriesId ?? "").trim()).filter(Boolean))
            : null;
        for (const series of file.series) {
            const seriesId = String(series?.id ?? "").trim();
            if (!seriesId)
                continue;
            if (!visibleSet || visibleSet.has(seriesId))
                return seriesId;
        }
        return null;
    }, [processedData, visibleSeriesByFileId]);
    const visibleSeriesSignature = useMemo(() => Array.from(visibleSeriesKeySet).sort().join("|"), [visibleSeriesKeySet]);
    const ionIoffManualTargetsBySeriesForActiveFile = useMemo(() => {
        const fileId = String(activeFile?.fileId ?? "").trim();
        if (!fileId)
            return {};
        const raw = ionIoffManualTargetsByFileId?.[fileId];
        return raw && typeof raw === "object" ? raw : {};
    }, [activeFile?.fileId, ionIoffManualTargetsByFileId]);
    const ionIoffManualTargets = useMemo(() => {
        if (!focusedSeriesId) {
            return { ionX: "", ioffX: "" };
        }
        return ionIoffManualTargetsBySeriesForActiveFile?.[focusedSeriesId] ?? {
            ionX: "",
            ioffX: "",
        };
    }, [focusedSeriesId, ionIoffManualTargetsBySeriesForActiveFile]);
    const setIonIoffManualTargets = React.useCallback((next: any) => {
        const fileId = String(activeFile?.fileId ?? "").trim();
        const seriesId = String(focusedSeriesId ?? "").trim();
        if (!fileId || !seriesId)
            return;
        setIonIoffManualTargetsByFileId((prev: any) => {
            const prevByFile = prev?.[fileId] ?? {};
            const previousTargets = prevByFile?.[seriesId] ?? { ionX: "", ioffX: "" };
            const resolvedTargets = typeof next === "function" ? next(previousTargets) : next;
            const nextTargets = {
                ionX: String(resolvedTargets?.ionX ?? ""),
                ioffX: String(resolvedTargets?.ioffX ?? ""),
            };
            if (previousTargets.ionX === nextTargets.ionX &&
                previousTargets.ioffX === nextTargets.ioffX) {
                return prev;
            }
            return {
                ...(prev ?? {}),
                [fileId]: {
                    ...prevByFile,
                    [seriesId]: nextTargets,
                },
            };
        });
    }, [activeFile?.fileId, focusedSeriesId, setIonIoffManualTargetsByFileId]);
    const activeSeriesLegendLabelsSignature = useMemo(() => {
        const fileId = String(activeFile?.fileId ?? "").trim();
        if (!fileId)
            return "";
        const labels = seriesLegendLabelsByFileId[fileId] ?? {};
        return Object.keys(labels)
            .sort()
            .map((seriesId) => `${seriesId}:${labels[seriesId]}`)
            .join("|");
    }, [activeFile?.fileId, seriesLegendLabelsByFileId]);
    const toggleVisibleSeries = React.useCallback((seriesId: string) => {
        const normalizedSeriesId = String(seriesId ?? "").trim();
        const fileId = String(activeFile?.fileId ?? "").trim();
        if (!fileId || !normalizedSeriesId)
            return;
        setVisibleSeriesByFileId((prev) => {
            const normalizedPrev = normalizeVisibleSeriesByFileId(prev);
            const file = (Array.isArray(processedData) ? processedData : []).find((entry: any) => String(entry?.fileId ?? "").trim() === fileId);
            const allSeriesIds = (Array.isArray(file?.series) ? file.series : [])
                .map((series: any) => String(series?.id ?? "").trim())
                .filter(Boolean);
            const currentSeriesIds = normalizedPrev[fileId] ?? allSeriesIds;
            const currentSet = new Set(currentSeriesIds);
            if (currentSet.has(normalizedSeriesId)) {
                currentSet.delete(normalizedSeriesId);
            }
            else {
                currentSet.add(normalizedSeriesId);
            }
            return {
                ...normalizedPrev,
                [fileId]: allSeriesIds.filter((id: string) => currentSet.has(id)),
            };
        });
    }, [activeFile?.fileId, processedData]);
    const resolveDisplayLegendLabel = React.useCallback((fileId: unknown, series: any, index: number): string => {
        const normalizedFileId = String(fileId ?? "").trim();
        const normalizedSeriesId = String(series?.id ?? "").trim();
        const customLabel = normalizedFileId && normalizedSeriesId
            ? String(seriesLegendLabelsByFileId?.[normalizedFileId]?.[normalizedSeriesId] ?? "").trim()
            : "";
        if (customLabel)
            return customLabel;
        return resolveDeviceAnalysisSeriesLabel(series, index);
    }, [seriesLegendLabelsByFileId]);
    const beginLegendLabelEdit = React.useCallback((fileId: unknown, series: any, index: number) => {
        const normalizedFileId = String(fileId ?? "").trim();
        const normalizedSeriesId = String(series?.id ?? "").trim();
        if (!normalizedFileId || !normalizedSeriesId)
            return;
        setEditingLegendLabel({ fileId: normalizedFileId, seriesId: normalizedSeriesId });
        setEditingLegendDraft(resolveDisplayLegendLabel(normalizedFileId, series, index));
    }, [resolveDisplayLegendLabel]);
    const cancelLegendLabelEdit = React.useCallback(() => {
        setEditingLegendLabel(null);
        setEditingLegendDraft("");
    }, []);
    const commitLegendLabelEdit = React.useCallback(() => {
        const currentEdit = editingLegendLabel;
        if (!currentEdit)
            return;
        const normalizedFileId = String(currentEdit.fileId ?? "").trim();
        const normalizedSeriesId = String(currentEdit.seriesId ?? "").trim();
        const nextLabel = String(editingLegendDraft ?? "").trim();
        setSeriesLegendLabelsByFileId((prev) => {
            const normalizedPrev = normalizeSeriesLegendLabelsByFileId(prev);
            const currentFileLabels = { ...(normalizedPrev[normalizedFileId] ?? {}) };
            if (nextLabel) {
                currentFileLabels[normalizedSeriesId] = nextLabel;
            }
            else {
                delete currentFileLabels[normalizedSeriesId];
            }
            if (nextLabel === String(normalizedPrev?.[normalizedFileId]?.[normalizedSeriesId] ?? "").trim()) {
                return prev;
            }
            if (Object.keys(currentFileLabels).length) {
                return {
                    ...normalizedPrev,
                    [normalizedFileId]: currentFileLabels,
                };
            }
            const { [normalizedFileId]: _removedFile, ...rest } = normalizedPrev;
            return rest;
        });
        setEditingLegendLabel(null);
        setEditingLegendDraft("");
    }, [editingLegendDraft, editingLegendLabel]);
    const setActiveAxisTitleOverride = React.useCallback((axisKey: "x" | "y", nextLabelRaw: string) => {
        const normalizedFileId = String(activeFile?.fileId ?? "").trim();
        if (!normalizedFileId)
            return;
        const nextLabel = String(nextLabelRaw ?? "").trim();
        setAxisTitleOverridesByFileId((prev) => {
            const normalizedPrev = normalizeAxisTitleOverridesByFileId(prev);
            const currentLabels = { ...(normalizedPrev[normalizedFileId] ?? {}) };
            if (nextLabel) {
                currentLabels[axisKey] = nextLabel;
            }
            else {
                delete currentLabels[axisKey];
            }
            if (nextLabel === String(normalizedPrev?.[normalizedFileId]?.[axisKey] ?? "").trim()) {
                return prev;
            }
            if (Object.keys(currentLabels).length) {
                return {
                    ...normalizedPrev,
                    [normalizedFileId]: currentLabels,
                };
            }
            const { [normalizedFileId]: _removedFile, ...rest } = normalizedPrev;
            return rest;
        });
    }, [activeFile?.fileId]);
    const activeAxisTitleOverrides = useMemo(() => {
        const fileId = String(activeFile?.fileId ?? "").trim();
        return fileId ? axisTitleOverridesByFileId[fileId] ?? {} : {};
    }, [activeFile?.fileId, axisTitleOverridesByFileId]);
    const resolveAxisTitleForOrigin = React.useCallback((file: any, axisKey: "x" | "y") => {
        const fileId = String(file?.fileId ?? "").trim();
        if (!fileId)
            return "";
        return axisTitleOverridesByFileId[fileId]?.[axisKey] ?? "";
    }, [axisTitleOverridesByFileId]);
    const resolveLinearLogYScaleForFile = React.useCallback((fileLike: any): "linear" | "log" => {
        const fileKey = String(fileLike?.fileId ?? "").trim();
        if (shouldUseStartupDefaultYScale(fileLike) && chartYScaleByFileId[fileKey] === undefined)
            return getDefaultLinearLogYScaleForFile(fileLike);
        if (fileKey && chartYScaleByFileId[fileKey] !== undefined)
            return normalizeLinearLogScale(chartYScaleByFileId[fileKey]);
        if (!fileKey)
            return getDefaultLinearLogYScaleForFile(fileLike);
        return persistedYScaleByFileId[fileKey] ?? getDefaultLinearLogYScaleForFile(fileLike);
    }, [chartYScaleByFileId, getDefaultLinearLogYScaleForFile, persistedYScaleByFileId]);
    const resolveYLogCurrentModeForFile = React.useCallback((fileLike: any): "all" | "positive" => {
        const fileKey = String(fileLike?.fileId ?? "").trim();
        if (fileKey && persistedYLogCurrentModeByFileId[fileKey]) {
            return persistedYLogCurrentModeByFileId[fileKey];
        }
        return normalizeLogCurrentMode(axis?.yLogCurrentMode);
    }, [axis?.yLogCurrentMode, persistedYLogCurrentModeByFileId]);
    const resolvedXUnitMeta = useMemo(() => getDeviceAnalysisXUnitMeta(activeFile?.xUnit), [activeFile?.xUnit]);
    const activeYUnit = useMemo(() => resolveYUnitForFile(activeFile), [activeFile, resolveYUnitForFile]);
    const activeYUnitOptions = useMemo(() => resolveAllowedYUnitsForFile(activeFile), [activeFile]);
    const resolvedYUnitMeta = useMemo(() => getDeviceAnalysisYUnitMeta(activeYUnit), [activeYUnit]);
    const originExportContentOptions = useMemo(
        () => resolveOriginExportContentOptionsForFile(activeFile),
        [activeFile],
    );
    const resolvedOriginExportContentKeys = useMemo(
        () => normalizeOriginExportContentKeysForOptions(originExportContentKeys, originExportContentOptions),
        [originExportContentKeys, originExportContentOptions],
    );
    useEffect(() => {
        setOriginExportContentKeys((prev) => {
            const next = normalizeOriginExportContentKeysForOptions(prev, originExportContentOptions);
            if (prev.length === next.length && prev.every((item, index) => item === next[index]))
                return prev;
            return next;
        });
    }, [originExportContentOptions]);
    useEffect(() => {
        setAxisState((prev: any) => {
            const isLinearScale = activeChartYScale === "linear";
            const prevTickMode = String(prev?.yTicks ?? "");
            const nextTicks = isLinearScale
                ? prevTickMode === "auto" || prevTickMode === "nice" || prevTickMode === "step"
                    ? prev.yTicks
                    : "nice"
                : prevTickMode === "auto" || prevTickMode === "decades"
                    ? prev.yTicks
                    : "decades";
            if (prev?.yScale === activeChartYScale && prev?.yTicks === nextTicks)
                return prev;
            return normalizePlotAxisSettings({
                ...prev,
                yScale: activeChartYScale,
                yTicks: nextTicks,
            }, prev);
        });
    }, [activeChartYScale]);
    useEffect(() => {
        if (!plotAxisSettingsLoaded)
            return;
        if (!plotAxisSettingsDirtyRef.current)
            return;
        const normalized = normalizePlotAxisSettings(axis);
        const serialized = JSON.stringify(normalized);
        if (persistedPlotAxisSettingsRef.current === serialized) {
            plotAxisSettingsDirtyRef.current = false;
            return;
        }
        plotAxisSettingsDirtyRef.current = false;
        persistedPlotAxisSettingsRef.current = serialized;
        const timeoutId = window.setTimeout(() => {
            apiService
                .updateDeviceAnalysisSettings({
                    analysisPlotAxisSettings: normalized,
                })
                .catch(() => { });
        }, 250);
        return () => window.clearTimeout(timeoutId);
    }, [axis, plotAxisSettingsLoaded]);
    const hasManualAxisOverride = useMemo(() => {
        const hasManualXRange =
            parseOptionalNumber(axis?.xMin) !== null || parseOptionalNumber(axis?.xMax) !== null;
        const hasManualYRange =
            parseOptionalNumber(axis?.yMin) !== null || parseOptionalNumber(axis?.yMax) !== null;
        const hasManualXTickMode = String(axis?.xTicks ?? "auto") !== "auto";
        const hasManualYTickMode = String(axis?.yTicks ?? "auto") !== "auto";
        const hasManualXStep = parseOptionalNumber(axis?.xStep) !== null;
        const hasManualYStep = parseOptionalNumber(axis?.yStep) !== null;
        const manualYDecadeStep = parseOptionalNumber(axis?.yDecadeStep);
        const hasManualYDecadeStep =
            manualYDecadeStep !== null && Math.round(manualYDecadeStep) !== 1;
        const manualXTickCount = parseOptionalNumber(axis?.xTickCount);
        const hasManualXTickCount =
            manualXTickCount !== null && Math.round(manualXTickCount) !== 6;
        const manualYTickCount = parseOptionalNumber(axis?.yTickCount);
        const hasManualYTickCount =
            manualYTickCount !== null && Math.round(manualYTickCount) !== 6;
        const hasManualGrid = axis?.showGrid === false;
        const hasManualMajorTicks = axis?.showMajorTicks === false;
        const hasManualMinorTicks = axis?.showMinorTicks === false;
        const manualMinorTickCount = parseOptionalNumber(axis?.minorTickCount);
        const hasManualMinorTickCount =
            manualMinorTickCount !== null && Math.round(manualMinorTickCount) !== 1;
        const manualTickFont = parseOptionalNumber(axis?.tickLabelFontSize);
        const manualTitleFont = parseOptionalNumber(axis?.axisTitleFontSize);
        const hasManualTickFont = manualTickFont !== null && Math.round(manualTickFont) !== 18;
        const hasManualTitleFont = manualTitleFont !== null && Math.round(manualTitleFont) !== 22;
        const manualLegendFont = parseOptionalNumber(axis?.legendFontSize);
        const hasManualLegendFont = manualLegendFont !== null && Math.round(manualLegendFont) !== 18;
        const hasManualOriginTickLabelOffset = parseOptionalNumber(axis?.originTickLabelOffset) !== null;
        const hasManualOriginAxisTitleGap = parseOptionalNumber(axis?.originAxisTitleGap) !== null;
        return hasManualXRange ||
            hasManualYRange ||
            hasManualXTickMode ||
            hasManualYTickMode ||
            hasManualXStep ||
            hasManualYStep ||
            hasManualYDecadeStep ||
            hasManualXTickCount ||
            hasManualYTickCount ||
            hasManualGrid ||
            hasManualMajorTicks ||
            hasManualMinorTicks ||
            hasManualMinorTickCount ||
            hasManualTickFont ||
            hasManualTitleFont ||
            hasManualLegendFont ||
            hasManualOriginTickLabelOffset ||
            hasManualOriginAxisTitleGap;
    }, [
        axis?.xMax,
        axis?.xMin,
        axis?.xStep,
        axis?.xTickCount,
        axis?.xTicks,
        axis?.yDecadeStep,
        axis?.yMax,
        axis?.yMin,
        axis?.yStep,
        axis?.yTickCount,
        axis?.yTicks,
        axis?.showGrid,
        axis?.showMajorTicks,
        axis?.showMinorTicks,
        axis?.minorTickCount,
        axis?.tickLabelFontSize,
        axis?.axisTitleFontSize,
        axis?.legendFontSize,
        axis?.originTickLabelOffset,
        axis?.originAxisTitleGap,
    ]);
    const {
        clearOriginSeriesSelectionForFile,
        curveExportMode: resolvedCurveExportMode,
        getSelectedOriginSeriesKeySetForFile,
        handleExportOriginZip,
        handleOpenInOrigin,
        replaceMatchingOriginSeriesAcrossFiles,
        replaceOriginCanvasSelection,
        originExportMode: resolvedOriginExportMode,
        scopedOriginCanvasKeySet,
        selectAllOriginSeriesForFile,
        selectedOriginCanvasKeySet,
        selectedOriginSeriesCountByFile,
        selectedOriginSeriesTotalCount,
        toggleOriginCanvasSelection,
        toggleOriginSeriesSelectionForFile,
    } = useOriginCanvasExport({
        activeFile,
        canvasExportScope: originCanvasExportScope,
        curveExportMode: originCurveExportMode,
        filteredCanvasKind: originFilteredCanvasKind,
        effectiveActiveFileId,
        getDesktopOriginBridge,
        isWindowsDesktopShell,
        originChartXRangeRef,
        originChartYRangeRef,
        originExportMode,
        originExportContentKeys: resolvedOriginExportContentKeys,
        originAxisSettings: axis,
        originOpenPlotOptions,
        processedData,
        resolveCurveLabelForSeries: (file, series, index) => resolveDisplayLegendLabel(file?.fileId, series, index),
        resolveAxisTitleForFile: resolveAxisTitleForOrigin,
        resolveYScaleForFile: resolveLinearLogYScaleForFile,
        resolveYLogCurrentModeForFile,
        resolveYUnitForFile,
        showToast,
        t,
        tLoose,
        visibleOriginCanvasIds: overviewVisibleFileIds,
    });
    const selectedCanvasCount = selectedOriginCanvasKeySet?.size ?? 0;
    const isExportPaneActive = resultsTab === "export";
    const isManualCanvasScope = isExportPaneActive && originCanvasExportScope === "selected";
    const isExportListCanvasSelectionMode = isManualCanvasScope;
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
    const exportSelectionSummary = resolvedOriginExportMode === "merged"
        ? t("da_origin_collection_summary", {
            curves: selectedOriginSeriesTotalCount,
            files: selectedCanvasCount,
        })
        : separateCanvasScopeSummary;
    const scopedOriginCanvasIds = useMemo(
        () => Array.from(scopedOriginCanvasKeySet ?? new Set<string>()),
        [scopedOriginCanvasKeySet],
    );
    const originCurveExportOptions = useMemo<OriginCurveExportSeriesOption[]>(() => {
        // Curve candidates come from the current export scope, so adding files can add matching legends.
        const scopedIds = scopedOriginCanvasKeySet ?? new Set<string>();
        const optionMap = new Map<string, OriginCurveExportSeriesOption>();
        for (const file of Array.isArray(processedData) ? processedData : []) {
            const fileId = String(file?.fileId ?? "").trim();
            if (!fileId || !scopedIds.has(fileId)) continue;
            const seriesList = Array.isArray(file?.series) ? file.series : [];
            for (let index = 0; index < seriesList.length; index += 1) {
                const series = seriesList[index];
                const seriesId = String(series?.id ?? "").trim();
                if (!seriesId) continue;
                const tokens = resolveOriginSeriesMatchTokens(series);
                const key = tokens[0] ?? `series:${fileId}:${seriesId}`;
                if (optionMap.has(key)) continue;
                optionMap.set(key, {
                    key,
                    label: resolveDisplayLegendLabel(fileId, series, index),
                    sourceFileId: fileId,
                    sourceSeriesId: seriesId,
                });
            }
        }
        return Array.from(optionMap.values());
    }, [processedData, resolveDisplayLegendLabel, scopedOriginCanvasKeySet]);
    const selectedOriginCurveExportOptionKeySet = useMemo(() => {
        if (resolvedCurveExportMode === "all") {
            return new Set(originCurveExportOptions.map((option) => option.key));
        }
        if (Array.isArray(originCurveExportSelectedKeys)) {
            return new Set(originCurveExportSelectedKeys);
        }
        const scopedIds = scopedOriginCanvasKeySet ?? new Set<string>();
        const selectedKeys = new Set<string>();
        for (const file of Array.isArray(processedData) ? processedData : []) {
            const fileId = String(file?.fileId ?? "").trim();
            if (!fileId || !scopedIds.has(fileId)) continue;
            const selectedSeriesKeys = getSelectedOriginSeriesKeySetForFile(file);
            const seriesList = Array.isArray(file?.series) ? file.series : [];
            for (const series of seriesList) {
                const seriesId = String(series?.id ?? "").trim();
                if (!seriesId || !selectedSeriesKeys.has(seriesId)) continue;
                const tokens = resolveOriginSeriesMatchTokens(series);
                selectedKeys.add(tokens[0] ?? `series:${fileId}:${seriesId}`);
            }
        }
        return selectedKeys;
    }, [
        getSelectedOriginSeriesKeySetForFile,
        originCurveExportSelectedKeys,
        originCurveExportOptions,
        processedData,
        resolvedCurveExportMode,
        scopedOriginCanvasKeySet,
    ]);
    useEffect(() => {
        if (resolvedCurveExportMode !== "select") return;
        if (!Array.isArray(originCurveExportSelectedKeys)) return;
        // Keep sync one-way: legend template -> files in export scope -> per-file curve checkboxes.
        const selectedKeySet = new Set(originCurveExportSelectedKeys);
        replaceMatchingOriginSeriesAcrossFiles({
            fileIds: scopedOriginCanvasIds,
            sourceSeriesRefs: originCurveExportOptions
                .filter((option) => selectedKeySet.has(option.key))
                .map((option) => ({
                    fileId: option.sourceFileId,
                    seriesId: option.sourceSeriesId,
                })),
        });
    }, [
        originCurveExportOptions,
        originCurveExportSelectedKeys,
        replaceMatchingOriginSeriesAcrossFiles,
        resolvedCurveExportMode,
        scopedOriginCanvasIds,
    ]);
    const selectedExportCanvasFiles = useMemo(() => (Array.isArray(processedData) ? processedData : []).filter((file: any) => {
        const fileId = String(file?.fileId ?? "").trim();
        return Boolean(fileId) && selectedOriginCanvasKeySet.has(fileId);
    }), [processedData, selectedOriginCanvasKeySet]);
    const hasMixedExportYScales = useMemo(() => {
        const scaleSet = new Set(selectedExportCanvasFiles.map((file: any) => resolveLinearLogYScaleForFile(file)));
        return scaleSet.size > 1;
    }, [resolveLinearLogYScaleForFile, selectedExportCanvasFiles]);
    const exportListEntries = useMemo(() => {
        const selectedFileIds = resolvedOriginExportMode === "merged" && !isExportListCanvasSelectionMode && resolvedCurveExportMode === "select"
            ? scopedOriginCanvasKeySet ?? new Set<string>()
            : selectedOriginCanvasKeySet ?? new Set<string>();
        return (Array.isArray(processedData) ? processedData : [])
            .map((file: any) => {
            const fileId = String(file?.fileId ?? "");
            if (!fileId)
                return null;
            const selectedCount = Number(selectedOriginSeriesCountByFile?.[fileId] ?? 0);
            if (resolvedOriginExportMode === "merged" && !isExportListCanvasSelectionMode) {
                if ((resolvedCurveExportMode !== "select" && selectedCount <= 0) || !selectedFileIds.has(fileId))
                    return null;
            }
            else if (!isExportListCanvasSelectionMode && !selectedFileIds.has(fileId)) {
                return null;
            }
            const selectedSeriesKeySet = getSelectedOriginSeriesKeySetForFile(file);
            const series = (Array.isArray(file?.series) ? file.series : [])
                .map((series: any, index: number) => {
                const key = String(series?.id ?? "");
                if (!key)
                    return null;
                return {
                    key,
                    label: resolveDisplayLegendLabel(fileId, series, index),
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
        resolveDisplayLegendLabel,
        resolvedCurveExportMode,
        resolvedOriginExportMode,
        scopedOriginCanvasKeySet,
        selectedOriginCanvasKeySet,
        selectedOriginSeriesCountByFile,
    ]);
    const exportListEmptyText = resolvedOriginExportMode === "merged"
        ? t("da_origin_collection_empty")
        : t("da_origin_export_selection_empty");
    const exportEntryActionLabel = resolvedOriginExportMode === "merged"
        ? t("da_origin_export_list_remove_merged")
        : t("da_origin_export_list_remove_separate");
    const handleRemoveOriginExportEntry = React.useCallback((fileId: string) => {
        const targetFileId = String(fileId ?? "").trim();
        if (!targetFileId) return;

        if (isManualCanvasScope) {
            toggleOriginCanvasSelection(targetFileId);
            return;
        }

        const nextSelectedFileIds = Array.from(scopedOriginCanvasKeySet ?? new Set<string>())
            .filter((item) => item !== targetFileId);
        setOriginCanvasExportScope("selected");
        replaceOriginCanvasSelection(nextSelectedFileIds);
    }, [
        isManualCanvasScope,
        replaceOriginCanvasSelection,
        scopedOriginCanvasKeySet,
        toggleOriginCanvasSelection,
    ]);
    const handleOriginExportModeChange = React.useCallback((nextMode: DeviceAnalysisOriginExportMode) => {
        setOriginExportMode(nextMode);
        apiService
            .updateDeviceAnalysisSettings({
            originExportModeDefault: nextMode,
        })
            .catch(() => { });
    }, []);
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
    useEffect(() => {
        if (!transferMetricsApplicable && resultsTab === "rc") {
            setResultsTab("metrics");
        }
    }, [resultsTab, transferMetricsApplicable]);
    const ssHeuristicApplicable = transferMetricsApplicable;
    const gmMode = "x";
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
        const derivToken = xToken;
        const fixedToken = legendToken;
        const kind = derivToken === "vg" ? "gm" : derivToken === "vd" ? "gds" : "derivative";
        const kindTitle = kind === "gm"
            ? t("da_chart_derivative_label_gm")
            : kind === "gds"
                ? t("da_chart_derivative_label_gds")
                : t("da_chart_derivative_label_generic");
        const kindSymbol = kind === "gm" ? "gm" : kind === "gds" ? "gds" : null;
        const derivSymbol = varTokenToSymbol(derivToken);
        const fixedSymbol = varTokenToSymbol(fixedToken);
        const xFormulaLabel = stripSpecificAxisUnitSuffix(xDisplay, activeFile?.xUnit);
        const derivShortLabel = derivSymbol
            ? `dI/d${derivSymbol}`
            : `dI/d${xFormulaLabel}`;
        const formula = (() => {
            if (derivSymbol && fixedSymbol) {
                const base = `\u2202I/\u2202${derivSymbol} |${fixedSymbol}`;
                return kindSymbol ? `${kindSymbol} = ${base}` : base;
            }
            if (derivSymbol) {
                const fixedFallback = legendDisplay;
                const base = `\u2202I/\u2202${derivSymbol} |${fixedFallback}`;
                return kindSymbol ? `${kindSymbol} = ${base}` : base;
            }
            return `dI/d${xFormulaLabel} (per curve)`;
        })();
        const plotLabel = `${kindTitle} (${formula})`;
        const denomUnit = derivSymbol ? "V" : "X";
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
            metricSymbol,
            summaryLabel,
            metricHeader: `max|${metricSymbol}|`,
            xDisplay,
            xFormulaLabel,
            xSymbol,
        };
    }, [activeFile, t]);
    const primaryPlotLabel = useMemo(() => {
        const curveType = String(activeFile?.curveType ?? "").trim().toLowerCase();
        if (curveType === "pv")
            return "P-V";
        if (curveType === "cv")
            return "C-V";
        if (curveType === "cf")
            return "C-f";
        return "I-V";
    }, [activeFile?.curveType]);
    const pointsBySeriesId = useMemo(() => {
        if (!activeFile?.fileId || !activeFile?.series?.length)
            return new Map();
        const startedAt = getDeviceAnalysisPerfNow();
        const cache = getFileCache(activeFile.fileId, activeFile);
        if (!cache)
            return new Map();
        const map = cache.pointsBySeriesId;
        let builtSeriesCount = 0;
        let builtPointCount = 0;
        for (const s of activeFile.series) {
            if (map.has(s.id))
                continue;
            const xArr = activeFile?.xGroups?.[s.groupIndex];
            const points = buildPoints(xArr, s.y);
            builtSeriesCount += 1;
            builtPointCount += points.length;
            map.set(s.id, points);
        }
        if (builtSeriesCount > 0) {
            logDeviceAnalysisPerf("analysis:active-points", {
                fileId: activeFile.fileId,
                fileName: activeFile.fileName ?? null,
                builtPointCount,
                builtSeriesCount,
                durationMs: getDeviceAnalysisPerfNow() - startedAt,
                totalSeriesCount: activeFile.series.length,
            });
        }
        return map;
    }, [activeFile, getFileCache]);
    const manualBySeriesForActiveFile = useMemo(() => activeFile?.fileId ? ssManualRanges?.[activeFile.fileId] ?? {} : {}, [activeFile?.fileId, ssManualRanges]);
    const manualRangeSignature = useMemo(() => buildSeriesRangeSignature(manualBySeriesForActiveFile), [manualBySeriesForActiveFile]);
    const ionIoffManualTargetsSignature = useMemo(() => buildSeriesCurrentTargetsSignature(ionIoffManualTargetsBySeriesForActiveFile), [ionIoffManualTargetsBySeriesForActiveFile]);
    const analysisCacheKey = useMemo(() => {
        const areaToken = area && Number.isFinite(area) && area > 0
            ? String(normalizeFloat(area))
            : "";
        const parts = [
            `analysis:${ANALYSIS_CACHE_VERSION}`,
            `gm:${gmMode}`,
            `current:${ionIoffMethod}`,
            `ss:${ssMethod}`,
        ];
        if (ionIoffMethod === "manual") {
            parts.push(`xFactor:${toStableNumericToken(resolvedXUnitMeta.factor)}`);
        }
        parts.push(`area:${areaToken}`);
        return parts.join("::");
    }, [
        area,
        ionIoffMethod,
        resolvedXUnitMeta.factor,
        ssMethod,
    ]);
    const activeFileCache = useMemo(() => activeFile?.fileId ? getFileCache(activeFile.fileId, activeFile) : null, [activeFile, getFileCache]);
    const detailAnalysisKey = useMemo(() => `${effectiveActiveFileId ?? "no-file"}::${analysisCacheKey}`, [analysisCacheKey, effectiveActiveFileId]);
    const gmModeKey = "x";
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
        const map = activeFileCache?.gmByMode?.x ?? new Map();
        if (!map.has(series.id)) {
            map.set(series.id, computeCentralDerivative(points));
        }
        return map.get(series.id) ?? [];
    }, [activeFileCache, pointsBySeriesId]);
    const getSeriesSsDiagnostics = React.useCallback((series: any) => {
        if (!transferMetricsApplicable)
            return [];
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
    }, [activeFileCache, pointsBySeriesId, transferMetricsApplicable]);
    const getSeriesSsAuto = React.useCallback((series: any) => {
        if (!transferMetricsApplicable)
            return {
                strict: { ok: false, reason: "not_transfer_curve" },
                suggested: { ok: false, reason: "not_transfer_curve" },
            };
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
    }, [activeFileCache, pointsBySeriesId, transferMetricsApplicable]);
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
        const currentManualTargets = ionIoffManualTargetsBySeriesForActiveFile?.[series.id] ?? null;
        const points = pointsBySeriesId.get(series.id) ?? [];
        const gm = getSeriesGm(series);
        const ssDiagnostics = getSeriesSsDiagnostics(series);
        const ssAuto = getSeriesSsAuto(series);
        const j = getSeriesJ(series);
        const baseMetricsCache = activeFileCache?.baseMetricsBySeriesId ?? new Map();
        const gmMetricsCache = activeFileCache?.gmMetricsByMode?.[gmModeKey] ?? new Map();
        const manualFitCache = activeFileCache?.ssManualFitBySeriesId ?? new Map();
        let base = ionIoffMethod === "auto" ? baseMetricsCache.get(series.id) ?? null : null;
        if (base && !canUseCachedBaseCurrent(base, transferMetricsApplicable)) {
            baseMetricsCache.delete(series.id);
            base = null;
        }
        if (!base) {
            base = {
                ...computeBaseCurrentMetrics({
                    manualTargets: ionIoffMethod === "manual"
                        ? {
                            ionX: Number.isFinite(Number(currentManualTargets?.ionX))
                                ? Number(currentManualTargets?.ionX) / resolvedXUnitMeta.factor
                                : null,
                            ioffX: Number.isFinite(Number(currentManualTargets?.ioffX))
                                ? Number(currentManualTargets?.ioffX) / resolvedXUnitMeta.factor
                                : null,
                        }
                        : null,
                    method: ionIoffMethod,
                    points,
                    sourceFile: activeFile,
                }),
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
        const vthFits = transferMetricsApplicable ? computeVthSqrtFits(points) : [];
        const electronVthFit = vthFits.find((fit) => fit.branch === "electron") ?? null;
        const holeVthFit = vthFits.find((fit) => fit.branch === "hole") ?? null;
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
            if (!transferMetricsApplicable) {
                const fit = { ok: false, reason: "not_transfer_curve" };
                return {
                    method: ssMethod === "manual" ? "manual" : "auto",
                    confidence: "fail",
                    reason: "not_transfer_curve",
                    fit,
                    rangeSource: null,
                    xAt: null,
                };
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
                thresholdVoltage: electronVthFit?.vth ?? holeVthFit?.vth ?? null,
                thresholdVoltageElectron: electronVthFit?.vth ?? null,
                thresholdVoltageHole: holeVthFit?.vth ?? null,
                vthFits,
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
                currentMethod: base.method ?? ionIoffMethod,
                currentCandidateWindows: base.candidateWindows ?? [],
                ionWindow: base.ionWindow ?? null,
                ioffWindow: base.ioffWindow ?? null,
                jon: areaValue !== null && base.ion !== null ? base.ion / areaValue : null,
                joff: areaValue !== null && base.ioff !== null ? base.ioff / areaValue : null,
            },
        };
    }, [activeFile, activeFileCache, areaValue, getSeriesGm, getSeriesJ, getSeriesSsAuto, getSeriesSsDiagnostics, gmModeKey, ionIoffManualTargetsBySeriesForActiveFile, ionIoffMethod, manualBySeriesForActiveFile, pointsBySeriesId, resolvedXUnitMeta.factor, ssMethod, transferMetricsApplicable]);
    const progressiveAnalysisHandleRef = useRef<ProgressiveAnalysisHandle | null>(null);
    const progressiveAnalysisJobIdRef = useRef(0);
    const [detailAnalysisState, setDetailAnalysisState] = useState<ProgressiveAnalysisState>(() => ({
        key: "",
        map: new Map(),
        completedCount: 0,
        totalCount: 0,
        pending: false,
    }));
    const [curveProbeXInput, setCurveProbeXInput] = useState("");
    const [curveProbeMode, setCurveProbeMode] = useState<"linear" | "log">("linear");
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
        const finishAnalysisPerf = startDeviceAnalysisPerf("analysis:detail-file", {
            fileId: activeFile?.fileId ?? null,
            fileName: activeFile?.fileName ?? null,
            seriesCount: totalCount,
        });
        const cached = activeFileCache?.analysisByConfigKey?.get(analysisCacheKey) ?? null;
        if (cached) {
            setDetailAnalysisState({
                key: detailAnalysisKey,
                map: cached,
                completedCount: totalCount,
                totalCount,
                pending: false,
            });
            finishAnalysisPerf({
                cached: true,
                completedCount: totalCount,
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
            const chunkStartedAt = getDeviceAnalysisPerfNow();
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
            if (processed > 0) {
                logDeviceAnalysisPerf("analysis:detail-chunk", {
                    fileId: activeFile?.fileId ?? null,
                    fileName: activeFile?.fileName ?? null,
                    completedCount: workingMap.size,
                    durationMs: getDeviceAnalysisPerfNow() - chunkStartedAt,
                    pendingCount: queue.length,
                    processedCount: processed,
                    totalCount,
                });
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
                finishAnalysisPerf({
                    cached: false,
                    completedCount: workingMap.size,
                });
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
            finishAnalysisPerf({
                cached: false,
                completedCount: workingMap.size,
            });
        }
        return cancelScheduled;
    }, [activeFile, activeFileCache, analysisCacheKey, buildSeriesAnalysisEntry, cacheAnalysisMap, detailAnalysisKey]);
    const detailAnalysisBySeriesId = useMemo(() => {
        if (detailAnalysisState.key === detailAnalysisKey) {
            return detailAnalysisState.map;
        }
        return activeFileCache?.analysisByConfigKey?.get(analysisCacheKey) ?? new Map();
    }, [activeFileCache, analysisCacheKey, detailAnalysisKey, detailAnalysisState.key, detailAnalysisState.map]);
    const previousPerSeriesAnalysisRef = useRef<{
        fileId: string;
        ionIoffMethod: string;
        ssMethod: string;
        xFactorToken: string;
        areaToken: string;
        manualCurrentSignature: string;
        manualRangeSignature: string;
        currentTargetsBySeries: Record<string, any>;
        manualRangesBySeries: Record<string, any>;
    } | null>(null);
    useEffect(() => {
        const fileId = String(activeFile?.fileId ?? "").trim();
        const snapshot = {
            fileId,
            ionIoffMethod,
            ssMethod,
            xFactorToken: toStableNumericToken(resolvedXUnitMeta.factor),
            areaToken: areaValue !== null ? toStableNumericToken(areaValue) : "",
            manualCurrentSignature: ionIoffManualTargetsSignature,
            manualRangeSignature,
            currentTargetsBySeries: ionIoffManualTargetsBySeriesForActiveFile,
            manualRangesBySeries: manualBySeriesForActiveFile,
        };
        const previous = previousPerSeriesAnalysisRef.current;
        previousPerSeriesAnalysisRef.current = snapshot;
        if (!fileId || !previous) {
            return;
        }
        const globalContextChanged = previous.fileId !== snapshot.fileId ||
            previous.ionIoffMethod !== snapshot.ionIoffMethod ||
            previous.ssMethod !== snapshot.ssMethod ||
            previous.xFactorToken !== snapshot.xFactorToken ||
            previous.areaToken !== snapshot.areaToken;
        if (globalContextChanged) {
            return;
        }
        if (previous.manualCurrentSignature === snapshot.manualCurrentSignature &&
            previous.manualRangeSignature === snapshot.manualRangeSignature) {
            return;
        }
        const changedCurrentSeriesIds = collectChangedSeriesIds(previous.currentTargetsBySeries, snapshot.currentTargetsBySeries, ["ionX", "ioffX"]);
        const changedSsSeriesIds = collectChangedSeriesIds(previous.manualRangesBySeries, snapshot.manualRangesBySeries, ["x1", "x2"]);
        const changedSeriesIds = Array.from(new Set([...changedCurrentSeriesIds, ...changedSsSeriesIds]));
        if (!changedSeriesIds.length) {
            return;
        }
        setDetailAnalysisState((prev) => {
            if (prev.key !== detailAnalysisKey || prev.pending) {
                return prev;
            }
            const nextMap = new Map(prev.map);
            let didChange = false;
            for (const seriesId of changedSeriesIds) {
                const series = activeFile?.series?.find((entry: any) => entry?.id === seriesId);
                if (!series) {
                    continue;
                }
                const entry = buildSeriesAnalysisEntry(series);
                if (!entry) {
                    continue;
                }
                nextMap.set(seriesId, entry);
                didChange = true;
            }
            if (!didChange) {
                return prev;
            }
            if (activeFileCache?.analysisByConfigKey?.has(analysisCacheKey)) {
                activeFileCache.analysisByConfigKey.set(analysisCacheKey, new Map(nextMap));
            }
            return {
                ...prev,
                map: nextMap,
            };
        });
    }, [activeFile, activeFileCache, analysisCacheKey, areaValue, buildSeriesAnalysisEntry, detailAnalysisKey, ionIoffManualTargetsBySeriesForActiveFile, ionIoffManualTargetsSignature, ionIoffMethod, manualBySeriesForActiveFile, manualRangeSignature, resolvedXUnitMeta.factor, ssMethod]);
    const analysisBySeriesId = useMemo(() => detailAnalysisBySeriesId, [detailAnalysisBySeriesId]);
    const ssComputedApplicable = useMemo(() => {
        if (!transferMetricsApplicable)
            return false;
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
    }, [activeFile?.series, analysisBySeriesId, transferMetricsApplicable]);
    const gmApplicable = useMemo(() => transferMetricsApplicable || outputMetricsApplicable, [outputMetricsApplicable, transferMetricsApplicable]);
    const vthApplicable = transferMetricsApplicable;
    const ssApplicable = ssHeuristicApplicable || ssComputedApplicable;
    const effectivePlotType = useMemo(() => {
        if (plotType === "j" && !area)
            return "iv";
        if (plotType === "gm" && !gmApplicable)
            return "iv";
        if (plotType === "vth" && !vthApplicable)
            return "iv";
        if (plotType === "ss" && !ssApplicable)
            return "iv";
        return plotType;
    }, [area, gmApplicable, plotType, ssApplicable, vthApplicable]);
    const plotSeriesCacheKey = useMemo(() => `${analysisCacheKey}::plot:${effectivePlotType}::labels:${activeSeriesLegendLabelsSignature}`, [activeSeriesLegendLabelsSignature, analysisCacheKey, effectivePlotType]);
    const currentManualBiasApplicable = transferMetricsApplicable && effectivePlotType === "iv" && ionIoffMethod === "manual" && Boolean(focusedSeriesId);
    const handlePlotTypeChange = React.useCallback((nextPlotType: PlotTypeOption) => {
        startTransition(() => {
            setPlotType(nextPlotType);
        });
    }, []);
    const plotYFactor = useMemo(() => effectivePlotType === "vth"
        ? Math.sqrt(Math.max(0, resolvedYUnitMeta.factor))
        : resolvedYUnitMeta.factor, [effectivePlotType, resolvedYUnitMeta.factor]);
    const plotXFactor = useMemo(() => resolvedXUnitMeta.factor, [resolvedXUnitMeta.factor]);
    const gmSecondDerivativeUnitLabel = useMemo(() => {
        const conductanceUnitLabel = toConductanceUnitLabel(resolvedYUnitMeta.label, gmUi.denomUnit);
        return toSecondDerivativeUnitLabel(conductanceUnitLabel, resolvedXUnitMeta.label);
    }, [gmUi.denomUnit, resolvedXUnitMeta.label, resolvedYUnitMeta.label]);
    const gmSecondDerivativeAxisLabel = useMemo(() => {
        const xToken = gmUi.xSymbol || gmUi.xFormulaLabel || "x";
        return `d(${gmUi.metricSymbol})/d${xToken}`;
    }, [gmUi.metricSymbol, gmUi.xFormulaLabel, gmUi.xSymbol]);
    const plotYUnitLabel = useMemo(() => {
        if (effectivePlotType === "gm")
            return toConductanceUnitLabel(resolvedYUnitMeta.label, gmUi.denomUnit);
        if (effectivePlotType === "vth")
            return `sqrt(|${resolvedYUnitMeta.label || "I"}|)`;
        if (effectivePlotType === "j")
            return `${resolvedYUnitMeta.label}/Area`;
        // SS tab main plot is I-V in log(|I|), so keep current unit here.
        return resolvedYUnitMeta.label;
    }, [resolvedYUnitMeta.label, effectivePlotType, gmUi.denomUnit]);
    useLayoutEffect(() => {
        const nextFocusedSeriesId = resolveFirstVisibleSeriesIdForFile(activeFile?.fileId);
        if (!nextFocusedSeriesId) {
            if (focusedSeriesId !== null) {
                setFocusedSeriesId(null);
            }
            return;
        }
        if (nextFocusedSeriesId !== focusedSeriesId) {
            setFocusedSeriesId(nextFocusedSeriesId);
        }
    }, [activeFile?.fileId, focusedSeriesId, resolveFirstVisibleSeriesIdForFile]);
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
            return { iv: [], gm: [], ss: [], vth: [], j: [] };
        }
        const cache = getFileCache(activeFile.fileId, activeFile);
        const cached = cache?.plotSeriesByConfigKey?.get(plotSeriesCacheKey);
        if (cached) {
            return cached;
        }
        const base = activeFile.series.map((series: any, index: number) => {
            const label = resolveDisplayLegendLabel(activeFile.fileId, series, index);
            return {
                ...series,
                color: resolveSeriesChartColor(series, index),
                name: label,
                tooltipName: buildTooltipSeriesName(label, series?.id),
                data: pointsBySeriesId.get(series.id) ?? [],
            };
        });
        const computed = {
            iv: base,
            ss: base,
            vth: effectivePlotType === "vth"
                ? activeFile.series.map((series: any, index: number) => {
                    const label = resolveDisplayLegendLabel(activeFile.fileId, series, index);
                    return {
                        ...series,
                        color: resolveSeriesChartColor(series, index),
                        name: label,
                        tooltipName: buildTooltipSeriesName(label, series?.id),
                        data: toSqrtCurrentPoints(pointsBySeriesId.get(series.id) ?? []),
                    };
                })
                : [],
            gm: effectivePlotType === "gm"
                ? activeFile.series.map((series: any, index: number) => {
                    const label = resolveDisplayLegendLabel(activeFile.fileId, series, index);
                    return {
                        ...series,
                        color: resolveSeriesChartColor(series, index),
                        name: label,
                        tooltipName: buildTooltipSeriesName(label, series?.id),
                        data: getSeriesGm(series),
                    };
                })
                : [],
            j: effectivePlotType === "j"
                ? activeFile.series.map((series: any, index: number) => {
                    const label = resolveDisplayLegendLabel(activeFile.fileId, series, index);
                    return {
                        ...series,
                        color: resolveSeriesChartColor(series, index),
                        name: label,
                        tooltipName: buildTooltipSeriesName(label, series?.id),
                        data: getSeriesJ(series) ?? [],
                    };
                })
                : [],
        };
        if (cache?.plotSeriesByConfigKey) {
            cache.plotSeriesByConfigKey.set(plotSeriesCacheKey, computed);
        }
        return computed;
    }, [activeFile, effectivePlotType, getFileCache, getSeriesGm, getSeriesJ, plotSeriesCacheKey, pointsBySeriesId, resolveDisplayLegendLabel]);
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
    const focusedSeriesLabel = useMemo(() => {
        if (!focusedSeriesId || !activeFile?.fileId)
            return null;
        const seriesIndex = (activeFile?.series ?? []).findIndex((series: any) => series?.id === focusedSeriesId);
        const focusedSeries = seriesIndex >= 0 ? activeFile.series[seriesIndex] : null;
        if (!focusedSeries)
            return null;
        return resolveDisplayLegendLabel(activeFile.fileId, focusedSeries, seriesIndex);
    }, [activeFile?.fileId, activeFile?.series, focusedSeriesId, resolveDisplayLegendLabel]);
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
        if (kind === "manual") {
            return { fill: "#60a5fa", fillOpacity: 0.08, stroke: "#60a5fa", strokeOpacity: 0.45 };
        }
        return { fill: "#60a5fa", fillOpacity: 0.08, stroke: "#60a5fa", strokeOpacity: 0.45 };
    }, [focusedSsOverlay?.kind]);
    const focusedCurrentOverlays = useMemo(() => {
        if (!transferMetricsApplicable)
            return [];
        if (ionIoffMethod === "manual")
            return [];
        const metrics = focusedAnalysis?.metrics ?? null;
        const overlays: ChartHighlightOverlay[] = [];
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
    }, [focusedAnalysis?.metrics, ionIoffMethod, transferMetricsApplicable]);
    const currentOverlaysForPlot = useMemo(() => effectivePlotType === "iv" ? focusedCurrentOverlays : [], [effectivePlotType, focusedCurrentOverlays]);
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
            return getChartColor(0);
        return getChartColor(idx);
    }, [focusedSeriesId, plotSeriesByType?.iv]);
    const focusedVthFitOverlays = useMemo(() => {
        if (effectivePlotType !== "vth")
            return [];
        const fits = Array.isArray(focusedAnalysis?.metrics?.vthFits)
            ? focusedAnalysis.metrics.vthFits
            : [];
        return fits.map((fit: VthFitResult) => ({
            color: fit.branch === "electron" ? "#22c55e" : "#a855f7",
            intercept: fit.intercept,
            label: fit.branch === "electron" ? "Vth,e" : "Vth,h",
            r2: fit.r2,
            slope: fit.slope,
            vth: fit.vth,
            x1: fit.x1,
            x2: fit.x2,
            y1: fit.y1,
            y2: fit.y2,
        }));
    }, [effectivePlotType, focusedAnalysis?.metrics]);
    const focusedVthFitRows = useMemo(() => {
        if (effectivePlotType !== "vth")
            return [];
        const fits = Array.isArray(focusedAnalysis?.metrics?.vthFits)
            ? focusedAnalysis.metrics.vthFits
            : [];
        return fits.map((fit: VthFitResult) => ({
            branch: fit.branch,
            fitRange: `[${formatNumber(fit.x1 * plotXFactor, { digits: 4 })}, ${formatNumber(fit.x2 * plotXFactor, { digits: 4 })}]`,
            intercept: formatNumber(fit.intercept * plotYFactor, { digits: 4 }),
            r2: formatNumber(fit.r2, { digits: 4 }),
            slope: formatNumber((fit.slope * plotYFactor) / plotXFactor, { digits: 4 }),
            vth: formatNumber(fit.vth * plotXFactor, { digits: 4 }),
        }));
    }, [effectivePlotType, focusedAnalysis?.metrics, plotXFactor, plotYFactor]);
    const focusedVthSlopeReferenceLines = useMemo(() => {
        if (effectivePlotType !== "vth")
            return [];
        return focusedVthFitOverlays.flatMap((fit: any) => [
            {
                axis: "x" as const,
                dash: [5, 4],
                opacity: 0.45,
                stroke: fit.color,
                strokeWidth: 1.5,
                value: fit.x1,
            },
            {
                axis: "x" as const,
                dash: [5, 4],
                opacity: 0.45,
                stroke: fit.color,
                strokeWidth: 1.5,
                value: fit.x2,
            },
        ]);
    }, [effectivePlotType, focusedVthFitOverlays]);
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
    const yLogCurrentMode = useMemo(
        () => resolveYLogCurrentModeForFile(activeFile),
        [activeFile, resolveYLogCurrentModeForFile],
    );
    const plotYKey = useMemo(() => {
        if (yScaleMode === "logAbs")
            return "yAbsPositive";
        if (yScaleMode === "log") {
            return yLogCurrentMode === "positive" ? "yPositive" : SIGNED_LOG_Y_DATA_KEY;
        }
        return "y";
    }, [yLogCurrentMode, yScaleMode]);
    const plotLegendSeries = useMemo(() => {
        const byType = plotSeriesByType ?? { iv: [], gm: [], ss: [], j: [] };
        return effectivePlotType === "gm"
            ? byType.gm ?? []
            : effectivePlotType === "vth"
                ? byType.vth ?? []
            : effectivePlotType === "j"
                ? byType.j ?? []
                : effectivePlotType === "ss"
                    ? byType.ss ?? byType.iv ?? []
                    : byType.iv ?? [];
    }, [effectivePlotType, plotSeriesByType]);
    const displayPlotSeries = useMemo(() => {
        const visible = plotLegendSeries.filter((series: any) => {
            const seriesId = String(series?.id ?? "").trim();
            return !seriesId || visibleSeriesKeySet.has(seriesId);
        });
        if (yScaleMode !== "log" || yLogCurrentMode === "positive")
            return visible;
        return visible.map((series: any) => ({
            ...series,
            data: withSignedLogPositivePoints(series?.data),
        }));
    }, [plotLegendSeries, visibleSeriesKeySet, yLogCurrentMode, yScaleMode]);
    const hasVisiblePlotSeries = displayPlotSeries.length > 0;
    const currentOverlaysForVisiblePlot = useMemo(() => hasVisiblePlotSeries ? currentOverlaysForPlot : [], [currentOverlaysForPlot, hasVisiblePlotSeries]);
    const currentBiasMarkersForVisiblePlot = useMemo(() => hasVisiblePlotSeries ? currentBiasMarkers : [], [currentBiasMarkers, hasVisiblePlotSeries]);
    const focusedSsOverlayForVisiblePlot = useMemo(() => hasVisiblePlotSeries ? focusedSsOverlay : null, [focusedSsOverlay, hasVisiblePlotSeries]);
    const renderPointBudget = useMemo(() => effectivePlotType === "gm" ? GM_RENDER_POINT_BUDGET : DEFAULT_RENDER_POINT_BUDGET, [effectivePlotType]);
    const renderMaxPointsPerSeries = useMemo(() => {
        const seriesCount = Math.max(1, displayPlotSeries.length);
        const adaptive = Math.floor(renderPointBudget / seriesCount);
        return Math.max(MIN_RENDER_SERIES_POINTS, Math.min(MAX_RENDER_SERIES_POINTS, adaptive));
    }, [displayPlotSeries.length, renderPointBudget]);
    const renderPlotSeries = useMemo(() => {
        if (!displayPlotSeries.length)
            return displayPlotSeries;
        const finishPerf = startDeviceAnalysisPerf("render:plot-series", {
            fileId: activeFile?.fileId ?? null,
            fileName: activeFile?.fileName ?? null,
            maxPointsPerSeries: renderMaxPointsPerSeries,
            seriesCount: displayPlotSeries.length,
        });
        const cacheKey = displayPlotSeries as unknown as object;
        let cacheBucket = renderSeriesCacheRef.current.get(cacheKey);
        if (!cacheBucket) {
            cacheBucket = new Map<string, any[]>();
            renderSeriesCacheRef.current.set(cacheKey, cacheBucket);
        }
        const renderSeriesModeKey = `${yScaleMode}:${yLogCurrentMode}:${renderMaxPointsPerSeries}`;
        const cachedSeries = cacheBucket.get(renderSeriesModeKey);
        if (cachedSeries) {
            finishPerf({ cached: true });
            return cachedSeries;
        }
        let inputPointCount = 0;
        let outputPointCount = 0;
        const computedSeries = displayPlotSeries.map((series: any) => {
            const fullData = Array.isArray(series?.data) ? series.data : [];
            inputPointCount += fullData.length;
            const nextData = yScaleMode === "linear"
                ? downsamplePointsForDisplay(fullData, renderMaxPointsPerSeries)
                : fullData;
            outputPointCount += Array.isArray(nextData) ? nextData.length : 0;
            if (nextData === fullData)
                return series;
            return {
                ...series,
                data: nextData,
            };
        });
        cacheBucket.set(renderSeriesModeKey, computedSeries);
        finishPerf({
            cached: false,
            inputPointCount,
            outputPointCount,
        });
        return computedSeries;
    }, [activeFile?.fileId, activeFile?.fileName, displayPlotSeries, renderMaxPointsPerSeries, yLogCurrentMode, yScaleMode]);
    const mainPlotLegendFontSize = useMemo(() => clampChartFontSize(axis?.legendFontSize, 18), [axis?.legendFontSize]);
    const renderOriginSelectionLegend = React.useCallback(() => {
        if (!plotLegendSeries.length)
            return null;
        const activeLegendFileId = String(activeFile?.fileId ?? "").trim();
        return (<ul className="m-0 flex min-w-0 w-full list-none flex-col gap-0.5 overflow-hidden p-0">
        {plotLegendSeries.map((series: any, idx: number) => {
                const seriesId = String(series?.id ?? "");
                const checked = seriesId ? visibleSeriesKeySet.has(seriesId) : false;
                const label = resolveDisplayLegendLabel(activeLegendFileId, series, idx);
                const color = resolveSeriesChartColor(series, idx);
                const disabled = !seriesId;
                const isEditing = Boolean(editingLegendLabel &&
                    editingLegendLabel.fileId === activeLegendFileId &&
                    editingLegendLabel.seriesId === seriesId);
                return (<EditableLegendItem key={seriesId || `${label}-${idx}`} checked={checked} color={color} disabled={disabled} isEditing={isEditing} label={label} fontSize={mainPlotLegendFontSize} onBeginEdit={() => beginLegendLabelEdit(activeLegendFileId, series, idx)} onCancelEdit={cancelLegendLabelEdit} onCommitEdit={commitLegendLabelEdit} onDraftChange={setEditingLegendDraft} onToggleVisible={() => {
                        if (!disabled)
                            toggleVisibleSeries(seriesId);
                    }} draftValue={editingLegendDraft} inputRef={isEditing ? editingLegendInputRef : undefined}/>);
            })}
      </ul>);
    }, [activeFile?.fileId, beginLegendLabelEdit, cancelLegendLabelEdit, commitLegendLabelEdit, editingLegendDraft, editingLegendLabel, mainPlotLegendFontSize, plotLegendSeries, resolveDisplayLegendLabel, toggleVisibleSeries, visibleSeriesKeySet]);
    const curveProbeX = useMemo(() => {
        const text = String(curveProbeXInput ?? "").trim();
        if (!text)
            return null;
        const raw = Number(text);
        if (!Number.isFinite(raw))
            return null;
        return raw / plotXFactor;
    }, [curveProbeXInput, plotXFactor]);
    const curveProbeRows = useMemo(() => {
        if (!displayPlotSeries.length || curveProbeX === null)
            return [];
        return displayPlotSeries.flatMap((series: any, index: number) => {
            const color = resolveSeriesChartColor(series, index);
            const baseName = String(series?.name ?? `Curve ${index + 1}`);
            const segments = splitBidirectionalCurvePoints(series?.data);
            if (!segments.length) {
                return [{
                        color,
                        id: series?.id ?? `curve-${index}`,
                        name: baseName,
                        sample: interpolateCurveAtX(series?.data, curveProbeX, curveProbeMode),
                    }];
            }
            return segments.map((segment: any, segmentIndex: number) => ({
                color,
                id: `${series?.id ?? `curve-${index}`}-${segment?.branch ?? segmentIndex}`,
                name: `${baseName}${formatCurveProbeBranchSuffix(segment?.branch)}`,
                sample: interpolateCurveAtX(segment?.points, curveProbeX, curveProbeMode),
            }));
        });
    }, [curveProbeMode, curveProbeX, displayPlotSeries]);
    const autoMinMax = useMemo(() => {
        const fileId = activeFile?.fileId ?? null;
        const cache = fileId ? getFileCache(fileId, activeFile) : null;
        const areaKeyForMinMax = area && Number.isFinite(area) && area > 0 ? String(normalizeFloat(area)) : "";
        const minMaxKey = `${effectivePlotType}::${gmMode}::${plotYKey}::${areaKeyForMinMax}::${visibleSeriesSignature}`;
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
        visibleSeriesSignature,
    ]);
    const autoMinY = autoMinMax?.minY ?? null;
    const autoMaxY = autoMinMax?.maxY ?? null;
    const effectiveYScale = useMemo(() => {
        if (effectivePlotType === "vth")
            return "linear";
        if (yScaleMode === "linear")
            return "linear";
        if (autoMinY === null || autoMaxY === null)
            return "linear";
        if (autoMaxY <= 0)
            return "linear";
        return yScaleMode; // 'log' | 'logAbs'
    }, [autoMaxY, autoMinY, effectivePlotType, yScaleMode]);
    const yScaleWarning = useMemo(() => {
        if (yScaleMode === "linear")
            return "";
        if (effectiveYScale !== yScaleMode) {
            return yLogCurrentMode === "positive"
                ? "Log I+ requires positive values."
                : "Log all-I requires non-zero values.";
        }
        return "";
    }, [effectiveYScale, yLogCurrentMode, yScaleMode]);
    const xDomain = useMemo(() => {
        const auto: [number, number] = autoMinMax.minX === null || autoMinMax.maxX === null
            ? [0, 1]
            : padLinearDomain(autoMinMax.minX, autoMinMax.maxX);
        const minUser = parseOptionalNumber(axis?.xMin);
        const maxUser = parseOptionalNumber(axis?.xMax);
        const min = minUser !== null ? minUser / plotXFactor : auto[0];
        const max = maxUser !== null ? maxUser / plotXFactor : auto[1];
        return minUser !== null || maxUser !== null
            ? makeStrictLinearDomain(min, max)
            : auto;
    }, [autoMinMax.maxX, autoMinMax.minX, axis?.xMax, axis?.xMin, plotXFactor]);
    const yDomain = useMemo<[number, number]>(() => {
        const auto: [number, number] = (() => {
            if (autoMinMax.minY === null || autoMinMax.maxY === null) {
                return effectiveYScale === "linear" ? [0, 1] : [1e-3, 1];
            }
            if (effectiveYScale === "linear") {
                const minY = effectivePlotType === "gm" || effectivePlotType === "vth"
                    ? Math.min(autoMinMax.minY, 0)
                    : autoMinMax.minY;
                const maxY = effectivePlotType === "gm" || effectivePlotType === "vth"
                    ? Math.max(autoMinMax.maxY, 0)
                    : autoMinMax.maxY;
                return padLinearDomain(minY, maxY);
            }
            const logTicks = buildOriginLogAutoTicks(autoMinMax.minY, autoMinMax.maxY, 6);
            if (Array.isArray(logTicks) && logTicks.length >= 2) {
                return [Number(logTicks[0]), Number(logTicks[logTicks.length - 1])];
            }
            return padLogDomain(autoMinMax.minY, autoMinMax.maxY);
        })();
        const minUserRaw = parseOptionalNumber(axis?.yMin);
        const maxUserRaw = parseOptionalNumber(axis?.yMax);
        const minUser = minUserRaw !== null ? minUserRaw / plotYFactor : null;
        const maxUser = maxUserRaw !== null ? maxUserRaw / plotYFactor : null;
        let min = minUser ?? auto[0];
        let max = maxUser ?? auto[1];
        const hasManualRange = minUserRaw !== null || maxUserRaw !== null;
        if (!hasManualRange) {
            return auto;
        }
        if (effectiveYScale !== "linear") {
            if (min <= 0)
                min = auto[0];
            if (max <= 0)
                max = auto[1];
            if (min <= 0 || max <= 0)
                return auto;
            const strictDomain = makeStrictLogDomain(min, max);
            if (strictDomain)
                return strictDomain;
            return padLogDomain(min, max);
        }
        return makeStrictLinearDomain(min, max);
    }, [
        autoMinMax.maxY,
        autoMinMax.minY,
        axis?.yMax,
        axis?.yMin,
        effectiveYScale,
        effectivePlotType,
        plotYFactor,
    ]);
    const visibleSsDiagnosticsSeries = useMemo(() => {
        if (effectivePlotType !== "ss")
            return [];
        if (!ssDiagnosticsEnabled)
            return [];
        return displayPlotSeries
            .map((series: any, index: number) => {
            const diagnostics = detailAnalysisBySeriesId.get(series?.id)?.ssDiagnostics ??
                buildSeriesAnalysisEntry(series)?.ssDiagnostics ??
                null;
            if (!Array.isArray(diagnostics) || !diagnostics.some((point: any) => Number.isFinite(point?.y))) {
                return null;
            }
            return {
                color: resolveSeriesChartColor(series, index),
                data: diagnostics,
                id: String(series?.id ?? `ss-diag-${index}`),
                lineName: String(series?.name ?? `Curve ${index + 1}`),
            };
        })
            .filter((series: any) => series !== null);
    }, [buildSeriesAnalysisEntry, detailAnalysisBySeriesId, displayPlotSeries, effectivePlotType, ssDiagnosticsEnabled]);
    const visibleSsDiagnosticsSeriesForRender = useMemo(() => downsampleDiagnosticsSeriesForRender(visibleSsDiagnosticsSeries), [visibleSsDiagnosticsSeries]);
    const visibleGmDiagnosticsSeries = useMemo(() => {
        if (effectivePlotType !== "gm")
            return [];
        if (!gmDiagnosticsEnabled)
            return [];
        return displayPlotSeries
            .map((series: any, index: number) => {
            const gm = Array.isArray(series?.data) ? series.data : [];
            if (gm.length < 2)
                return null;
            const computed = computeCentralDerivative(gm).map((point: any) => ({
                ...point,
                y: Number.isFinite(point?.y) ? Number(point.y) * plotYFactor : null,
            }));
            if (!computed.some((point: any) => Number.isFinite(point?.y)))
                return null;
            return {
                color: resolveSeriesChartColor(series, index),
                data: computed,
                id: String(series?.id ?? `gm-second-${index}`),
                lineName: String(series?.name ?? `Curve ${index + 1}`),
            };
        })
            .filter((series: any) => series !== null);
    }, [displayPlotSeries, effectivePlotType, gmDiagnosticsEnabled, plotYFactor]);
    const visibleGmDiagnosticsSeriesForRender = useMemo(() => downsampleDiagnosticsSeriesForRender(visibleGmDiagnosticsSeries), [visibleGmDiagnosticsSeries]);
    const visibleVthSlopeDiagnosticsSeries = useMemo(() => {
        if (effectivePlotType !== "vth")
            return [];
        return displayPlotSeries
            .map((series: any, index: number) => {
            const sqrtCurve = Array.isArray(series?.data) ? series.data : [];
            if (sqrtCurve.length < 2)
                return null;
            const computed = computeCentralDerivative(sqrtCurve).map((point: any) => ({
                ...point,
                y: Number.isFinite(point?.y) ? (Number(point.y) * plotYFactor) / plotXFactor : null,
            }));
            if (!computed.some((point: any) => Number.isFinite(point?.y)))
                return null;
            return {
                color: resolveSeriesChartColor(series, index),
                data: computed,
                id: String(series?.id ?? `vth-slope-${index}`),
                lineName: String(series?.name ?? `Curve ${index + 1}`),
            };
        })
            .filter((series: any) => series !== null);
    }, [displayPlotSeries, effectivePlotType, plotXFactor, plotYFactor]);
    const visibleVthSlopeDiagnosticsSeriesForRender = useMemo(() => downsampleDiagnosticsSeriesForRender(visibleVthSlopeDiagnosticsSeries), [visibleVthSlopeDiagnosticsSeries]);
    const activeCurveProbeRows = useMemo(() => {
        if (effectivePlotType === "gm" && gmDiagnosticsEnabled) {
            if (!visibleGmDiagnosticsSeries.length || curveProbeX === null)
                return [];
            return visibleGmDiagnosticsSeries.flatMap((series: any) => splitBidirectionalCurvePoints(series.data).map((segment: any, index: number) => ({
                color: resolveSeriesChartColor(series, index),
                id: `${series.id}-${segment?.branch ?? index}`,
                name: `${series.lineName}${formatCurveProbeBranchSuffix(segment?.branch)}`,
                sample: interpolateCurveAtX(segment?.points, curveProbeX, curveProbeMode),
            })));
        }
        return curveProbeRows;
    }, [curveProbeMode, curveProbeRows, curveProbeX, effectivePlotType, gmDiagnosticsEnabled, visibleGmDiagnosticsSeries]);
    const activeCurveProbeYUnitLabel = useMemo(() => {
        if (effectivePlotType === "gm" && gmDiagnosticsEnabled) {
            return gmSecondDerivativeUnitLabel;
        }
        return plotYUnitLabel;
    }, [effectivePlotType, gmDiagnosticsEnabled, gmSecondDerivativeUnitLabel, plotYUnitLabel]);
    const ssDiagnosticsMinMax = useMemo(() => {
        return computeDiagnosticsMinMax(visibleSsDiagnosticsSeries);
    }, [visibleSsDiagnosticsSeries]);
    const ssDiagnosticsBaseYDomain = useMemo(() => {
        return resolveDiagnosticsBaseYDomain(ssDiagnosticsMinMax, [0, 1]);
    }, [ssDiagnosticsMinMax]);
    const ssDiagnosticsYTicks = useMemo(() => {
        return buildDiagnosticsYTicks(ssDiagnosticsBaseYDomain);
    }, [ssDiagnosticsBaseYDomain]);
    const ssDiagnosticsYDomain = useMemo(() => {
        return resolveTickedDomain(ssDiagnosticsBaseYDomain, ssDiagnosticsYTicks);
    }, [ssDiagnosticsBaseYDomain, ssDiagnosticsYTicks]);
    const gmDiagnosticsMinMax = useMemo(() => {
        return computeDiagnosticsMinMax(visibleGmDiagnosticsSeries);
    }, [visibleGmDiagnosticsSeries]);
    const gmDiagnosticsBaseYDomain = useMemo(() => {
        return resolveDiagnosticsBaseYDomain(gmDiagnosticsMinMax, [-1, 1]);
    }, [gmDiagnosticsMinMax]);
    const gmDiagnosticsYTicks = useMemo(() => {
        return buildDiagnosticsYTicks(gmDiagnosticsBaseYDomain);
    }, [gmDiagnosticsBaseYDomain]);
    const gmDiagnosticsYDomain = useMemo(() => {
        return resolveTickedDomain(gmDiagnosticsBaseYDomain, gmDiagnosticsYTicks);
    }, [gmDiagnosticsBaseYDomain, gmDiagnosticsYTicks]);
    const vthSlopeDiagnosticsMinMax = useMemo(() => {
        return computeDiagnosticsMinMax(visibleVthSlopeDiagnosticsSeries);
    }, [visibleVthSlopeDiagnosticsSeries]);
    const vthSlopeDiagnosticsBaseYDomain = useMemo(() => {
        return resolveDiagnosticsBaseYDomain(vthSlopeDiagnosticsMinMax, [-1, 1], true);
    }, [vthSlopeDiagnosticsMinMax]);
    const vthSlopeDiagnosticsYTicks = useMemo(() => {
        return buildDiagnosticsYTicks(vthSlopeDiagnosticsBaseYDomain);
    }, [vthSlopeDiagnosticsBaseYDomain]);
    const vthSlopeDiagnosticsYDomain = useMemo(() => {
        return resolveTickedDomain(vthSlopeDiagnosticsBaseYDomain, vthSlopeDiagnosticsYTicks);
    }, [vthSlopeDiagnosticsBaseYDomain, vthSlopeDiagnosticsYTicks]);
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
        return resolveScaledRangeFromTicks({
            domain: xDomain,
            inferStep: inferUniformTickStep,
            scaleFactor: plotXFactor,
            ticks: xTicks,
        });
    }, [plotXFactor, xDomain, xTicks]);
    useEffect(() => {
        originChartXRangeRef.current = originChartXRange;
    }, [originChartXRange]);
    const yTicks = useMemo(() => {
        const mode = String(axis?.yTicks ?? "auto");
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
        const range = resolveScaledRangeFromTicks({
            domain: yDomain,
            inferStep: effectiveYScale === "linear" ? inferUniformTickStep : inferUniformLogTickStep,
            scaleFactor: plotYFactor,
            ticks: yTicks,
        });
        if (!range)
            return null;
        const mode: "linear" | "log" = effectiveYScale === "linear" ? "linear" : "log";
        if (mode === "log" && (!(range.min > 0) || !(range.max > 0)))
            return null;
        return {
            ...range,
            mode,
            step: mode === "log" && Number.isFinite(range.step) ? Number(range.step) / plotYFactor : range.step,
        };
    }, [effectiveYScale, plotYFactor, yDomain, yTicks]);
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
    const mainPlotTickLabelFontSize = useMemo(() => clampChartFontSize(axis?.tickLabelFontSize, 18), [axis?.tickLabelFontSize]);
    const mainPlotAxisTitleFontSize = useMemo(() => clampChartFontSize(axis?.axisTitleFontSize, 22), [axis?.axisTitleFontSize]);
    const xLabelInterval = useMemo(() => computeLabelInterval(xTicks, 7), [xTicks]);
    const isMetricsDetailsPending = detailAnalysisState.key === detailAnalysisKey && detailAnalysisState.pending;
    const metricsRows = useMemo(() => {
        if (!activeFile?.series?.length)
            return [];
        return activeFile.series.map((series: any) => {
            const analysis = detailAnalysisBySeriesId.get(series.id) ??
                (focusedSeriesId === series.id ? focusedAnalysis : null);
            const seriesIndex = activeFile.series.findIndex((item: any) => item?.id === series?.id);
            return {
                id: series.id,
                name: resolveDisplayLegendLabel(activeFile.fileId, series, seriesIndex >= 0 ? seriesIndex : 0),
                group: Number(series.groupIndex ?? 0) + 1,
                yCol: series.yCol,
                isPending: !analysis && isMetricsDetailsPending,
                ...analysis?.metrics,
            };
        });
    }, [activeFile, detailAnalysisBySeriesId, focusedAnalysis, focusedSeriesId, isMetricsDetailsPending, resolveDisplayLegendLabel]);
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
    }, [
        ionIoffManualTargets?.ioffX,
        ionIoffManualTargets?.ionX,
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
        const nextFocusedSeriesId = resolveFirstVisibleSeriesIdForFile(fileId);
        preserveScrollPosition(() => {
            setFocusedSeriesId(nextFocusedSeriesId);
            setActiveFileId(fileId);
        });
    }, [resolveFirstVisibleSeriesIdForFile, setActiveFileId]);
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
    const rcRows = useMemo(() => {
        if (!Array.isArray(processedData) || !processedData.length)
            return [];
        let deviceIndex = 0;
        return processedData.flatMap((file: any) => {
            if (!isTransferLikeDeviceAnalysisFile(file))
                return [];
            const fileId = String(file?.fileId ?? "").trim();
            const xGroups = Array.isArray(file?.xGroups) ? file.xGroups : [];
            const seriesList = Array.isArray(file?.series) ? file.series : [];
            return seriesList.map((series: any, index: number) => {
                const seriesId = String(series?.id ?? "");
                const stored = fileId && seriesId ? rcGeometryByFileId[fileId]?.[seriesId] ?? {} : {};
                const legendVds = Number(series?.legendValue);
                const xArr = xGroups[Number(series?.groupIndex ?? 0)] ?? [];
                const yArr = Array.isArray(series?.y) ? series.y : [];
                deviceIndex += 1;
                return {
                    fileId,
                    fileName: String(file?.fileName ?? (fileId || "device")),
                    include: stored.include ?? true,
                    label: resolveDisplayLegendLabel(fileId, series, index),
                    length: stored.length ?? String(deviceIndex),
                    series,
                    seriesId,
                    vds: stored.vds ?? (Number.isFinite(legendVds) && legendVds !== 0 ? String(legendVds) : "0.1"),
                    width: stored.width ?? "1",
                    x: xArr,
                    y: yArr,
                };
            });
        });
    }, [processedData, rcGeometryByFileId, resolveDisplayLegendLabel]);
    const updateRcGeometry = React.useCallback((fileIdRaw: string, seriesId: string, patch: Partial<RcGeometryEntry>) => {
        const fileId = String(fileIdRaw ?? "").trim();
        if (!fileId || !seriesId)
            return;
        setRcGeometryByFileId((prev) => ({
            ...prev,
            [fileId]: {
                ...(prev[fileId] ?? {}),
                [seriesId]: {
                    ...(prev[fileId]?.[seriesId] ?? {}),
                    ...patch,
                },
            },
        }));
    }, []);
    const rcSummary = rcAnalyzeResult?.summary && typeof rcAnalyzeResult.summary === "object"
        ? rcAnalyzeResult.summary
        : null;
    const rcCurveRows = Array.isArray(rcAnalyzeResult?.curve) ? rcAnalyzeResult.curve : [];
    const rcStatusText = rcAnalyzePending
        ? "Rc running..."
        : rcAnalyzeError
            ? rcAnalyzeError
            : rcSummary
                ? `Rc=${formatNumber(rcSummary.rc)} | RcW=${formatNumber(rcSummary.rcw)} | R2=${formatNumber(rcSummary.r2, { digits: 4 })}`
                : "Configure L/W/Vds, then run Rc";
    const handleAnalyzeRc = React.useCallback(async () => {
        const bridge = (globalThis.window as any)?.desktopImport;
        if (!bridge?.analyzeDeviceAnalysisRcWithRust) {
            setRcAnalyzeError("Rust Rc bridge is unavailable.");
            return;
        }
        if (!rcRows.length) {
            setRcAnalyzeError("No transfer curves are available.");
            return;
        }
        const devices = rcRows
            .filter((row: any) => row.include)
            .map((row: any) => {
                return {
                    fileId: row.fileId,
                    label: `${row.fileName} / ${row.label}`,
                    length: Number(row.length),
                    seriesId: row.seriesId,
                    vds: Number(row.vds),
                    width: Number(row.width),
                    x: (Array.isArray(row.x) ? row.x : []).map((value: any) => Number(value)),
                    y: (Array.isArray(row.y) ? row.y : []).map((value: any) => Number(value)),
                };
            })
            .filter((device: any) => Number.isFinite(device.length) &&
                device.length > 0 &&
                Number.isFinite(device.width) &&
                device.width > 0 &&
                Number.isFinite(device.vds) &&
                device.vds !== 0 &&
                device.x.length >= 2 &&
                device.y.length >= 2);
        if (devices.length < 2) {
            setRcAnalyzeError("Rc needs at least two valid devices; three or more is recommended.");
            return;
        }
        setRcAnalyzePending(true);
        setRcAnalyzeError("");
        try {
            const response = await bridge.analyzeDeviceAnalysisRcWithRust({
                devices,
                options: {
                    maxGridPoints: 240,
                    minAbsCurrent: 0,
                    minDevices: Math.min(3, devices.length),
                    normalizeByWidth: true,
                    selectedVg: curveProbeX,
                },
            });
            if (!response?.ok) {
                throw new Error(response?.message || "Rc analysis failed.");
            }
            setRcAnalyzeResult(response.result ?? null);
        } catch (error: any) {
            setRcAnalyzeError(error?.message || "Rc analysis failed.");
            setRcAnalyzeResult(null);
        } finally {
            setRcAnalyzePending(false);
        }
    }, [curveProbeX, rcRows]);
    const diagnosticsContextBadges = useMemo(() => {
        const focusedLabel = String(focusedSeriesLabel ?? "").trim();
        const labelKey = (effectivePlotType === "gm" && gmDiagnosticsEnabled) ||
            (effectivePlotType === "ss" && ssDiagnosticsEnabled)
            ? "da_chart_diagnostic_curve_label"
            : "da_chart_selected_curve_label";
        return [
            { text: t(labelKey) },
            {
                color: focusedSeriesColor,
                text: focusedLabel || "current",
            },
        ];
    }, [
        effectivePlotType,
        focusedSeriesColor,
        focusedSeriesLabel,
        gmDiagnosticsEnabled,
        ssDiagnosticsEnabled,
        t,
    ]);
    const showIonIoffControl = transferMetricsApplicable && effectivePlotType === "iv";
    const showSsDiagnosticsPanel = effectivePlotType === "ss";
    const showGmDiagnosticsPanel = effectivePlotType === "gm";
    const showJDiagnosticsPanel = effectivePlotType === "j";
    const showAreaDiagnosticsControls = showJDiagnosticsPanel;
    const showCurveProbePanel = effectivePlotType === "gm" && gmDiagnosticsEnabled
        ? visibleGmDiagnosticsSeries.length > 0
        : hasVisiblePlotSeries;
    const showDiagnosticsPanel = showCurveProbePanel || showSsDiagnosticsPanel || showGmDiagnosticsPanel || showJDiagnosticsPanel;
    const diagnosticsHeading = showSsDiagnosticsPanel
        ? "SS Diagnostics"
        : showGmDiagnosticsPanel
            ? "gm Diagnostics"
            : showJDiagnosticsPanel
                ? "J Diagnostics"
                : showCurveProbePanel
                    ? "Curve Probe"
                    : "Diagnostics";
    const diagnosticsDescription = showSsDiagnosticsPanel
        ? "Subthreshold controls and fit configuration for the active curve."
        : showGmDiagnosticsPanel
            ? gmDiagnosticsEnabled
                ? "Diagnostics now target the second-order transconductance curve; enter x below to inspect the diagnostic trace directly."
                : "Derivative-focused guidance for gm interpretation. Turn on diagnostics to inspect the second-order transconductance trace."
            : showJDiagnosticsPanel
                ? "Current-density controls driven by Area and axis configuration."
                : "Query any x between measured points and get y by linear interpolation.";
    const applyLinearLogYScaleForFile = React.useCallback((nextScaleRaw: unknown) => {
        const nextScale = normalizeLinearLogScale(nextScaleRaw);
        const nextTicks = "auto";
        const fileKey = String(effectiveActiveFileId ?? "").trim();
        userChangedYScaleRef.current = true;
        setAxis((prev: any) => ({
            ...prev,
            yScale: nextScale,
            yTicks: nextTicks,
        }));
        if (fileKey) {
            setPersistedYScaleByFileId((prev) => ({
                ...prev,
                [fileKey]: nextScale,
            }));
            setChartYScaleByFileId((prev) => ({
                ...prev,
                [fileKey]: nextScale,
            }));
        }
        apiService
            .updateDeviceAnalysisSettings(fileKey
            ? {
                yScaleByFileId: {
                    ...persistedYScaleByFileId,
                    [fileKey]: nextScale,
                },
            }
            : {})
            .catch(() => { });
        return nextScale;
    }, [effectiveActiveFileId, persistedYScaleByFileId]);
    const handleOriginOpenPlotOptionsChange = React.useCallback((nextOptions: Partial<OriginPlotOptions>) => {
        if (typeof onOriginOpenPlotOptionsChange !== "function")
            return;
        void onOriginOpenPlotOptionsChange({
            ...(Object.prototype.hasOwnProperty.call(nextOptions, "type")
                ? { originPlotTypeDefault: nextOptions.type }
                : {}),
            ...(Object.prototype.hasOwnProperty.call(nextOptions, "lineWidth")
                ? { originPlotLineWidthDefault: nextOptions.lineWidth }
            : {}),
        });
    }, [onOriginOpenPlotOptionsChange]);
    const normalizedOriginOpenPlotOptions = useMemo(() => normalizeOriginPlotOptions(originOpenPlotOptions, DEFAULT_ORIGIN_PLOT_OPTIONS), [originOpenPlotOptions]);
    const metricsProgressText = useMemo(() => isMetricsDetailsPending
        ? `Computing details ${detailAnalysisState.completedCount}/${detailAnalysisState.totalCount}`
        : "", [detailAnalysisState.completedCount, detailAnalysisState.totalCount, isMetricsDetailsPending]);
    if (!processedData || processedData.length === 0)
        return null;
    return (<div className="h-full min-h-0 grid grid-cols-1 md:grid-rows-1 md:grid-cols-[var(--analysis-sidebar-width)_minmax(0,1fr)] gap-1 md:gap-1" ref={toastContainerRef} style={{
            "--analysis-sidebar-width": "clamp(240px, var(--sidebar-width), 420px)",
        } as CSSProperties}>
      <aside
        id="device-analysis-overview-sidebar"
        className="md:min-h-0 flex flex-col h-full"
      >
        {showPlotSettingsPane ? (
          <AxisSettingsPane
            axis={axis}
            setAxis={setAxis}
            effectiveYScale={effectiveYScale}
            plotYUnitLabel={plotYUnitLabel}
            yScaleWarning={yScaleWarning}
            xTooltipDigitsAuto={xTooltipDigitsAuto}
            originOpenPlotOptions={normalizedOriginOpenPlotOptions}
            onOriginOpenPlotOptionsChange={handleOriginOpenPlotOptionsChange}
            onClose={() => setShowPlotSettingsPane(false)}
            analysisCompactInputWrapperClass={ANALYSIS_COMPACT_INPUT_WRAPPER_CLASS}
            analysisCompactInputClass={ANALYSIS_COMPACT_INPUT_CLASS}
            t={t}
          />
        ) : (
          <OverviewGrid processedData={processedData} processingStatus={processingStatus} activeFileId={effectiveActiveFileId} onSelectFile={handleSelectFile} onVisibleFileIdsChange={setOverviewVisibleFileIds} selectedOriginCanvasKeySet={selectedOriginCanvasKeySet} onToggleOriginCanvasSelection={toggleOriginCanvasSelection} originCanvasExportScope={originCanvasExportScope} isSelectionMode={isManualCanvasScope} xUnitFactor={resolvedXUnitMeta.factor} xUnitLabel={resolvedXUnitMeta.label} resolveYUnitForFile={resolveYUnitForFile} resolveYScaleForFile={resolveLinearLogYScaleForFile} resolveYLogCurrentModeForFile={resolveYLogCurrentModeForFile}/>
        )}
      </aside>

      <ScrollArea className="da-analysis-scroll-area md:min-h-0 min-w-0" axis="y" viewportClassName="flex flex-col min-h-full">
        <section className="flex min-w-0 flex-col flex-1 gap-1 pr-1" aria-label="Device Analysis results">
          <section aria-label="Device Analysis chart">
        <Card variant="panel" className="flex min-w-0 flex-col">

          <div className="mb-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 flex-wrap">
              <PlotTypeToggle activePlotType={effectivePlotType} primaryPlotLabel={primaryPlotLabel} derivativeLabel={gmUi.kind === "gds" ? "gds" : "gm"} gmApplicable={gmApplicable} ssApplicable={ssApplicable} vthApplicable={vthApplicable} areaAvailable={Boolean(area)} onChange={handlePlotTypeChange}/>



              <div className="flex items-center gap-2">
                <DropdownField id="device-analysis-y-unit-select" size="sm" value={activeYUnit} onChange={(next: any) => {
            const nextUnitRaw = normalizeDeviceAnalysisYUnit(next, activeYUnit);
            const nextUnit = isYUnitAllowedForFile(nextUnitRaw, activeFile)
                ? nextUnitRaw
                : resolveDefaultYUnitForFile(activeFile);
            userChangedYUnitRef.current = true;
            const fileKey = String(effectiveActiveFileId ?? "").trim();
            if (fileKey && nextUnit) {
                setPersistedYUnitByFileId((prev) => ({
                    ...prev,
                    [fileKey]: nextUnit,
                }));
            }
            apiService
                .updateDeviceAnalysisSettings(fileKey && nextUnit
                ? {
                    yUnitByFileId: {
                        ...persistedYUnitByFileId,
                        [fileKey]: nextUnit,
                    },
                }
                : {})
                .catch(() => { });
        }} options={activeYUnitOptions.map((unit) => ({
            value: unit,
            label: unit,
        }))} aria-label="Y unit" className="w-fit da-neutral-select" stableWidth data-cta="Device Analysis" data-cta-position="y-unit" data-cta-copy="y unit"/>

                <div className="flex items-center gap-1">
                  {effectivePlotType === "ss" ? (<span className="text-xs text-text-primary font-mono whitespace-nowrap">
                      log(|I|)
                    </span>) : effectivePlotType === "vth" ? null : (<DropdownField id="device-analysis-y-scale-select" size="sm" value={axis.yScale === "logAbs" ? "log" : axis.yScale} onChange={(next: any) => {
                applyLinearLogYScaleForFile(next);
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
                  {effectivePlotType !== "ss" && effectivePlotType !== "vth" && yScaleMode === "log" ? (<DropdownField id="device-analysis-log-current-mode-select" size="sm" value={yLogCurrentMode} onChange={(next: any) => {
                const mode = normalizeLogCurrentMode(next);
                const fileKey = String(effectiveActiveFileId ?? "").trim();
                userChangedYLogCurrentModeRef.current = true;
                if (fileKey) {
                    const nextByFileId = {
                        ...persistedYLogCurrentModeByFileId,
                        [fileKey]: mode,
                    };
                    setPersistedYLogCurrentModeByFileId(nextByFileId);
                    apiService
                        .updateDeviceAnalysisSettings({
                        yLogCurrentModeByFileId: nextByFileId,
                    })
                        .catch(() => { });
                }
            }} options={[
                {
                    value: "all",
                    label: "I: 全部",
                },
                {
                    value: "positive",
                    label: "I: I+",
                },
            ]} aria-label="Log current mode" className="w-fit da-neutral-select" stableWidth data-cta="Device Analysis" data-cta-position="log-current-mode" data-cta-copy="log current mode"/>) : null}
                </div>

                {effectivePlotType === "gm" ? (<div className="flex items-center gap-1">
                    <Button variant={gmDiagnosticsEnabled ? "secondary" : "text"} size="sm" onClick={() => {
                const next = !gmDiagnosticsEnabled;
                setGmDiagnosticsEnabled(next);
                apiService
                    .updateDeviceAnalysisSettings({
                    gmDiagnosticsEnabled: next,
                })
                    .catch(() => { });
            }} className="h-8 px-2 text-xs" title={t("da_chart_gm_second_diagnostics", { label: gmUi.kindSymbol ?? gmUi.metricSymbol })}>
                      {t("da_chart_gm_second_diagnostics", { label: gmUi.kindSymbol ?? gmUi.metricSymbol })}
                    </Button>
                  </div>) : null}

                {effectivePlotType === "ss" ? (<div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-text-secondary whitespace-nowrap">
                        SS:
                      </span>
                      <DropdownField id="device-analysis-ss-method-select" size="sm" value={ssMethod} onChange={(next: any) => {
                const method = next === "auto" || next === "manual" ? next : "auto";
                setSsMethod(method);
                apiService
                    .updateDeviceAnalysisSettings({
                    ssMethodDefault: method,
                })
                    .catch(() => { });
            }} options={[
                { value: "auto", label: "Auto" },
                { value: "manual", label: "Manual" },
            ]} className="w-[100px]"/>
                    </div>

                    <Button variant={ssShowFitLine ? "secondary" : "text"} size="sm" onClick={() => {
                const next = !ssShowFitLine;
                setSsShowFitLine(next);
                apiService
                    .updateDeviceAnalysisSettings({ ssShowFitLine: next })
                    .catch(() => { });
            }} className="h-8 px-2 text-xs" title="Toggle fit line overlay (focused curve only)">
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
            }} className="h-8 px-2 text-xs" title={t("da_chart_ss_diagnostics_toggle_title")}>
                      {t("da_chart_ss_diagnostics")}
                    </Button>
                  </div>) : null}

                {effectivePlotType === "vth" ? (<div className="flex items-center gap-1">
                    <Button variant={vthDiagnosticsEnabled ? "secondary" : "text"} size="sm" onClick={() => {
                const next = !vthDiagnosticsEnabled;
                setVthDiagnosticsEnabled(next);
                apiService
                    .updateDeviceAnalysisSettings({
                    vthDiagnosticsEnabled: next,
                })
                    .catch(() => { });
            }} className="h-8 px-2 text-xs" title={t("da_chart_vth_diagnostics_toggle_title")}>
                      {t("da_chart_vth_diagnostics")}
                    </Button>
                  </div>) : null}

                {showIonIoffControl ? (<div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-text-secondary whitespace-nowrap">
                        Ion/Ioff:
                      </span>
                      <DropdownField id="device-analysis-current-method-select" size="sm" value={ionIoffMethod} onChange={(next: any) => {
                const method = next === "manual" ? "manual" : "auto";
                setIonIoffMethod(method);
            }} options={[
                { value: "auto", label: "auto" },
                { value: "manual", label: "manual" },
            ]} className="w-fit da-neutral-select"/>
                    </div>
                  </div>) : null}

                {showFileSelect ? (<DropdownField id="device-analysis-file-select" size="sm" value={effectiveActiveFileId ?? ""} onChange={(val: any) => handleSelectFile(val)} options={processedData.map((f: any) => ({
            value: f.fileId,
            label: f.fileName,
        }))} className="w-[240px] da-neutral-select" placeholder="Select File" data-cta="Device Analysis" data-cta-position="file-select" data-cta-copy="file select"/>) : null}
                <Button id="device-analysis-plot-settings-toggle-btn" variant="secondary" size="sm" onClick={() => setShowPlotSettingsPane((v: any) => !v)} title={t("da_chart_plot_settings_title")} aria-pressed={showPlotSettingsPane}>
                  <SlidersHorizontal size={14} strokeWidth={2} />
                  <span>{t("da_chart_plot_settings_title")}</span>
                </Button>
              </div>
            </div>
          </div>

          {activeFile?.series?.length ? (<div className="flex flex-col">

              <div ref={mainChartContainerRef} className="h-[500px] min-h-[500px] flex-shrink-0">
                <MainPlotChart
                    plotType={effectivePlotType}
                    curvePlotType={normalizedOriginOpenPlotOptions.type}
                    curveLineWidth={normalizedOriginOpenPlotOptions.lineWidth}
                    activeFile={activeFile}
                    seriesList={renderPlotSeries}
                    xDomain={xDomain}
                    xTicks={xTicks}
                    plotXFactor={plotXFactor}
                    plotXUnitLabel={resolvedXUnitMeta.label}
                    xTickDigits={xTickDigitsDisplay}
                    xTooltipDigits={xTooltipDigits}
                    curveProbeX={curveProbeX}
                    xLabelInterval={xLabelInterval}
                    effectiveYScale={effectiveYScale}
                    yDomain={yDomain}
                    yTicks={yTicks}
                    yLogCurrentMode={yLogCurrentMode}
                    yScaleMode={yScaleMode}
                    plotYFactor={plotYFactor}
                    plotYUnitLabel={plotYUnitLabel}
                    focusedSeriesId={focusedSeriesId}
                    focusedFitLine={focusedFitLineForRender}
                    vthFitOverlays={focusedVthFitOverlays}
                    focusedSeriesColor={focusedSeriesColor}
                    highlightOverlays={currentOverlaysForVisiblePlot}
                    currentBiasMarkers={currentBiasMarkersForVisiblePlot}
                    focusedSsOverlay={focusedSsOverlayForVisiblePlot}
                    ssOverlayStyle={ssOverlayStyle}
                    interactiveSeriesXs={focusedSeriesXs}
                    currentBiasInteraction={currentManualBiasApplicable
                    ? {
                        enabled: true,
                        markers: currentBiasMarkersForVisiblePlot,
                        onCommit: handleCurrentBiasOverlayCommit,
                    }
                    : null}
                    ssInteraction={effectivePlotType === "ss" && ssMethod === "manual"
                    ? {
                        enabled: true,
                        range: focusedSsOverlayForVisiblePlot,
                        onCommit: handleSsOverlayCommit,
                    }
                    : null}
                    showGrid={axis?.showGrid !== false}
                    showMajorTicks={axis?.showMajorTicks !== false}
                    showMinorTicks={axis?.showMinorTicks !== false}
                    minorTickCount={axis?.minorTickCount || 1}
                    tickLabelFontSize={mainPlotTickLabelFontSize}
                    axisTitleFontSize={mainPlotAxisTitleFontSize}
                    originTickLabelOffset={axis?.originTickLabelOffset}
                    originAxisTitleGap={axis?.originAxisTitleGap}
                    legendWidth={MAIN_PLOT_LEGEND_WIDTH}
                    legendContent={renderOriginSelectionLegend}
                    xAxisLabelOverride={activeAxisTitleOverrides.x}
                    yAxisLabelOverride={activeAxisTitleOverrides.y}
                    onXAxisLabelChange={(nextLabel: string) => setActiveAxisTitleOverride("x", nextLabel)}
                    onYAxisLabelChange={(nextLabel: string) => setActiveAxisTitleOverride("y", nextLabel)}
                  />
              </div>
              {!hasVisiblePlotSeries ? (<div className="mt-2 rounded-lg border border-dashed border-border/70 bg-bg-page/40 px-3 py-2 text-sm text-text-secondary">
                  No visible curves. Use the legend checkboxes to show one or more series.
                </div>) : null}

              {effectivePlotType === "vth" ? (<div className="mt-3 rounded-lg border border-border bg-bg-page/40 px-3 py-2">
                  {focusedVthFitRows.length ? (<ScrollArea axis="x" className="min-w-0 w-full">
                      <div className="min-w-[860px] text-xs">
                        <div className="grid grid-cols-[96px_132px_190px_140px_160px_92px] items-center gap-x-3 border-b border-border/70 px-2 pb-1 text-text-secondary">
                          <span>branch</span>
                          <span className="text-right">Vth</span>
                          <span className="text-right">fit range</span>
                          <span className="text-right">slope</span>
                          <span className="text-right">intercept</span>
                          <span className="text-right">R²</span>
                        </div>
                        <div className="divide-y divide-border/60">
                          {focusedVthFitRows.map((row: any) => (<div key={row.branch} className="grid grid-cols-[96px_132px_190px_140px_160px_92px] items-center gap-x-3 px-2 py-1.5">
                              <span className="font-medium text-text-primary capitalize">{row.branch}</span>
                              <span className="font-mono text-right text-text-primary whitespace-nowrap">{row.vth}</span>
                              <span className="font-mono text-right text-text-primary whitespace-nowrap">{row.fitRange}</span>
                              <span className="font-mono text-right text-text-primary whitespace-nowrap">{row.slope}</span>
                              <span className="font-mono text-right text-text-primary whitespace-nowrap">{row.intercept}</span>
                              <span className="font-mono text-right text-text-primary whitespace-nowrap">{row.r2}</span>
                            </div>))}
                        </div>
                      </div>
                    </ScrollArea>) : (<div className="text-sm text-text-secondary">
                      No stable sqrt(|Id|)-Vg linear branch was found for the focused curve.
                    </div>)}
                </div>) : null}

              {effectivePlotType === "vth" && vthDiagnosticsEnabled && visibleVthSlopeDiagnosticsSeriesForRender.length ? (<div className="mt-4">
                  <div className="text-xs text-text-secondary mb-2">
                    {t("da_chart_vth_diagnostics")}
                  </div>
                  <div ref={diagnosticsChartContainerRef} className="h-[260px] min-h-[260px] flex-shrink-0">
                    <GmDiagnosticsChart series={visibleVthSlopeDiagnosticsSeriesForRender} axisTitleFontSize={mainPlotAxisTitleFontSize} curveProbeX={curveProbeX} tickLabelFontSize={mainPlotTickLabelFontSize} xDomain={xDomain} xTicks={xTicks} xFactor={plotXFactor} xUnitLabel={resolvedXUnitMeta.label} xLabelInterval={xLabelInterval} xTickDigits={xTickDigitsDisplay} xTooltipDigits={xTooltipDigits} yDomain={vthSlopeDiagnosticsYDomain} yTicks={vthSlopeDiagnosticsYTicks} referenceLines={focusedVthSlopeReferenceLines} rightReservedWidth={MAIN_PLOT_LEGEND_WIDTH} yAxisLabel="d√|Id|/dVg" valueUnitLabel={`${plotYUnitLabel}/${resolvedXUnitMeta.label || "V"}`}/>
                  </div>
                </div>) : null}

              {effectivePlotType === "ss" && visibleSsDiagnosticsSeriesForRender.length ? (<div className="mt-4">
                  {ssSummary ? (<div className="mb-3">
                      <SsSummaryStrip summary={ssSummary}/>
                    </div>) : null}
                  <div className="text-xs text-text-secondary mb-2">
                    {t("da_chart_ss_diagnostics")}
                  </div>
                  <div ref={diagnosticsChartContainerRef} className="h-[260px] min-h-[260px] flex-shrink-0">
                    <SsDiagnosticsChart series={visibleSsDiagnosticsSeriesForRender} axisTitleFontSize={mainPlotAxisTitleFontSize} curveProbeX={curveProbeX} tickLabelFontSize={mainPlotTickLabelFontSize} xDomain={xDomain} xTicks={xTicks} xFactor={plotXFactor} xUnitLabel={resolvedXUnitMeta.label} xLabelInterval={xLabelInterval} xTickDigits={xTickDigitsDisplay} xTooltipDigits={xTooltipDigits} yDomain={ssDiagnosticsYDomain} yTicks={ssDiagnosticsYTicks} overlay={focusedSsOverlay} overlayStyle={ssOverlayStyle} ssReferenceValue={ssSummary?.ss} seriesColor={focusedSeriesColor} rightReservedWidth={MAIN_PLOT_LEGEND_WIDTH}/>
                  </div>
                </div>) : null}

              {effectivePlotType === "gm" && gmDiagnosticsEnabled && visibleGmDiagnosticsSeriesForRender.length ? (<div className="mt-4">
                  <div className="text-xs text-text-secondary mb-2">
                    {t("da_chart_gm_second_diagnostics", { label: gmUi.kindSymbol ?? gmUi.metricSymbol })}
                  </div>
                  <div className="text-[11px] text-text-secondary mb-2">
                    {t("da_chart_gm_second_note", { label: gmUi.kindSymbol ?? gmUi.metricSymbol, axisLabel: gmSecondDerivativeAxisLabel })}
                  </div>
                  <div ref={diagnosticsChartContainerRef} className="h-[260px] min-h-[260px] flex-shrink-0">
                    <GmDiagnosticsChart series={visibleGmDiagnosticsSeriesForRender} axisTitleFontSize={mainPlotAxisTitleFontSize} curveProbeX={curveProbeX} tickLabelFontSize={mainPlotTickLabelFontSize} xDomain={xDomain} xTicks={xTicks} xFactor={plotXFactor} xUnitLabel={resolvedXUnitMeta.label} xLabelInterval={xLabelInterval} xTickDigits={xTickDigitsDisplay} xTooltipDigits={xTooltipDigits} yDomain={gmDiagnosticsYDomain} yTicks={gmDiagnosticsYTicks} rightReservedWidth={MAIN_PLOT_LEGEND_WIDTH} yAxisLabel={gmSecondDerivativeAxisLabel} valueUnitLabel={gmSecondDerivativeUnitLabel}/>
                  </div>
                </div>) : null}
            </div>) : (<div className="flex items-center justify-center h-[300px] text-text-secondary">
              No series data for this file.
            </div>)}
        </Card>
      </section>

          <AnalysisDiagnosticsCard
            showDiagnosticsPanel={showDiagnosticsPanel}
            diagnosticsHeading={diagnosticsHeading}
            diagnosticsDescription={diagnosticsDescription}
            diagnosticsContextBadges={diagnosticsContextBadges}
            plotYUnitLabel={activeCurveProbeYUnitLabel}
            showCurveProbePanel={showCurveProbePanel}
            plotXFactor={plotXFactor}
            curveProbeXPlaceholder={t("da_curve_probe_x_placeholder")}
            curveProbeXInput={curveProbeXInput}
            setCurveProbeXInput={setCurveProbeXInput}
            curveProbeMode={curveProbeMode}
            setCurveProbeMode={setCurveProbeMode}
            curveProbeRows={activeCurveProbeRows}
            xTooltipDigits={xTooltipDigits}
            resolvedXUnitLabel={resolvedXUnitMeta.label}
            showAreaDiagnosticsControls={showAreaDiagnosticsControls}
            areaInput={areaInput}
            setAreaInput={setAreaInput}
            areaDiagnosticsSummary={{
                areaValue: area && Number.isFinite(area) && area > 0 ? area : null,
                jon: Number.isFinite(focusedAnalysis?.metrics?.jon) ? focusedAnalysis.metrics.jon : null,
                joff: Number.isFinite(focusedAnalysis?.metrics?.joff) ? focusedAnalysis.metrics.joff : null,
            }}
            transferMetricsApplicable={transferMetricsApplicable}
            analysisCompactInputWrapperClass={ANALYSIS_COMPACT_INPUT_WRAPPER_CLASS}
            analysisCompactInputClass={ANALYSIS_COMPACT_INPUT_CLASS}
            analysisCompactPageFieldClass={ANALYSIS_COMPACT_PAGE_FIELD_CLASS}
          />

          {activeFile?.series?.length ? (<Card id="device-analysis-calculated-parameters-card" variant="panel" className="flex min-w-0 flex-col flex-1">
            <div className="mb-3 flex min-w-0 items-center justify-between gap-3 flex-wrap">
              <div className="flex min-w-0 items-center flex-wrap">
                <Tabs idBase="device-analysis-results-tabs" value={resultsTab} onChange={(next) => setResultsTab(next === "export" || next === "rc" ? next : "metrics")} size="sm" hoverPreview={false} groupLabel={t("da_analysis_results_tabs_label")} itemClassName="!px-3" options={[
                {
                    value: "metrics",
                    label: t("da_analysis_results_tab_metrics"),
                },
                ...(transferMetricsApplicable
                    ? [{
                        value: "rc",
                        label: "Rc",
                    }]
                    : []),
                {
                    value: "export",
                    label: t("da_analysis_results_tab_export"),
                },
            ]}/>
              </div>
              <div
                className="min-w-0 flex-1 truncate text-right text-xs text-text-secondary"
                title={resultsTab === "metrics" ? metricsProgressText : resultsTab === "rc" ? rcStatusText : exportSelectionSummary}
              >
                {resultsTab === "metrics" ? metricsProgressText : resultsTab === "rc" ? rcStatusText : exportSelectionSummary}
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
                        className="sticky left-0 z-20 p-2 text-[14px] font-semibold tracking-wide text-text-secondary text-left whitespace-nowrap align-middle bg-bg-surface shadow-[1px_0_0_var(--color-border)]"
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
                          <th colSpan={2} className="p-2 text-[14px] font-semibold tracking-wide text-text-secondary text-center border-l border-border bg-violet-500/5">
                            {t("da_calc_group_threshold_voltage")}
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
                          <th className="p-2 text-[14px] font-semibold text-text-secondary text-center whitespace-nowrap border-l border-border bg-violet-500/5" title={t("da_calc_group_threshold_voltage_hint")}>
                            Vth,e
                          </th>
                          <th className="p-2 text-[14px] font-semibold text-text-secondary text-center whitespace-nowrap border-l border-border bg-violet-500/5" title={t("da_calc_group_threshold_voltage_hint")}>
                            Vth,h
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
                        </>) : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {metricsRowElements}
                  </tbody>
                </table>
              </ScrollArea>) : resultsTab === "rc" ? (<div className="flex min-w-0 flex-col gap-3">
                <div className="rounded-xl border border-border bg-bg-page/40 px-4 py-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-text-primary">Contact resistance</div>
                      <div className="mt-1 text-xs text-text-secondary">
                        Fits Rtotal * W versus L across selected transfer files and curves.
                      </div>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        void handleAnalyzeRc();
                      }}
                      disabled={rcAnalyzePending || !rcRows.length}
                    >
                      {rcAnalyzePending ? "Running..." : "Run Rc"}
                    </Button>
                  </div>
                </div>
                <ScrollArea axis="x" className="min-w-0 w-full">
                  <table className="w-full min-w-[760px] table-fixed text-sm border-collapse">
                    <colgroup>
                      <col style={{ width: 72 }}/>
                      <col style={{ width: 220 }}/>
                      <col style={{ width: 220 }}/>
                      <col style={{ width: 140 }}/>
                      <col style={{ width: 140 }}/>
                      <col style={{ width: 140 }}/>
                    </colgroup>
                    <thead className="sticky top-0 bg-bg-surface z-10">
                      <tr className="border-b border-border">
                        <th className="p-2 text-xs font-semibold text-text-secondary text-left">Use</th>
                        <th className="p-2 text-xs font-semibold text-text-secondary text-left border-l border-border">File</th>
                        <th className="p-2 text-xs font-semibold text-text-secondary text-left border-l border-border">Series</th>
                        <th className="p-2 text-xs font-semibold text-text-secondary text-left border-l border-border">L</th>
                        <th className="p-2 text-xs font-semibold text-text-secondary text-left border-l border-border">W</th>
                        <th className="p-2 text-xs font-semibold text-text-secondary text-left border-l border-border">Vds</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rcRows.map((row: any) => (
                        <tr key={`${row.fileId}:${row.seriesId}`} className="hover:bg-bg-page/30">
                          <td className="p-2">
                            <input
                              type="checkbox"
                              checked={Boolean(row.include)}
                              onChange={(event) => updateRcGeometry(row.fileId, row.seriesId, { include: event.target.checked })}
                            />
                          </td>
                          <td className="p-2 border-l border-border truncate text-text-primary" title={row.fileName}>
                            {row.fileName}
                          </td>
                          <td className="p-2 border-l border-border truncate text-text-primary" title={row.label}>
                            {row.label}
                          </td>
                          <td className="p-2 border-l border-border">
                            <Input
                              value={row.length}
                              onChange={(value: string) => updateRcGeometry(row.fileId, row.seriesId, { length: value })}
                              size="sm"
                              inputClassName="text-xs"
                            />
                          </td>
                          <td className="p-2 border-l border-border">
                            <Input
                              value={row.width}
                              onChange={(value: string) => updateRcGeometry(row.fileId, row.seriesId, { width: value })}
                              size="sm"
                              inputClassName="text-xs"
                            />
                          </td>
                          <td className="p-2 border-l border-border">
                            <Input
                              value={row.vds}
                              onChange={(value: string) => updateRcGeometry(row.fileId, row.seriesId, { vds: value })}
                              size="sm"
                              inputClassName="text-xs"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
                <div className="rounded-xl border border-border bg-bg-page/40 px-4 py-3">
                  {rcSummary ? (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                      <div>
                        <div className="text-xs text-text-secondary">Vg</div>
                        <div className="font-mono text-text-primary">{formatNumber(rcSummary.vg)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-text-secondary">Rc</div>
                        <div className="font-mono text-text-primary">{formatNumber(rcSummary.rc)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-text-secondary">RcW</div>
                        <div className="font-mono text-text-primary">{formatNumber(rcSummary.rcw)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-text-secondary">Rsh</div>
                        <div className="font-mono text-text-primary">{formatNumber(rcSummary.rSheet)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-text-secondary">R2 / n</div>
                        <div className="font-mono text-text-primary">{formatNumber(rcSummary.r2, { digits: 4 })} / {rcSummary.n ?? "-"}</div>
                      </div>
                    </div>
                  ) : (
                    <div className={`text-sm ${rcAnalyzeError ? "text-red-500" : "text-text-secondary"}`}>
                      {rcAnalyzeError || "No Rc result yet."}
                    </div>
                  )}
                </div>
                {rcCurveRows.length ? (
                  <ScrollArea axis="x" className="min-w-0 w-full max-h-[220px]">
                    <table className="w-full min-w-[720px] table-fixed text-sm border-collapse">
                      <thead className="sticky top-0 bg-bg-surface z-10">
                        <tr className="border-b border-border">
                          {["Vg", "Rc", "RcW", "Rsh", "R2", "n", "warnings"].map((label) => (
                            <th key={label} className="p-2 text-xs font-semibold text-text-secondary text-left border-l border-border first:border-l-0">
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {rcCurveRows.slice(0, 80).map((row: any, index: number) => (
                          <tr key={`${row.vg}-${index}`} className="hover:bg-bg-page/30">
                            <td className="p-2 font-mono text-text-primary">{formatNumber(row.vg)}</td>
                            <td className="p-2 font-mono text-text-primary border-l border-border">{formatNumber(row.rc)}</td>
                            <td className="p-2 font-mono text-text-primary border-l border-border">{formatNumber(row.rcw)}</td>
                            <td className="p-2 font-mono text-text-primary border-l border-border">{formatNumber(row.rSheet)}</td>
                            <td className="p-2 font-mono text-text-primary border-l border-border">{formatNumber(row.r2, { digits: 4 })}</td>
                            <td className="p-2 font-mono text-text-primary border-l border-border">{row.n ?? "-"}</td>
                            <td className="p-2 text-xs text-text-secondary border-l border-border truncate">
                              {Array.isArray(row.warnings) && row.warnings.length ? row.warnings.join(", ") : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollArea>
                ) : null}
              </div>) : (<div className="flex min-w-0 flex-col gap-3">
                <div className="rounded-xl border border-border bg-bg-page/40 px-4 py-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-text-secondary whitespace-nowrap">
                        {t("da_origin_export_mode_label")}
                      </span>
                      <DropdownField
                        id="device-analysis-origin-export-mode-select"
                        size="sm"
                        value={resolvedOriginExportMode}
                        onChange={(next: any) => handleOriginExportModeChange(isDeviceAnalysisOriginExportMode(next)
                            ? next
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
                            value: "workbookBooks",
                            label: t("da_origin_export_mode_workbook_books"),
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
                      <DropdownField
                        id="device-analysis-origin-canvas-scope-select"
                        size="sm"
                        value={originCanvasExportScope}
                        onChange={(next: any) => {
                        const normalizedScope = next === "current" ||
                            next === "filtered" ||
                            next === "selected" ||
                            next === "all"
                            ? next
                            : "selected";
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
                      {showFilteredCanvasKindSelect ? (<>
                          <span className="text-xs text-text-secondary whitespace-nowrap">
                            {t("da_origin_filtered_canvas_kind_label")}
                          </span>
                          <DropdownField
                            id="device-analysis-origin-filtered-canvas-kind-select"
                            size="sm"
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
                      <span className="text-xs text-text-secondary whitespace-nowrap">
                        {t("da_origin_curve_export_mode_label")}
                      </span>
                      <OriginCurveExportMenu
                        curveOptions={originCurveExportOptions}
                        selectedCurveOptionKeySet={selectedOriginCurveExportOptionKeySet}
                        mode={resolvedCurveExportMode}
                        onSelectedCurveOptionKeysChange={setOriginCurveExportSelectedKeys}
                        scopedFileIds={scopedOriginCanvasIds}
                        setMode={setOriginCurveExportMode}
                        replaceMatchingOriginSeriesAcrossFiles={replaceMatchingOriginSeriesAcrossFiles}
                        t={t}
                      />
                      <span className="text-xs text-text-secondary whitespace-nowrap">
                        {t("da_origin_export_content_label")}
                      </span>
                      <OriginExportContentMenu
                        options={originExportContentOptions}
                        selectedKeys={resolvedOriginExportContentKeys}
                        setSelectedKeys={setOriginExportContentKeys}
                        t={t}
                      />
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
                    </div>
                  </div>
                  {resolvedOriginExportMode === "merged" && hasMixedExportYScales ? (
                  <div className="mt-3 space-y-2">
                    <div className="rounded-lg border border-border bg-bg-page/60 px-3 py-2 text-xs text-text-secondary">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true"/>
                          <span>{t("da_origin_export_mode_mixed_y_scale_split_hint")}</span>
                        </div>
                      </div>
                  </div>) : null}
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
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap text-[11px] text-text-secondary">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleSelectFile(entry.fileId);
                                  }}
                                  className="max-w-full truncate rounded-lg p-1 -m-1 text-left text-sm font-medium text-text-primary hover:text-accent"
                                >
                                  {entry.fileName}
                                </button>
                                <span className="inline-flex items-center rounded-full bg-bg-surface px-2 py-0.5">
                                  {t("da_origin_collection_file_curves", {
                                        count: entry.selectedCount,
                                    })}
                                </span>
                                {isExportListCanvasSelectionMode && entry.isCanvasSelected ? (<span className="inline-flex items-center rounded-full bg-accent-terracotta/15 px-2 py-0.5 text-accent-terracotta">
                                    {t("da_origin_export_list_selected_badge")}
                                  </span>) : null}
                              </div>
                            </div>
                            <Button variant="icon" size="icon" className="shrink-0 rounded-full text-text-tertiary hover:text-text-primary" onClick={(event) => {
                    event.stopPropagation();
                    handleRemoveOriginExportEntry(entry.fileId);
                }} title={exportEntryActionLabel} aria-label={exportEntryActionLabel}>
                                <X size={14} strokeWidth={2} />
                              </Button>
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
