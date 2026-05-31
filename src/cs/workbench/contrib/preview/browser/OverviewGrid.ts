import { jsx, jsxs } from "react/jsx-runtime";
import { memo, useEffect, useMemo, useState } from "react";
import Card from "cs/base/browser/ui/card/card";
import DropdownField from "cs/base/browser/ui/dropdownField/dropdownField";
import ScrollArea from "cs/base/browser/ui/scrollArea/scrollArea";
import { useLanguage } from "src/cs/workbench/browser/hooks/useLanguage";
import { getYUnitMeta } from "src/cs/workbench/contrib/chart/common/units";
import type { OriginCanvasExportScope } from "src/cs/workbench/contrib/export/browser/originCanvasExport";
import type { ProcessingStatus } from "src/cs/workbench/common/deviceAnalysis/sharedTypes";
import FileCard, { type ProcessedFileLike } from "./FileCard";
import { createPreviewFieldFilterOptions, filterPreviewFiles, getVisiblePreviewFileIds, isBuiltInPreviewCurveFilter, } from "src/cs/workbench/contrib/preview/browser/previewView";
import { createPreviewSelectionEvent, createPreviewVisibleFilesEvent, } from "src/cs/workbench/contrib/preview/browser/previewViewPane";
type OverviewGridProps = {
    processedData?: ProcessedFileLike[];
    processingStatus?: Partial<ProcessingStatus>;
    activeFileId?: string | null;
    onSelectFile?: (fileId: string | undefined) => void;
    onVisibleFileIdsChange?: (fileIds: string[]) => void;
    selectedOriginCanvasKeySet?: Set<string>;
    onToggleOriginCanvasSelection?: (fileId: string | undefined) => void;
    originCanvasExportScope?: OriginCanvasExportScope;
    isSelectionMode?: boolean;
    xUnitFactor?: number;
    xUnitLabel?: string;
    resolveYUnitForFile?: (file: ProcessedFileLike | null | undefined) => string;
    resolveYScaleForFile?: (file: ProcessedFileLike | null | undefined) => string;
    resolveYLogCurrentModeForFile?: (file: ProcessedFileLike | null | undefined) => "all" | "positive";
};
type CurveFilter = string;
const OverviewGrid = memo(function OverviewGrid({ processedData = [], processingStatus, activeFileId, onSelectFile, onVisibleFileIdsChange, selectedOriginCanvasKeySet, onToggleOriginCanvasSelection, originCanvasExportScope = "selected", isSelectionMode = false, xUnitFactor, xUnitLabel, resolveYUnitForFile, resolveYScaleForFile, resolveYLogCurrentModeForFile, }: OverviewGridProps) {
    const { t } = useLanguage();
    const [curveFilter, setCurveFilter] = useState<CurveFilter>("all");
    const fieldFilterOptions = useMemo(() => {
        return createPreviewFieldFilterOptions(processedData, t);
    }, [processedData, t]);
    const curveFilterOptions = useMemo(() => [
        ...fieldFilterOptions,
        { label: t("da_overview_curve_filter_all"), value: "all" as const },
        {
            label: t("da_overview_curve_filter_transfer"),
            value: "transfer" as const,
        },
        { label: t("da_overview_curve_filter_output"), value: "output" as const },
    ], [fieldFilterOptions, t]);
    useEffect(() => {
        if (!fieldFilterOptions.length) {
            if (!isBuiltInPreviewCurveFilter(curveFilter)) {
                setCurveFilter("all");
            }
            return;
        }
        const hasCurrentFieldOption = fieldFilterOptions.some((option) => option.value === curveFilter);
        if (isBuiltInPreviewCurveFilter(curveFilter))
            return;
        if (hasCurrentFieldOption)
            return;
        setCurveFilter("all");
    }, [curveFilter, fieldFilterOptions]);
    const filteredData = useMemo(() => {
        return filterPreviewFiles(processedData, curveFilter);
    }, [curveFilter, processedData]);
    const visibleFileIds = useMemo(() => getVisiblePreviewFileIds(filteredData), [filteredData]);
    useEffect(() => {
        onVisibleFileIdsChange?.(createPreviewVisibleFilesEvent(visibleFileIds).fileIds);
    }, [onVisibleFileIdsChange, visibleFileIds]);
    const isManualCanvasScope = isSelectionMode && originCanvasExportScope === "selected";
    if (!processedData.length)
        return null;
    return (jsxs(Card, {
        variant: "panel",
        className: "h-full min-h-0 flex flex-col !pr-0",
        children: [
            jsx("div", {
                className: "mb-3 pr-4 space-y-2",
                children: jsx("div", {
                    className: "flex items-center justify-between gap-3 flex-wrap",
                    children: jsxs("div", {
                        className: "flex items-center gap-3 flex-wrap",
                        children: [
                            jsxs("div", {
                                className: "relative flex items-center gap-2",
                                children: [
                                    jsx("label", {
                                        htmlFor: "analysis-overview-curve-filter-btn",
                                        className: "sr-only",
                                        children: t("da_overview_curve_filter_label")
                                    }),
                                    jsx(DropdownField, {
                                        id: "analysis-overview-curve-filter-btn",
                                        menuId: "analysis-overview-curve-filter-menu",
                                        size: "sm",
                                        value: curveFilter,
                                        onChange: (next: unknown) => {
                                            const nextValue = String(next ?? "").trim();
                                            if (!nextValue) {
                                                setCurveFilter("all");
                                                return;
                                            }
                                            if (isBuiltInPreviewCurveFilter(nextValue)) {
                                                setCurveFilter(nextValue);
                                                return;
                                            }
                                            const matchedFieldOption = fieldFilterOptions.find((option) => option.value === nextValue);
                                            if (matchedFieldOption) {
                                                setCurveFilter(matchedFieldOption.value);
                                                return;
                                            }
                                            setCurveFilter("all");
                                        },
                                        options: curveFilterOptions,
                                        "aria-label": t("da_overview_curve_filter_label"),
                                        className: "w-fit da-neutral-select",
                                        stableWidth: true,
                                        contentViewClassName: "w-max min-w-max !bg-bg-surface !backdrop-blur-none",
                                        "data-cta": "Device Analysis",
                                        "data-cta-position": "overview-grid",
                                        "data-cta-copy": "curve filter"
                                    })
                                ]
                            }),
                            processingStatus?.state === "processing" ? (jsx("div", {
                                className: "text-xs text-text-secondary",
                                children: t("da_overview_processing", {
                                    processed: processingStatus.processed,
                                    total: processingStatus.total,
                                })
                            })) : null
                        ]
                    })
                })
            }),
            jsx(ScrollArea, {
                className: "flex-1 min-h-0",
                viewportClassName: "pr-4",
                axis: "y",
                children: jsx("div", {
                    className: "grid grid-cols-1 auto-rows-max gap-2.5 content-start",
                    children: filteredData.map((file) => ((() => {
                        const yUnitMeta = getYUnitMeta(resolveYUnitForFile?.(file) ?? file?.yUnit ?? "A");
                        return (jsx(FileCard, {
                            key: file.fileId,
                            file: file,
                            isActive: file.fileId === activeFileId,
                            onSelectFile: (fileId: string) => {
                                const event = createPreviewSelectionEvent(fileId);
                                if (event)
                                    onSelectFile?.(event.fileId);
                            },
                            isSelectionMode: isManualCanvasScope,
                            isOriginSelected: selectedOriginCanvasKeySet?.has(String(file?.fileId ?? "")),
                            showOriginSelectionBadge: isManualCanvasScope,
                            onToggleOriginSelected: onToggleOriginCanvasSelection,
                            originSelectedBadgeLabel: t("da_overview_select_badge"),
                            xUnitFactor: xUnitFactor,
                            xUnitLabel: xUnitLabel,
                            yUnitFactor: yUnitMeta.factor,
                            yUnitLabel: yUnitMeta.label,
                            yScale: resolveYScaleForFile?.(file) ?? "linear",
                            yLogCurrentMode: resolveYLogCurrentModeForFile?.(file) ?? "all"
                        }));
                    })()))
                })
            })
        ]
    }));
});
OverviewGrid.displayName = "OverviewGrid";
export default OverviewGrid;

