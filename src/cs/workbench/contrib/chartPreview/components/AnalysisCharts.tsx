import React, { startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState, } from "react";
import { createPortal } from "react-dom";
import { lxClose } from "cogicon";
import { computeCentralDerivative, computeSubthresholdSwing, computeSubthresholdSwingFitAuto, computeSubthresholdSwingFitInRange, classifySsFit, formatNumber, interpolateCurveAtX, resolveAutoSsSelection, splitBidirectionalCurvePoints, } from "../lib/analysisMath";
import { apiService } from "../services/apiService";
import DropdownField from "cs/base/browser/ui/DropdownField/DropdownField";
import Input from "cs/base/browser/ui/Input/Input";
import Menu from "cs/base/browser/ui/Menu/Menu";
import Button from "cs/base/browser/ui/Button/Button";
import Card from "cs/base/browser/ui/Card/Card";
import Checkbox from "cs/base/browser/ui/Checkbox/Checkbox";
import InlineEditableText from "cs/base/browser/ui/InlineEditableText/InlineEditableText";
import ScrollArea from "cs/base/browser/ui/scrollArea/scrollArea";
import Tabs from "cs/base/browser/ui/tabs/tabs";
import Toast from "cs/base/browser/ui/toast/toast";
import SplitView from "src/cs/base/browser/ui/splitview/splitview";
import CogIcon from "src/cs/base/browser/ui/CogIcon/cogicon";
import { lxSlidersHorizontal } from "src/cs/base/browser/ui/CogIcon/icons";
import { useLanguage } from "src/cs/workbench/browser/hooks/useLanguage";
import { getChartColor, resolveSeriesChartColor } from "../lib/chartColors";
import {
  DEFAULT_ORIGIN_PLOT_OPTIONS,
  normalizeOriginPlotOptions,
  type OriginPlotOptions,
} from "../lib/origin/originPlotOptions";
import {
  DEFAULT_PLOT_AXIS_SETTINGS,
  normalizePlotAxisSettings,
  type PlotAxisSettings,
} from "../lib/plotAxisSettings";
import {
  isOriginExportMode,
  resolveSeriesLabel,
  type OriginExportContentKey,
  type OriginExportMode,
} from "../lib/origin/originSelectionExport";
import type { ToastState, ToastType } from "src/cs/workbench/common/deviceAnalysis/sharedTypes";
import { useAnalysisFileCache } from "../useAnalysisFileCache";
import {
  useOriginCanvasExport,
  resolveOriginSeriesMatchTokens,
  type OriginFilteredCanvasKind,
  type OriginCanvasExportScope,
  type OriginCurveExportMode,
} from "../useOriginCanvasExport";
import { useFileSelectionPool } from "../useFileSelectionPool";
import {
  useDeviceAnalysisSidebarPortal,
} from "src/cs/workbench/browser/layout";
import OverviewGrid from "./OverviewGrid";
import CalculatedParametersRow from "src/cs/workbench/contrib/parameters/CalculatedParametersRow";
import { SIGNED_LOG_Y_DATA_KEY, buildLogTicks, buildNiceTicks, buildOriginAutoTicks, buildOriginLogAutoTicks, buildPoints, buildStepTicks, computeLabelInterval, computeMinMax, downsamplePointsForDisplay, inferTickDigitsFromTicks, normalizeFloat, normalizeVarToken, padLinearDomain, padLogDomain, parseOptionalNumber, preserveScrollPosition, varTokenToSymbol, withSignedLogPositivePoints, } from "../lib/analysisChartsUtils";
import { computeBaseCurrentMetrics, isOutputLikeFile, isTransferLikeFile, } from "../lib/metrics";
import { ANALYSIS_CACHE_VERSION, canUseCachedBaseCurrent, } from "../lib/analysisCachePolicy";
import {
  DEVICE_ANALYSIS_CAPACITANCE_Y_UNIT_VALUES,
  DEVICE_ANALYSIS_CURRENT_Y_UNIT_VALUES,
  getXUnitMeta,
  getYUnitMeta,
  isCapacitanceYUnit,
  isCurrentYUnit,
  normalizeYUnit,
  type YUnit,
} from "../lib/units";
import { getPerfNow, logPerf, startPerf } from "src/cs/workbench/common/deviceAnalysis/perf";
import { getWorkbenchEnvironment } from "src/cs/workbench/services/environment/browser/environmentService";
import MainPlotChart from "./MainPlotChart";
import GmDiagnosticsChart from "./GmDiagnosticsChart";
import SsDiagnosticsChart from "./SsDiagnosticsChart";
import SsSummaryStrip from "src/cs/workbench/contrib/parameters/SsSummaryStrip";
import AnalysisDiagnosticsCard from "src/cs/workbench/contrib/parameters/AnalysisDiagnosticsCard";
import AxisSettingsPane from "src/cs/workbench/contrib/parameters/AxisSettingsPane";
import CanvasDiagnosticsChart from "./CanvasDiagnosticsChart";
import OriginExportToolbar, {
  type OriginCurveExportSeriesOption,
  type OriginExportContentOption,
} from "./OriginExportToolbar";
import RcAnalysisToolbar from "src/cs/workbench/contrib/parameters/RcAnalysisToolbar";
type SsRange = {
    x1: number;
    x2: number;
};
type CurrentBiasRole = "ion" | "ioff";
type PlotTypeOption = "iv" | "gm" | "ss" | "vth" | "j";
type ResultsTabOption = "metrics" | "export" | "rc";
type RcGeometryEntry = {
    length?: string;
    vds?: string;
    width?: string;
};
type RcGeometryByFileId = Record<string, Record<string, RcGeometryEntry>>;
const RC_FILE_GEOMETRY_KEY = "__file__";
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
const ORIGIN_CURVE_SELECTION_DETAIL_ROW_CLASS = "mt-2.5";
const TOOLTIP_SERIES_NAME_SEPARATOR = "\u0000";
const ORIGIN_EXPORT_CONTENT_OPTIONS: OriginExportContentOption[] = [
    { group: "basic", key: "iv", labelKey: "da_origin_export_content_iv" },
    { group: "basic", key: "metrics", labelKey: "da_origin_export_content_metrics" },
    { group: "derived", key: "gm", labelKey: "da_origin_export_content_gm" },
    { group: "derived", key: "gds", labelKey: "da_origin_export_content_gds" },
    { group: "derived", key: "ss", labelKey: "da_origin_export_content_ss" },
    { group: "derived", key: "vth", labelKey: "da_origin_export_content_vth" },
];
const DEFAULT_ORIGIN_EXPORT_CONTENT_KEYS: OriginExportContentKey[] = ["iv"];
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
    if (isTransferLikeFile(fileLike)) {
        return [
            primaryOption,
            { group: "basic", key: "metrics", labelKey: "da_origin_export_content_metrics" },
            { group: "derived", key: "gm", labelKey: "da_origin_export_content_gm" },
            { group: "derived", key: "ss", labelKey: "da_origin_export_content_ss" },
            { group: "derived", key: "vth", labelKey: "da_origin_export_content_vth" },
        ];
    }
    if (isOutputLikeFile(fileLike)) {
        return [
            primaryOption,
            { group: "basic", key: "metrics", labelKey: "da_origin_export_content_metrics" },
            { group: "derived", key: "gds", labelKey: "da_origin_export_content_gds" },
        ];
    }
    return [primaryOption];
};
const normalizeOriginExportContentKeysForOptions = (
    keys: readonly OriginExportContentKey[] | null | undefined,
    options: readonly OriginExportContentOption[],
): OriginExportContentKey[] => {
    const allowedKeys = new Set(options.map((option) => option.key));
    const normalized = (Array.isArray(keys) ? keys : DEFAULT_ORIGIN_EXPORT_CONTENT_KEYS)
        .filter((key): key is OriginExportContentKey => allowedKeys.has(key));
    return normalized.length ? Array.from(new Set(normalized)) : DEFAULT_ORIGIN_EXPORT_CONTENT_KEYS;
};

type OriginCurveSelectionSeriesEntry = {
    key: string;
    label: string;
    selected: boolean;
};

type OriginCurveSelectionEntry = {
    allSeriesSelected: boolean;
    fileId: string;
    fileName: string;
    isCanvasSelected?: boolean;
    selectedCount: number;
    series: OriginCurveSelectionSeriesEntry[];
};

const areOriginCurveSelectionSeriesEqual = (
    prev: OriginCurveSelectionSeriesEntry,
    next: OriginCurveSelectionSeriesEntry,
) => prev.key === next.key && prev.label === next.label && prev.selected === next.selected;

const OriginCurveSelectionSeriesChip = React.memo(function OriginCurveSelectionSeriesChip({
    curveMode,
    fileId,
    onSetCurveMode,
    onToggleSeriesForFile,
    series,
}: {
    curveMode: OriginCurveExportMode;
    fileId: string;
    onSetCurveMode: (nextMode: OriginCurveExportMode) => void;
    onToggleSeriesForFile: (fileId: string, seriesKey: string) => void;
    series: OriginCurveSelectionSeriesEntry;
}) {
    const handleClick = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (curveMode === "all") {
            onSetCurveMode("select");
        }
        onToggleSeriesForFile(fileId, series.key);
    }, [curveMode, fileId, onSetCurveMode, onToggleSeriesForFile, series.key]);

    return (
        <button
          type="button"
          onClick={handleClick}
          className={`inline-flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] leading-none ${series.selected
                ? "border-accent/30 bg-accent/5 text-text-primary"
                : "border-border bg-bg-surface text-text-secondary"} ${curveMode === "select"
                ? "cursor-pointer"
                : "cursor-default"}`}
        >
          <Checkbox checked={series.selected} size="sm" className="shrink-0" />
          <span className="truncate whitespace-nowrap">{series.label}</span>
        </button>
    );
}, (prev, next) =>
    prev.curveMode === next.curveMode &&
    prev.fileId === next.fileId &&
    prev.onSetCurveMode === next.onSetCurveMode &&
    prev.onToggleSeriesForFile === next.onToggleSeriesForFile &&
    areOriginCurveSelectionSeriesEqual(prev.series, next.series));

const areOriginCurveSelectionEntriesEqual = (
    prev: OriginCurveSelectionEntry,
    next: OriginCurveSelectionEntry,
) => {
    if (
        prev.allSeriesSelected !== next.allSeriesSelected ||
        prev.fileId !== next.fileId ||
        prev.fileName !== next.fileName ||
        prev.isCanvasSelected !== next.isCanvasSelected ||
        prev.selectedCount !== next.selectedCount ||
        prev.series.length !== next.series.length
    ) {
        return false;
    }
    return prev.series.every((series, index) => areOriginCurveSelectionSeriesEqual(series, next.series[index]));
};

const OriginCurveSelectionEntryRow = React.memo(function OriginCurveSelectionEntryRow({
    curveMode,
    entry,
    exportEntryActionLabel,
    fileCurvesLabel,
    isSelectionMode,
    onClearAllSeriesForFile,
    onRemoveEntry,
    onSelectAllSeriesForFile,
    onSelectFile,
    onSetCurveMode,
    onToggleFile,
    onToggleSeriesForFile,
    pickAllLabel,
    renderFileExtra,
    selectedBadgeLabel,
    showRemoveButton,
    showSeriesControls,
}: {
    curveMode: OriginCurveExportMode;
    entry: OriginCurveSelectionEntry;
    exportEntryActionLabel: string;
    fileCurvesLabel: string;
    isSelectionMode: boolean;
    onClearAllSeriesForFile: (fileId: string) => void;
    onRemoveEntry: (fileId: string) => void;
    onSelectAllSeriesForFile: (fileId: string) => void;
    onSelectFile: (fileId: string) => void;
    onSetCurveMode: (nextMode: OriginCurveExportMode) => void;
    onToggleFile: (fileId: string) => void;
    onToggleSeriesForFile: (fileId: string, seriesKey: string) => void;
    pickAllLabel: string;
    renderFileExtra?: (entry: OriginCurveSelectionEntry) => React.ReactNode;
    selectedBadgeLabel: string;
    showRemoveButton: boolean;
    showSeriesControls: boolean;
}) {
    const fileExtra = renderFileExtra ? renderFileExtra(entry) : null;
    const handleToggleFile = React.useCallback(() => {
        onToggleFile(entry.fileId);
    }, [entry.fileId, onToggleFile]);
    const handleKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onToggleFile(entry.fileId);
    }, [entry.fileId, onToggleFile]);
    const handleSelectFile = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        onSelectFile(entry.fileId);
    }, [entry.fileId, onSelectFile]);
    const handleRemove = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        onRemoveEntry(entry.fileId);
    }, [entry.fileId, onRemoveEntry]);
    const handleToggleAllSeries = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (curveMode === "all") {
            onSetCurveMode("select");
        }
        if (entry.allSeriesSelected) {
            onClearAllSeriesForFile(entry.fileId);
            return;
        }
        onSelectAllSeriesForFile(entry.fileId);
    }, [
        curveMode,
        entry.allSeriesSelected,
        entry.fileId,
        onClearAllSeriesForFile,
        onSelectAllSeriesForFile,
        onSetCurveMode,
    ]);
    const stopFileExtraEvent = React.useCallback((event: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>) => {
        const target = event.target;
        const interactiveTarget = target instanceof Element
            ? target.closest("a, button, input, label, select, textarea, [contenteditable='true'], [data-style='input'], [role='button'], [role='textbox'], [data-prevent-selection-toggle='true']")
            : null;
        if (interactiveTarget && event.currentTarget.contains(interactiveTarget)) {
            event.stopPropagation();
        }
    }, []);

    return (
        <div
          className={`rounded-xl border border-border bg-bg-page/40 px-3 py-2.5 ${isSelectionMode ? "cursor-pointer" : ""}`}
          onClick={isSelectionMode ? handleToggleFile : undefined}
          onKeyDown={isSelectionMode ? handleKeyDown : undefined}
          role={isSelectionMode ? "button" : undefined}
          tabIndex={isSelectionMode ? 0 : undefined}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap text-[11px] text-text-secondary">
                <button
                  type="button"
                  onClick={handleSelectFile}
                  className="max-w-full truncate rounded-lg p-1 -m-1 text-left text-sm font-medium text-text-primary hover:text-accent"
                >
                  {entry.fileName}
                </button>
                <span className="inline-flex items-center rounded-full bg-bg-surface px-2 py-0.5">
                  {fileCurvesLabel}
                </span>
                {isSelectionMode && entry.isCanvasSelected ? (<span className="inline-flex items-center rounded-full bg-accent-terracotta/15 px-2 py-0.5 text-accent-terracotta">
                    {selectedBadgeLabel}
                  </span>) : null}
              </div>
            </div>
            {showRemoveButton ? (<Button variant="icon" size="icon" className="shrink-0 rounded-full text-text-tertiary hover:text-text-primary" onClick={handleRemove} title={exportEntryActionLabel} aria-label={exportEntryActionLabel}>
              <CogIcon icon={lxClose} size={14} />
            </Button>) : null}
          </div>
          {showSeriesControls ? (<div className={ORIGIN_CURVE_SELECTION_DETAIL_ROW_CLASS}>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleToggleAllSeries}
                className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-bg-surface px-2 py-1 text-[11px] leading-none text-text-secondary hover:text-text-primary"
              >
                <Checkbox checked={entry.allSeriesSelected} size="sm" />
                <span className="whitespace-nowrap">{pickAllLabel}</span>
              </button>
              {entry.series.map((series) => (
                <OriginCurveSelectionSeriesChip
                  key={series.key}
                  curveMode={curveMode}
                  fileId={entry.fileId}
                  onSetCurveMode={onSetCurveMode}
                  onToggleSeriesForFile={onToggleSeriesForFile}
                  series={series}
                />
              ))}
            </div>
          </div>) : null}
          {fileExtra ? (<div
              className={ORIGIN_CURVE_SELECTION_DETAIL_ROW_CLASS}
              onClick={stopFileExtraEvent}
              onKeyDown={stopFileExtraEvent}
            >
              {fileExtra}
            </div>) : null}
        </div>
    );
}, (prev, next) =>
    prev.curveMode === next.curveMode &&
    prev.exportEntryActionLabel === next.exportEntryActionLabel &&
    prev.fileCurvesLabel === next.fileCurvesLabel &&
    prev.isSelectionMode === next.isSelectionMode &&
    prev.onClearAllSeriesForFile === next.onClearAllSeriesForFile &&
    prev.onRemoveEntry === next.onRemoveEntry &&
    prev.onSelectAllSeriesForFile === next.onSelectAllSeriesForFile &&
    prev.onSelectFile === next.onSelectFile &&
    prev.onSetCurveMode === next.onSetCurveMode &&
    prev.onToggleFile === next.onToggleFile &&
    prev.onToggleSeriesForFile === next.onToggleSeriesForFile &&
    prev.pickAllLabel === next.pickAllLabel &&
    prev.renderFileExtra === next.renderFileExtra &&
    prev.selectedBadgeLabel === next.selectedBadgeLabel &&
    prev.showRemoveButton === next.showRemoveButton &&
    prev.showSeriesControls === next.showSeriesControls &&
    areOriginCurveSelectionEntriesEqual(prev.entry, next.entry));

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
    editHint: string;
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
    editHint,
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
        <Checkbox checked={checked} />
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
        title={`${label}\n${editHint}`}
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
const formatCurrentWindowSummary = (window: any, xFactor: number, digits: number, labels?: {
    notSelected?: string;
    window?: string;
}): string => {
    const notSelectedLabel = String(labels?.notSelected ?? "not selected");
    const windowLabel = String(labels?.window ?? "window");
    if (!window)
        return notSelectedLabel;
    const parts = [String(window?.label || windowLabel)];
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
const formatCurveProbeBranchSuffix = (branchRaw: unknown, labels?: {
    forward?: string;
    reverse?: string;
}): string => {
    const forwardLabel = String(labels?.forward ?? "forward");
    const reverseLabel = String(labels?.reverse ?? "reverse");
    const branch = String(branchRaw ?? "").trim().toLowerCase();
    if (branch === "forward")
        return ` (${forwardLabel})`;
    if (branch === "reverse")
        return ` (${reverseLabel})`;
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
    isTransferLikeFile(fileLike) || isLinearDefaultCurve(fileLike);
const resolveSpecialCurveType = (fileLike: any): "cv" | "cf" | "pv" | null => {
    const curveType = String(fileLike?.curveType ?? "").trim().toLowerCase();
    return curveType === "cv" || curveType === "cf" || curveType === "pv"
        ? curveType
        : null;
};
const resolveDefaultYUnitForFile = (fileLike: any): YUnit => {
    if (isCapacitanceCurve(fileLike))
        return "pF";
    return normalizeYUnit(fileLike?.yUnit, "A") || "A";
};
const resolveAllowedYUnitsForFile = (fileLike: any): readonly YUnit[] => isCapacitanceCurve(fileLike)
    ? DEVICE_ANALYSIS_CAPACITANCE_Y_UNIT_VALUES
    : DEVICE_ANALYSIS_CURRENT_Y_UNIT_VALUES;
const isYUnitAllowedForFile = (unit: unknown, fileLike: any): unit is YUnit => isCapacitanceCurve(fileLike)
    ? isCapacitanceYUnit(unit)
    : isCurrentYUnit(unit);
const normalizeYUnitByFileIdRecord = (value: unknown): Record<string, YUnit> => {
    return normalizeByFileIdRecord(value, (unit) => {
        const normalizedUnit = normalizeYUnit(unit, "A");
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
    const { t } = useLanguage();
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
        idBase="analysis-plot-type-tabs"
        value={displayedPlotType}
        onChange={(next) => selectPlotType(next as PlotTypeOption)}
        size="sm"
        hoverPreview={false}
        groupLabel={t("da_plot_type_group_label")}
        itemClassName="!px-3"
        options={[
            {
                value: "iv",
                label: primaryPlotLabel || "I-V",
                id: "analysis-plot-iv-btn",
            },
            {
                value: "gm",
                label: derivativeLabel,
                id: "analysis-plot-gm-btn",
                disabled: !gmApplicable,
                title: !gmApplicable
                    ? t("da_plot_type_gm_unavailable_hint")
                    : "",
            },
            {
                value: "ss",
                label: "SS",
                id: "analysis-plot-ss-btn",
                disabled: !ssApplicable,
                title: !ssApplicable
                    ? t("da_plot_type_ss_unavailable_hint")
                    : "",
            },
            {
                value: "vth",
                label: "Vth",
                id: "analysis-plot-vth-btn",
                disabled: !vthApplicable,
                title: !vthApplicable
                    ? t("da_plot_type_vth_unavailable_hint")
                    : "",
            },
            {
                value: "j",
                label: "J",
                id: "analysis-plot-j-btn",
                disabled: !areaAvailable,
                title: !areaAvailable ? t("da_plot_type_j_unavailable_hint") : "",
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
    const sidebarPortal = useDeviceAnalysisSidebarPortal();
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
    const [persistedYUnitByFileId, setPersistedYUnitByFileId] = useState<Record<string, YUnit>>({});
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
    const [originExportMode, setOriginExportMode] = useState<OriginExportMode>("merged");
    const [originCanvasExportScope, setOriginCanvasExportScope] = useState<OriginCanvasExportScope>("selected");
    const [originCurveExportMode, setOriginCurveExportMode] = useState<OriginCurveExportMode>("all");
    const [originExportContentKeys, setOriginExportContentKeys] = useState<OriginExportContentKey[]>(DEFAULT_ORIGIN_EXPORT_CONTENT_KEYS);
    const [originFilteredCanvasKind, setOriginFilteredCanvasKind] = useState<OriginFilteredCanvasKind>("output");
    // User-picked curve legend template. File-level checkboxes are derived from this, not the source of truth.
    const [originCurveExportSelectedKeys, setOriginCurveExportSelectedKeys] = useState<string[] | null>(null);
    const [rcBiasSelectionKey, setRcBiasSelectionKey] = useState<string | null>(null);
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
    const toastRef = useRef<Toast | null>(null);
    const mainChartContainerRef = useRef<HTMLDivElement | null>(null);
    const diagnosticsChartContainerRef = useRef<HTMLDivElement | null>(null);
    const environment = getWorkbenchEnvironment();
    const isWindowsDesktopShell = environment?.isDesktop === true && environment?.platform === "win32";
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
        const toastController = new Toast();
        toastRef.current = toastController;
        return () => {
            toastRef.current = null;
            toastController.dispose();
        };
    }, []);
    useEffect(() => {
        const toastController = toastRef.current;
        if (!toastController) return;
        if (!toast.isVisible) {
            toastController.hide();
            return;
        }
        toastController.show({
            container: toastContainerRef.current,
            message: toast.message,
            onClose: closeToast,
            position: "absolute",
            type: toast.type,
        });
    }, [closeToast, toast.isVisible, toast.message, toast.type]);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const settings = await apiService.getSettings();
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
                if (isOriginExportMode(exportMode)) {
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
        if (isTransferLikeFile(fileLike))
            return defaultYScaleForTransfer;
        if (isOutputLikeFile(fileLike))
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
    const resolveYUnitForFile = React.useCallback((fileLike: any): YUnit => {
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
        return resolveSeriesLabel(series, index);
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
    const resolvedXUnitMeta = useMemo(() => getXUnitMeta(activeFile?.xUnit), [activeFile?.xUnit]);
    const activeYUnit = useMemo(() => resolveYUnitForFile(activeFile), [activeFile, resolveYUnitForFile]);
    const activeYUnitOptions = useMemo(() => resolveAllowedYUnitsForFile(activeFile), [activeFile]);
    const resolvedYUnitMeta = useMemo(() => getYUnitMeta(activeYUnit), [activeYUnit]);
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
                .updateSettings({
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
    const isExportPaneActive = resultsTab === "export" || resultsTab === "rc";
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
    const rcBiasOptions = useMemo<OriginCurveExportSeriesOption[]>(() => {
        const optionMap = new Map<string, OriginCurveExportSeriesOption>();
        for (const file of Array.isArray(processedData) ? processedData : []) {
            const fileId = String(file?.fileId ?? "").trim();
            if (!fileId || !isTransferLikeFile(file)) continue;
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
    }, [processedData, resolveDisplayLegendLabel]);
    const rcStatisticAvailableFileIds = useMemo(
        () => (Array.isArray(processedData) ? processedData : [])
            .filter((file: any) => isTransferLikeFile(file))
            .map((file: any) => String(file?.fileId ?? "").trim())
            .filter(Boolean),
        [processedData],
    );
    const {
        selectedFileIdSet: selectedRcStatisticFileIdSet,
        toggleFileSelection: toggleRcStatisticFileSelection,
    } = useFileSelectionPool({
        availableFileIds: rcStatisticAvailableFileIds,
        initialSelectedFileIds: scopedOriginCanvasIds,
    });
    const selectedRcBiasKey = useMemo(() => {
        const availableKeys = new Set(rcBiasOptions.map((option) => option.key));
        if (rcBiasSelectionKey && availableKeys.has(rcBiasSelectionKey))
            return rcBiasSelectionKey;
        return rcBiasOptions[0]?.key ?? "";
    }, [rcBiasOptions, rcBiasSelectionKey]);
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
    const handleOriginExportModeChange = React.useCallback((nextMode: OriginExportMode) => {
        setOriginExportMode(nextMode);
        apiService
            .updateSettings({
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
    const transferMetricsApplicable = useMemo(() => isTransferLikeFile(activeFile), [activeFile]);
    const outputMetricsApplicable = useMemo(() => isOutputLikeFile(activeFile), [activeFile]);
    const calculatedParametersMode = useMemo(() => transferMetricsApplicable ? "transfer" : outputMetricsApplicable ? "output" : "generic", [outputMetricsApplicable, transferMetricsApplicable]);
    const rcTransferAvailable = useMemo(
        () => (Array.isArray(processedData) ? processedData : []).some((file: any) => isTransferLikeFile(file)),
        [processedData],
    );
    useEffect(() => {
        if (!rcTransferAvailable && resultsTab === "rc") {
            setResultsTab("metrics");
        }
    }, [rcTransferAvailable, resultsTab]);
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
        const startedAt = getPerfNow();
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
            logPerf("analysis:active-points", {
                fileId: activeFile.fileId,
                fileName: activeFile.fileName ?? null,
                builtPointCount,
                builtSeriesCount,
                durationMs: getPerfNow() - startedAt,
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
        const finishAnalysisPerf = startPerf("analysis:detail-file", {
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
            const chunkStartedAt = getPerfNow();
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
                logPerf("analysis:detail-chunk", {
                    fileId: activeFile?.fileId ?? null,
                    fileName: activeFile?.fileName ?? null,
                    completedCount: workingMap.size,
                    durationMs: getPerfNow() - chunkStartedAt,
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
        const finishPerf = startPerf("render:plot-series", {
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
                return (<EditableLegendItem key={seriesId || `${label}-${idx}`} checked={checked} color={color} editHint={t("da_legend_edit_hint")} disabled={disabled} isEditing={isEditing} label={label} fontSize={mainPlotLegendFontSize} onBeginEdit={() => beginLegendLabelEdit(activeLegendFileId, series, idx)} onCancelEdit={cancelLegendLabelEdit} onCommitEdit={commitLegendLabelEdit} onDraftChange={setEditingLegendDraft} onToggleVisible={() => {
                        if (!disabled)
                            toggleVisibleSeries(seriesId);
                    }} draftValue={editingLegendDraft} inputRef={isEditing ? editingLegendInputRef : undefined}/>);
            })}
      </ul>);
    }, [activeFile?.fileId, beginLegendLabelEdit, cancelLegendLabelEdit, commitLegendLabelEdit, editingLegendDraft, editingLegendLabel, mainPlotLegendFontSize, plotLegendSeries, resolveDisplayLegendLabel, t, toggleVisibleSeries, visibleSeriesKeySet]);
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
                name: `${baseName}${formatCurveProbeBranchSuffix(segment?.branch, {
                    forward: t("da_curve_branch_forward"),
                    reverse: t("da_curve_branch_reverse"),
                })}`,
                sample: interpolateCurveAtX(segment?.points, curveProbeX, curveProbeMode),
            }));
        });
    }, [curveProbeMode, curveProbeX, displayPlotSeries, t]);
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
                ? t("da_chart_log_positive_warning")
                : t("da_chart_log_nonzero_warning");
        }
        return "";
    }, [effectiveYScale, t, yLogCurrentMode, yScaleMode]);
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
                name: `${series.lineName}${formatCurveProbeBranchSuffix(segment?.branch, {
                    forward: t("da_curve_branch_forward"),
                    reverse: t("da_curve_branch_reverse"),
                })}`,
                sample: interpolateCurveAtX(segment?.points, curveProbeX, curveProbeMode),
            })));
        }
        return curveProbeRows;
    }, [curveProbeMode, curveProbeRows, curveProbeX, effectivePlotType, gmDiagnosticsEnabled, t, visibleGmDiagnosticsSeries]);
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
            const parts = [`${t("da_current_tooltip_method")}=${row.currentMethod ?? t("da_current_tooltip_unavailable")}`];
            if (row.ionWindow) {
                parts.push(`${t("da_current_tooltip_ion")} ${formatCurrentWindowSummary(row.ionWindow, plotXFactor, xTooltipDigits, {
                    notSelected: t("da_current_window_not_selected"),
                    window: t("da_current_window_label"),
                })}`);
            }
            if (row.ioffWindow) {
                parts.push(`${t("da_current_tooltip_ioff")} ${formatCurrentWindowSummary(row.ioffWindow, plotXFactor, xTooltipDigits, {
                    notSelected: t("da_current_window_not_selected"),
                    window: t("da_current_window_label"),
                })}`);
            }
            if (Array.isArray(row.currentCandidateWindows) && row.currentCandidateWindows.length) {
                parts.push(`${t("da_current_tooltip_candidates")}=${row.currentCandidateWindows
                    .map((window: any) => formatCurrentWindowSummary(window, plotXFactor, xTooltipDigits, {
                    notSelected: t("da_current_window_not_selected"),
                    window: t("da_current_window_label"),
                }))
                    .join(" | ")}`);
            }
            return parts.join(" | ");
        }
        const window = role === "ion" ? row.ionWindow : row.ioffWindow;
        return formatCurrentWindowSummary(window, plotXFactor, xTooltipDigits, {
            notSelected: t("da_current_window_not_selected"),
            window: t("da_current_window_label"),
        });
    }, [plotXFactor, t, xTooltipDigits]);
    const calculatedParametersColumnWidths = useMemo(() => calculatedParametersMode === "transfer"
        ? TRANSFER_CALCULATED_PARAMETERS_COLUMN_WIDTHS_PX
        : DERIVATIVE_ONLY_CALCULATED_PARAMETERS_COLUMN_WIDTHS_PX, [calculatedParametersMode]);
    const calculatedParametersTableMinWidth = useMemo(() => calculatedParametersColumnWidths.reduce((total, width) => total + width, 0), [calculatedParametersColumnWidths]);
    const metricsRowElements = useMemo(() => metricsRows.map((row: any) => (<CalculatedParametersRow key={row.id} row={row} isPending={Boolean(row?.isPending)} buildCurrentTooltip={buildCurrentTooltip} buildSsTooltip={buildSsTooltip} showTransferMetrics={calculatedParametersMode === "transfer"}/>)), [buildCurrentTooltip, buildSsTooltip, calculatedParametersMode, metricsRows]);
    const rcStatisticListEntries = useMemo(() => {
        return (Array.isArray(processedData) ? processedData : [])
            .map((file: any) => {
            const fileId = String(file?.fileId ?? "").trim();
            if (!fileId || !isTransferLikeFile(file))
                return null;
            const series = (Array.isArray(file?.series) ? file.series : [])
                .map((series: any, index: number) => {
                const seriesId = String(series?.id ?? "").trim();
                if (!seriesId)
                    return null;
                const tokens = resolveOriginSeriesMatchTokens(series);
                const key = tokens[0] ?? `series:${fileId}:${seriesId}`;
                const selected = key === selectedRcBiasKey;
                return {
                    key,
                    label: resolveDisplayLegendLabel(fileId, series, index),
                    selected,
                };
            })
                .filter((series: any): series is {
                key: string;
                label: string;
                selected: boolean;
            } => Boolean(series));
            const selectedCount = series.filter((item: { selected: boolean }) => item.selected).length;
            return {
                fileId,
                fileName: String(file?.fileName ?? fileId),
                isCanvasSelected: selectedRcStatisticFileIdSet.has(fileId),
                selectedCount,
                allSeriesSelected: selectedCount > 0,
                series,
            };
        })
            .filter((entry): entry is (typeof exportListEntries)[number] => Boolean(entry));
    }, [
        exportListEntries,
        processedData,
        resolveDisplayLegendLabel,
        selectedRcBiasKey,
        selectedRcStatisticFileIdSet,
    ]);
    const rcRows = useMemo(() => {
        if (!rcStatisticListEntries.length)
            return [];
        const filesById = new Map<string, any>();
        for (const file of Array.isArray(processedData) ? processedData : []) {
            const fileId = String(file?.fileId ?? "").trim();
            if (fileId)
                filesById.set(fileId, file);
        }
        return rcStatisticListEntries.flatMap((entry: any) => {
            const fileId = String(entry?.fileId ?? "").trim();
            if (!selectedRcStatisticFileIdSet.has(fileId))
                return [];
            const file = filesById.get(fileId);
            if (!isTransferLikeFile(file))
                return [];
            const xGroups = Array.isArray(file?.xGroups) ? file.xGroups : [];
            const seriesList = Array.isArray(file?.series) ? file.series : [];
            const selectedSeriesIds = new Set(
                (Array.isArray(entry?.series) ? entry.series : [])
                    .filter((series: any) => series?.selected)
                    .map((series: any) => String(series?.key ?? "").trim())
                    .filter(Boolean),
            );
            return seriesList
                .map((series: any, index: number) => {
                const seriesId = String(series?.id ?? "").trim();
                const tokens = resolveOriginSeriesMatchTokens(series);
                const seriesKey = tokens[0] ?? `series:${fileId}:${seriesId}`;
                if (!seriesId || !selectedSeriesIds.has(seriesKey))
                    return null;
                const fileGeometry = fileId ? rcGeometryByFileId[fileId]?.[RC_FILE_GEOMETRY_KEY] ?? {} : {};
                const stored = fileId && seriesId ? rcGeometryByFileId[fileId]?.[seriesId] ?? {} : {};
                const legendVds = Number(series?.legendValue);
                const xArr = xGroups[Number(series?.groupIndex ?? 0)] ?? [];
                const yArr = Array.isArray(series?.y) ? series.y : [];
                return {
                    fileId,
                    fileName: String(file?.fileName ?? (fileId || "device")),
                    label: resolveDisplayLegendLabel(fileId, series, index),
                    length: fileGeometry.length ?? "",
                    series,
                    seriesId,
                    vds: stored.vds ?? (Number.isFinite(legendVds) && legendVds !== 0 ? String(legendVds) : "0.1"),
                    width: fileGeometry.width ?? "",
                    x: xArr,
                    y: yArr,
                };
            })
                .filter(Boolean);
        });
    }, [processedData, rcGeometryByFileId, rcStatisticListEntries, resolveDisplayLegendLabel, selectedRcStatisticFileIdSet]);
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
    const toggleRcStatisticFileSelectionForRc = React.useCallback((fileIdRaw: string) => {
        const fileId = String(fileIdRaw ?? "").trim();
        if (!fileId)
            return;
        toggleRcStatisticFileSelection(fileId);
    }, [toggleRcStatisticFileSelection]);
    const rcListEntries = useMemo(() => {
        const grouped = new Map<string, any>();
        for (const row of rcRows as any[]) {
            const fileId = String(row?.fileId ?? "").trim();
            if (!fileId)
                continue;
            const existing = grouped.get(fileId) ?? {
                fileId,
                fileName: row.fileName,
                length: row.length,
                rows: [],
                width: row.width,
            };
            existing.rows.push(row);
            grouped.set(fileId, existing);
        }
        return Array.from(grouped.values());
    }, [rcRows]);
    const rcRowsByFileId = useMemo(() => {
        const grouped = new Map<string, any[]>();
        for (const row of rcRows as any[]) {
            const fileId = String(row?.fileId ?? "").trim();
            if (!fileId)
                continue;
            const rows = grouped.get(fileId) ?? [];
            rows.push(row);
            grouped.set(fileId, rows);
        }
        return grouped;
    }, [rcRows]);
    const rcSummary = rcAnalyzeResult?.summary && typeof rcAnalyzeResult.summary === "object"
        ? rcAnalyzeResult.summary
        : null;
    const rcCurveRows = Array.isArray(rcAnalyzeResult?.curve) ? rcAnalyzeResult.curve : [];
    const rcCurveChart = useMemo(() => {
        const points = (Array.isArray(rcCurveRows) ? rcCurveRows : [])
            .map((row: any) => ({
            rc: Number(row?.rc),
            rcw: Number(row?.rcw),
            rSheet: Number(row?.rSheet),
            vg: Number(row?.vg),
        }))
            .filter((point) => Number.isFinite(point.vg) &&
            (Number.isFinite(point.rc) ||
                Number.isFinite(point.rcw) ||
                Number.isFinite(point.rSheet)))
            .sort((a, b) => a.vg - b.vg);
        if (points.length < 2)
            return null;
        const yValues: number[] = [];
        const collectY = (value: number) => {
            if (Number.isFinite(value))
                yValues.push(value);
        };
        for (const point of points) {
            collectY(point.rc);
            collectY(point.rcw);
            collectY(point.rSheet);
        }
        if (!yValues.length)
            return null;
        const xValues = points.map((point) => point.vg);
        const xMin = Math.min(...xValues);
        const xMax = Math.max(...xValues);
        const yMin = Math.min(...yValues);
        const yMax = Math.max(...yValues);
        const xDomain = padLinearDomain(xMin, xMax);
        const yDomain = padLinearDomain(yMin, yMax);
        const series = [
            {
                color: getChartColor(0),
                data: points
                    .filter((point) => Number.isFinite(point.rc))
                    .map((point) => ({ x: point.vg, y: point.rc })),
                id: "rc",
                lineName: "Rc",
            },
            {
                color: getChartColor(1),
                data: points
                    .filter((point) => Number.isFinite(point.rcw))
                    .map((point) => ({ x: point.vg, y: point.rcw })),
                id: "rcw",
                lineName: "RcW",
            },
            {
                color: getChartColor(2),
                data: points
                    .filter((point) => Number.isFinite(point.rSheet))
                    .map((point) => ({ x: point.vg, y: point.rSheet })),
                id: "rsh",
                lineName: "Rsh",
            },
        ].filter((item) => item.data.length >= 2);
        if (!series.length)
            return null;
        return {
            series,
            xDomain,
            xTicks: buildNiceTicks(xDomain[0], xDomain[1], 6, { preferTightRange: true }),
            yDomain,
            yTicks: buildNiceTicks(yDomain[0], yDomain[1], 5, { preferTightRange: true }),
        };
    }, [rcCurveRows]);
    const rcStatusText = rcAnalyzePending
        ? t("da_rc_status_running")
        : rcAnalyzeError
            ? rcAnalyzeError
            : rcSummary
                ? `Rc=${formatNumber(rcSummary.rc)} | RcW=${formatNumber(rcSummary.rcw)} | R2=${formatNumber(rcSummary.r2, { digits: 4 })}`
                : t("da_rc_status_selected_curves", {
                    count: rcRows.length,
                });
    const handleAnalyzeRc = React.useCallback(async () => {
        const bridge = (globalThis.window as any)?.desktopImport;
        if (!bridge?.analyzeDeviceAnalysisRcWithRust) {
            setRcAnalyzeError(t("da_rc_error_bridge_unavailable"));
            return;
        }
        if (!rcRows.length) {
            setRcAnalyzeError(t("da_rc_error_no_transfer_curves"));
            return;
        }
        const devices = rcRows
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
            setRcAnalyzeError(t("da_rc_error_insufficient_devices"));
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
                throw new Error(response?.message || t("da_rc_error_analysis_failed"));
            }
            setRcAnalyzeResult(response.result ?? null);
        } catch (error: any) {
            setRcAnalyzeError(error?.message || t("da_rc_error_analysis_failed"));
            setRcAnalyzeResult(null);
        } finally {
            setRcAnalyzePending(false);
        }
    }, [curveProbeX, rcRows, t]);
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
                text: focusedLabel || t("da_chart_current_curve_label"),
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
        ? t("da_chart_ss_diagnostics")
        : showGmDiagnosticsPanel
            ? t("da_chart_gm_diagnostics_heading")
            : showJDiagnosticsPanel
                ? t("da_chart_j_diagnostics_heading")
                : showCurveProbePanel
                    ? t("da_chart_curve_probe_heading")
                    : t("da_chart_diagnostics_heading");
    const diagnosticsDescription = showSsDiagnosticsPanel
        ? t("da_chart_ss_diagnostics_desc")
        : showGmDiagnosticsPanel
            ? gmDiagnosticsEnabled
                ? t("da_chart_gm_diagnostics_desc_enabled")
                : t("da_chart_gm_diagnostics_desc_disabled")
            : showJDiagnosticsPanel
                ? t("da_chart_j_diagnostics_desc")
                : t("da_chart_curve_probe_desc");
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
            .updateSettings(fileKey
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
    const renderOriginCurveSelectionList = React.useCallback(({
        curveMode = resolvedCurveExportMode,
        entries,
        emptyText,
        isSelectionMode = isExportListCanvasSelectionMode,
        onClearAllSeriesForFile = clearOriginSeriesSelectionForFile,
        onToggleFile = toggleOriginCanvasSelection,
        onSelectAllSeriesForFile = selectAllOriginSeriesForFile,
        onSetCurveMode = setOriginCurveExportMode,
        onToggleSeriesForFile = toggleOriginSeriesSelectionForFile,
        renderFileExtra,
        showRemoveButton = true,
        showSeriesControls = true,
    }: {
        curveMode?: OriginCurveExportMode;
        entries: typeof exportListEntries;
        emptyText: string;
        isSelectionMode?: boolean;
        onClearAllSeriesForFile?: (fileId: string) => void;
        onToggleFile?: (fileId: string) => void;
        onSelectAllSeriesForFile?: (fileId: string) => void;
        onSetCurveMode?: (nextMode: OriginCurveExportMode) => void;
        onToggleSeriesForFile?: (fileId: string, seriesKey: string) => void;
        renderFileExtra?: (entry: (typeof exportListEntries)[number]) => React.ReactNode;
        showRemoveButton?: boolean;
        showSeriesControls?: boolean;
    }) => entries.length ? (<ScrollArea axis="y" className="min-w-0 w-full max-h-[320px]" viewportClassName="pr-2">
        <div className="space-y-2">
          {entries.map((entry: any) => (
            <OriginCurveSelectionEntryRow
              key={entry.fileId}
              curveMode={curveMode}
              entry={entry}
              exportEntryActionLabel={exportEntryActionLabel}
              fileCurvesLabel={t("da_origin_collection_file_curves", {
                count: entry.selectedCount,
              })}
              isSelectionMode={isSelectionMode}
              onClearAllSeriesForFile={onClearAllSeriesForFile}
              onRemoveEntry={handleRemoveOriginExportEntry}
              onSelectAllSeriesForFile={onSelectAllSeriesForFile}
              onSelectFile={handleSelectFile}
              onSetCurveMode={onSetCurveMode}
              onToggleFile={onToggleFile}
              onToggleSeriesForFile={onToggleSeriesForFile}
              pickAllLabel={t("da_origin_curve_export_pick_all")}
              renderFileExtra={renderFileExtra as ((entry: OriginCurveSelectionEntry) => React.ReactNode) | undefined}
              selectedBadgeLabel={t("da_origin_export_list_selected_badge")}
              showRemoveButton={showRemoveButton}
              showSeriesControls={showSeriesControls}
            />
          ))}
        </div>
      </ScrollArea>) : (<div className="rounded-xl border border-dashed border-border bg-bg-page/40 px-4 py-6 text-sm text-text-secondary">
        {emptyText}
      </div>), [
        clearOriginSeriesSelectionForFile,
        exportEntryActionLabel,
        handleRemoveOriginExportEntry,
        handleSelectFile,
        isExportListCanvasSelectionMode,
        resolvedCurveExportMode,
        selectAllOriginSeriesForFile,
        setOriginCurveExportMode,
        t,
        toggleOriginCanvasSelection,
        toggleOriginSeriesSelectionForFile,
    ]);
    if (!processedData || processedData.length === 0)
        return null;
    const sidebarContent = (
      <aside
        id="analysis-overview-sidebar"
        className="flex h-full min-h-0 flex-col"
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
    );
    return (<div className="relative h-full min-h-0" ref={toastContainerRef}>
      {sidebarPortal ? createPortal(sidebarContent, sidebarPortal) : null}
      <SplitView
        className="h-full min-h-0"
        gap={4}
        orientation="vertical"
        panes={[
          {
            id: "analysis-chart-pane",
            defaultSize: 620,
            minSize: 320,
            children: (
              <ScrollArea className="da-analysis-scroll-area min-w-0 min-h-0" axis="y" viewportClassName="pr-1">
                <section className="flex min-w-0 flex-col" aria-label={t("da_analysis_chart_aria_label")}>
        <Card variant="panel" className="flex min-w-0 flex-col">

          <div className="mb-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 flex-wrap">
              <PlotTypeToggle activePlotType={effectivePlotType} primaryPlotLabel={primaryPlotLabel} derivativeLabel={gmUi.kind === "gds" ? "gds" : "gm"} gmApplicable={gmApplicable} ssApplicable={ssApplicable} vthApplicable={vthApplicable} areaAvailable={Boolean(area)} onChange={handlePlotTypeChange}/>



              <div className="flex items-center gap-2">
                <DropdownField id="analysis-y-unit-select" size="sm" value={activeYUnit} onChange={(next: any) => {
            const nextUnitRaw = normalizeYUnit(next, activeYUnit);
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
                .updateSettings(fileKey && nextUnit
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
        }))} aria-label={t("da_chart_y_unit_aria_label")} className="w-fit da-neutral-select" stableWidth data-cta="Device Analysis" data-cta-position="y-unit" data-cta-copy="y unit"/>

                <div className="flex items-center gap-1">
                  {effectivePlotType === "ss" ? (<span className="text-xs text-text-primary font-mono whitespace-nowrap">
                      log(|I|)
                    </span>) : effectivePlotType === "vth" ? null : (<DropdownField id="analysis-y-scale-select" size="sm" value={axis.yScale === "logAbs" ? "log" : axis.yScale} onChange={(next: any) => {
                applyLinearLogYScaleForFile(next);
            }} options={[
                {
                    value: "linear",
                    label: t("da_settings_y_scale_linear"),
                },
                {
                    value: "log",
                    label: t("da_settings_y_scale_log"),
                },
            ]} aria-label={t("da_chart_y_scale_aria_label")} className="w-fit da-neutral-select" stableWidth data-cta="Device Analysis" data-cta-position="y-scale" data-cta-copy="y scale"/>)}
                  {effectivePlotType !== "ss" && effectivePlotType !== "vth" && yScaleMode === "log" ? (<DropdownField id="analysis-log-current-mode-select" size="sm" value={yLogCurrentMode} onChange={(next: any) => {
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
                        .updateSettings({
                        yLogCurrentModeByFileId: nextByFileId,
                    })
                        .catch(() => { });
                }
            }} options={[
                {
                    value: "all",
                    label: t("da_log_current_mode_all"),
                },
                {
                    value: "positive",
                    label: t("da_log_current_mode_positive"),
                },
            ]} aria-label={t("da_log_current_mode_aria_label")} className="w-fit da-neutral-select" stableWidth data-cta="Device Analysis" data-cta-position="log-current-mode" data-cta-copy="log current mode"/>) : null}
                </div>

                {effectivePlotType === "gm" ? (<div className="flex items-center gap-1">
                    <Button variant={gmDiagnosticsEnabled ? "secondary" : "text"} size="sm" onClick={() => {
                const next = !gmDiagnosticsEnabled;
                setGmDiagnosticsEnabled(next);
                apiService
                    .updateSettings({
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
                      <DropdownField id="analysis-ss-method-select" size="sm" value={ssMethod} onChange={(next: any) => {
                const method = next === "auto" || next === "manual" ? next : "auto";
                setSsMethod(method);
                apiService
                    .updateSettings({
                    ssMethodDefault: method,
                })
                    .catch(() => { });
            }} options={[
                { value: "auto", label: t("da_common_auto") },
                { value: "manual", label: t("da_common_manual") },
            ]} className="w-[100px]"/>
                    </div>

                    <Button variant={ssShowFitLine ? "secondary" : "text"} size="sm" onClick={() => {
                const next = !ssShowFitLine;
                setSsShowFitLine(next);
                apiService
                    .updateSettings({ ssShowFitLine: next })
                    .catch(() => { });
            }} className="h-8 px-2 text-xs" title={t("da_chart_fit_line_toggle_title")}>
                      {t("da_chart_fit_line")}
                    </Button>

                    <Button variant={ssDiagnosticsEnabled ? "secondary" : "text"} size="sm" onClick={() => {
                const next = !ssDiagnosticsEnabled;
                setSsDiagnosticsEnabled(next);
                apiService
                    .updateSettings({
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
                    .updateSettings({
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
                      <DropdownField id="analysis-current-method-select" size="sm" value={ionIoffMethod} onChange={(next: any) => {
                const method = next === "manual" ? "manual" : "auto";
                setIonIoffMethod(method);
            }} options={[
                { value: "auto", label: t("da_common_auto") },
                { value: "manual", label: t("da_common_manual") },
            ]} className="w-fit da-neutral-select"/>
                    </div>
                  </div>) : null}

                {showFileSelect ? (<DropdownField id="analysis-file-select" size="sm" value={effectiveActiveFileId ?? ""} onChange={(val: any) => handleSelectFile(val)} options={processedData.map((f: any) => ({
            value: f.fileId,
            label: f.fileName,
        }))} className="w-[240px] da-neutral-select" placeholder={t("da_select_file_placeholder")} data-cta="Device Analysis" data-cta-position="file-select" data-cta-copy="file select"/>) : null}
                <Button id="analysis-plot-settings-toggle-btn" variant="secondary" size="sm" onClick={() => setShowPlotSettingsPane((v: any) => !v)} title={t("da_chart_plot_settings_title")} aria-pressed={showPlotSettingsPane}>
                  <CogIcon icon={lxSlidersHorizontal} size={14} />
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
                  {t("da_chart_no_visible_curves")}
                </div>) : null}

              {effectivePlotType === "vth" ? (<div className="mt-3 rounded-lg border border-border bg-bg-page/40 px-3 py-2">
                  {focusedVthFitRows.length ? (<ScrollArea axis="x" className="min-w-0 w-full">
                      <div className="min-w-[860px] text-xs">
                        <div className="grid grid-cols-[96px_132px_190px_140px_160px_92px] items-center gap-x-3 border-b border-border/70 px-2 pb-1 text-text-secondary">
                          <span>{t("da_vth_table_branch")}</span>
                          <span className="text-right">Vth</span>
                          <span className="text-right">{t("da_vth_table_fit_range")}</span>
                          <span className="text-right">{t("da_vth_table_slope")}</span>
                          <span className="text-right">{t("da_vth_table_intercept")}</span>
                          <span className="text-right">R²</span>
                        </div>
                        <div className="divide-y divide-border/60">
                          {focusedVthFitRows.map((row: any) => (<div key={row.branch} className="grid grid-cols-[96px_132px_190px_140px_160px_92px] items-center gap-x-3 px-2 py-1.5">
                              <span className="font-medium text-text-primary capitalize">
                                {row.branch === "electron"
                                    ? t("da_vth_branch_electron")
                                    : row.branch === "hole"
                                        ? t("da_vth_branch_hole")
                                        : row.branch}
                              </span>
                              <span className="font-mono text-right text-text-primary whitespace-nowrap">{row.vth}</span>
                              <span className="font-mono text-right text-text-primary whitespace-nowrap">{row.fitRange}</span>
                              <span className="font-mono text-right text-text-primary whitespace-nowrap">{row.slope}</span>
                              <span className="font-mono text-right text-text-primary whitespace-nowrap">{row.intercept}</span>
                              <span className="font-mono text-right text-text-primary whitespace-nowrap">{row.r2}</span>
                            </div>))}
                        </div>
                      </div>
                    </ScrollArea>) : (<div className="text-sm text-text-secondary">
                      {t("da_vth_no_stable_fit")}
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
              {t("da_chart_no_series_data")}
            </div>)}
        </Card>
                      </section>
                    </ScrollArea>
                  ),
                },
                {
                  id: "analysis-diagnostics-pane",
                  defaultSize: 260,
                  minSize: 160,
                  children: (
                    <ScrollArea className="da-analysis-scroll-area min-w-0 min-h-0" axis="y" viewportClassName="pr-1">
                      <section className="flex min-w-0 flex-col">
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
                      </section>
                    </ScrollArea>
                  ),
                },
                {
                  id: "analysis-results-pane",
                  defaultSize: 360,
                  minSize: 180,
                  children: (
                    <ScrollArea className="da-analysis-scroll-area min-w-0 min-h-0" axis="y" viewportClassName="pr-1">
                      <section className="flex min-w-0 flex-col">
          {activeFile?.series?.length ? (<Card id="analysis-calculated-parameters-card" variant="panel" className="flex min-w-0 flex-col flex-1">
            <div className="mb-3 flex min-w-0 items-center justify-between gap-3 flex-wrap">
              <div className="flex min-w-0 items-center flex-wrap">
                <Tabs idBase="analysis-results-tabs" value={resultsTab} onChange={(next) => setResultsTab(next === "export" || next === "rc" ? next : "metrics")} size="sm" hoverPreview={false} groupLabel={t("da_analysis_results_tabs_label")} itemClassName="!px-3" options={[
                {
                    value: "metrics",
                    label: t("da_analysis_results_tab_metrics"),
                },
                ...(rcTransferAvailable
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
                <RcAnalysisToolbar
                  biasOptions={rcBiasOptions}
                  isPending={rcAnalyzePending}
                  onAnalyze={handleAnalyzeRc}
                  onBiasChange={setRcBiasSelectionKey}
                  rowCount={rcRows.length}
                  selectedBiasKey={selectedRcBiasKey}
                />
                {renderOriginCurveSelectionList({
                  entries: rcStatisticListEntries,
                  emptyText: t("da_rc_require_statistic_selection"),
                  isSelectionMode: true,
                  onToggleFile: toggleRcStatisticFileSelectionForRc,
                  showRemoveButton: false,
                  showSeriesControls: false,
                  renderFileExtra: (entry: any) => {
                        const rows = rcRowsByFileId.get(entry.fileId) ?? [];
                        const firstRow = rows[0];
                        const storedFileGeometry = rcGeometryByFileId[entry.fileId]?.[RC_FILE_GEOMETRY_KEY] ?? {};
                        const length = firstRow?.length ?? storedFileGeometry.length ?? "";
                        const width = firstRow?.width ?? storedFileGeometry.width ?? "";
                        return (<>
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <Input
                                label="L"
                                labelPlacement="inline"
                                value={length}
                                onChange={(value: string) => updateRcGeometry(entry.fileId, RC_FILE_GEOMETRY_KEY, { length: value })}
                                size="sm"
                                disabled={!entry.isCanvasSelected}
                                className="!space-y-0"
                                fieldClassName="w-28"
                                inputClassName="text-xs"
                              />
                              <Input
                                label="W"
                                labelPlacement="inline"
                                value={width}
                                onChange={(value: string) => updateRcGeometry(entry.fileId, RC_FILE_GEOMETRY_KEY, { width: value })}
                                size="sm"
                                disabled={!entry.isCanvasSelected}
                                className="!space-y-0"
                                fieldClassName="w-28"
                                inputClassName="text-xs"
                              />
                            </div>
                            {entry.isCanvasSelected && !rows.length ? (<div className="text-xs text-text-secondary">
                                {t("da_rc_require_curve_in_file")}
                              </div>) : null}
                          </>);
                    },
                })}
                <div className="rounded-xl border border-border bg-bg-page/40 px-4 py-3">
                  {rcSummary ? (
                    <div className="grid grid-cols-5 gap-3 text-sm">
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
                      {rcAnalyzeError || t("da_rc_no_result")}
                    </div>
                  )}
                </div>
                {rcCurveChart ? (
                  <div className="rounded-xl border border-border bg-bg-page/40 px-3 py-3">
                    <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-text-secondary">{t("da_rc_curve_title")}</div>
                      <div className="flex min-w-0 items-center gap-3 text-xs text-text-secondary">
                        {rcCurveChart.series.map((item: any) => (
                          <span key={item.id} className="inline-flex items-center gap-1.5">
                            <span
                              className="h-2.5 w-2.5 rounded-sm"
                              style={{ backgroundColor: item.color }}
                            />
                            {item.lineName}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="h-[220px] min-w-0">
                      <CanvasDiagnosticsChart
                        ariaLabel={t("da_rc_curve_title")}
                        axisTitleFontSize={12}
                        locatorX={rcSummary?.vg}
                        rightReservedWidth={12}
                        series={rcCurveChart.series}
                        tickLabelFontSize={11}
                        valueUnitLabel="Ω"
                        xDomain={rcCurveChart.xDomain}
                        xLabelInterval={1}
                        xTickDigits={inferTickDigitsFromTicks(rcCurveChart.xTicks)}
                        xTicks={rcCurveChart.xTicks}
                        xTooltipDigits={inferTickDigitsFromTicks(rcCurveChart.xTicks)}
                        xUnitLabel="V"
                        yAxisLabel="Ω"
                        yDomain={rcCurveChart.yDomain}
                        yTicks={rcCurveChart.yTicks}
                        yTooltipMinDigits={3}
                      />
                    </div>
                  </div>
                ) : null}
                {rcCurveRows.length ? (
                  <ScrollArea axis="x" className="min-w-0 w-full max-h-[220px]">
                    <table className="w-full min-w-[720px] table-fixed text-sm border-collapse">
                      <thead className="sticky top-0 bg-bg-surface z-10">
                        <tr className="border-b border-border">
                          {["Vg", "Rc", "RcW", "Rsh", "R2", "n", t("da_rc_table_warnings")].map((label) => (
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
                <OriginExportToolbar
                  curveOptions={originCurveExportOptions}
                  hasMixedExportYScales={hasMixedExportYScales}
                  mode={resolvedOriginExportMode}
                  onExportOriginZip={handleExportOriginZip}
                  onModeChange={handleOriginExportModeChange}
                  onOpenInOrigin={handleOpenInOrigin}
                  onSelectedCurveOptionKeysChange={setOriginCurveExportSelectedKeys}
                  originCanvasExportScope={originCanvasExportScope}
                  originExportContentOptions={originExportContentOptions}
                  originFilteredCanvasKind={originFilteredCanvasKind}
                  replaceMatchingOriginSeriesAcrossFiles={replaceMatchingOriginSeriesAcrossFiles}
                  resolvedCurveExportMode={resolvedCurveExportMode}
                  scopedFileIds={scopedOriginCanvasIds}
                  selectedContentKeys={resolvedOriginExportContentKeys}
                  selectedCurveOptionKeySet={selectedOriginCurveExportOptionKeySet}
                  setContentKeys={setOriginExportContentKeys}
                  setOriginCanvasExportScope={setOriginCanvasExportScope}
                  setOriginFilteredCanvasKind={setOriginFilteredCanvasKind}
                  setResolvedCurveExportMode={setOriginCurveExportMode}
                  showFilteredCanvasKindSelect={showFilteredCanvasKindSelect}
                  t={t}
                />
                {renderOriginCurveSelectionList({
                    entries: exportListEntries,
                    emptyText: exportListEmptyText,
                })}
              </div>)}
          </Card>) : null}
                      </section>
                    </ScrollArea>
                  ),
                },
              ]}
            />
    </div>);
};
export default React.memo(AnalysisCharts);
