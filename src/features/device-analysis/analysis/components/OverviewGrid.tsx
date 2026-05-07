import { memo, useEffect, useMemo, useState } from "react";
import Card from "cs/base/browser/ui/Card/Card";
import DropdownField from "cs/base/browser/ui/DropdownField/DropdownField";
import ScrollArea from "cs/base/browser/ui/ScrollArea/ScrollArea";
import { useLanguage } from "../../../../hooks/useLanguage";
import { getYUnitMeta } from "../lib/units";
import type { OriginCanvasExportScope } from "../useOriginCanvasExport";
import type { ProcessingStatus } from "../../shared/lib/sharedTypes";
import FileCard, { type ProcessedFileLike } from "./FileCard";

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
  resolveYUnitForFile?: (
    file: ProcessedFileLike | null | undefined,
  ) => string;
  resolveYScaleForFile?: (file: ProcessedFileLike | null | undefined) => string;
  resolveYLogCurrentModeForFile?: (
    file: ProcessedFileLike | null | undefined,
  ) => "all" | "positive";
};

type CurveFilter = string;
const isBuiltInCurveFilter = (
  value: unknown,
): value is "all" | "transfer" | "output" =>
  value === "all" || value === "transfer" || value === "output";
const resolveCurveFieldFilterMeta = (
  file: ProcessedFileLike,
): { key: string; label: string } | null => {
  const key = String(file?.curveFilterKey ?? "").trim();
  const label = String(file?.curveFilterField ?? "").trim();

  if (key) {
    return {
      key,
      label: label || key,
    };
  }
  if (label) {
    // Backward-compat for older payloads that only carry display field text.
    return {
      key: `field-label:${label.toLowerCase()}`,
      label,
    };
  }
  return null;
};

const OverviewGrid = memo(function OverviewGrid({
  processedData = [],
  processingStatus,
  activeFileId,
  onSelectFile,
  onVisibleFileIdsChange,
  selectedOriginCanvasKeySet,
  onToggleOriginCanvasSelection,
  originCanvasExportScope = "selected",
  isSelectionMode = false,
  xUnitFactor,
  xUnitLabel,
  resolveYUnitForFile,
  resolveYScaleForFile,
  resolveYLogCurrentModeForFile,
}: OverviewGridProps) {
  const { t } = useLanguage();
  const [curveFilter, setCurveFilter] = useState<CurveFilter>("all");
  const fieldFilterOptions = useMemo(() => {
    const options: Array<{ label: string; value: string }> = [];
    const seen = new Set<string>();

    for (const file of processedData) {
      const meta = resolveCurveFieldFilterMeta(file);
      if (!meta) continue;
      if (seen.has(meta.key)) continue;
      seen.add(meta.key);
      options.push({
        label: `${t("da_match_mode_field")}: ${meta.label}`,
        value: meta.key,
      });
    }

    return options;
  }, [processedData, t]);

  const curveFilterOptions = useMemo(
    () => [
      ...fieldFilterOptions,
      { label: t("da_overview_curve_filter_all"), value: "all" as const },
      {
        label: t("da_overview_curve_filter_transfer"),
        value: "transfer" as const,
      },
      { label: t("da_overview_curve_filter_output"), value: "output" as const },
    ],
    [fieldFilterOptions, t],
  );

  useEffect(() => {
    if (!fieldFilterOptions.length) {
      if (!isBuiltInCurveFilter(curveFilter)) {
        setCurveFilter("all");
      }
      return;
    }

    const hasCurrentFieldOption = fieldFilterOptions.some(
      (option) => option.value === curveFilter,
    );
    if (isBuiltInCurveFilter(curveFilter)) return;
    if (hasCurrentFieldOption) return;

    setCurveFilter("all");
  }, [curveFilter, fieldFilterOptions]);

  const filteredData = useMemo(() => {
    if (curveFilter === "all") return processedData;
    if (curveFilter === "transfer" || curveFilter === "output") {
      const target = curveFilter === "transfer" ? "vg" : "vd";
      return processedData.filter((file) => {
        const xAxisRole = String(file?.xAxisRole ?? "").toLowerCase();
        if (xAxisRole) {
          return xAxisRole === target;
        }
        // Check curveType field first (if available).
        if (file?.curveType) {
          const curveType = String(file.curveType).toLowerCase();
          return curveType.includes(target) || curveType.includes(curveFilter);
        }
        // Fallback to xLabel (may exist in broader processed shape).
        const label = String(
          (file as ProcessedFileLike & { xLabel?: string })?.xLabel || "",
        ).toLowerCase();
        return label.includes(target);
      });
    }

    const selectedFieldKey = String(curveFilter).trim().toLowerCase();
    if (!selectedFieldKey) return processedData;
    return processedData.filter((file) => {
      const meta = resolveCurveFieldFilterMeta(file);
      if (!meta) return false;
      return meta.key.toLowerCase() === selectedFieldKey;
    });
  }, [curveFilter, processedData]);

  const visibleFileIds = useMemo(
    () =>
      filteredData
        .map((file) => String(file?.fileId ?? "").trim())
        .filter(Boolean),
    [filteredData],
  );

  useEffect(() => {
    onVisibleFileIdsChange?.(visibleFileIds);
  }, [onVisibleFileIdsChange, visibleFileIds]);

  const isManualCanvasScope = isSelectionMode && originCanvasExportScope === "selected";
  if (!processedData.length) return null;

  return (
    <Card variant="panel" className="h-full min-h-0 flex flex-col !pr-0">
      <div className="mb-3 pr-4 space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex items-center gap-2">
            <label
              htmlFor="analysis-overview-curve-filter-btn"
              className="sr-only"
            >
              {t("da_overview_curve_filter_label")}
            </label>
            <DropdownField
              id="analysis-overview-curve-filter-btn"
              menuId="analysis-overview-curve-filter-menu"
              size="sm"
              value={curveFilter}
              onChange={(next) => {
                const nextValue = String(next ?? "").trim();
                if (!nextValue) {
                  setCurveFilter("all");
                  return;
                }
                if (isBuiltInCurveFilter(nextValue)) {
                  setCurveFilter(nextValue);
                  return;
                }
                const matchedFieldOption = fieldFilterOptions.find(
                  (option) => option.value === nextValue,
                );
                if (matchedFieldOption) {
                  setCurveFilter(matchedFieldOption.value);
                  return;
                }
                setCurveFilter("all");
              }}
              options={curveFilterOptions}
              aria-label={t("da_overview_curve_filter_label")}
              className="w-fit da-neutral-select"
              stableWidth
              popupClassName="w-max min-w-max !bg-bg-surface !backdrop-blur-none"
              data-cta="Device Analysis"
              data-cta-position="overview-grid"
              data-cta-copy="curve filter"
            />
          </div>

          {processingStatus?.state === "processing" ? (
            <div className="text-xs text-text-secondary">
              {t("da_overview_processing", {
                processed: processingStatus.processed,
                total: processingStatus.total,
              })}
            </div>
          ) : null}

          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0" viewportClassName="pr-4" axis="y">
        <div className="grid grid-cols-1 auto-rows-max gap-2.5 content-start">
          {filteredData.map((file) => (
            (() => {
              const yUnitMeta = getYUnitMeta(
                resolveYUnitForFile?.(file) ?? file?.yUnit ?? "A",
              );
              return (
                <FileCard
                  key={file.fileId}
                  file={file}
                  isActive={file.fileId === activeFileId}
                  onSelectFile={onSelectFile}
                  isSelectionMode={isManualCanvasScope}
                  isOriginSelected={selectedOriginCanvasKeySet?.has(
                    String(file?.fileId ?? ""),
                  )}
                  showOriginSelectionBadge={isManualCanvasScope}
                  onToggleOriginSelected={onToggleOriginCanvasSelection}
                  originSelectedBadgeLabel={t("da_overview_select_badge")}
                  xUnitFactor={xUnitFactor}
                  xUnitLabel={xUnitLabel}
                  yUnitFactor={yUnitMeta.factor}
                  yUnitLabel={yUnitMeta.label}
                  yScale={resolveYScaleForFile?.(file) ?? "linear"}
                  yLogCurrentMode={
                    resolveYLogCurrentModeForFile?.(file) ?? "all"
                  }
                />
              );
            })()
          ))}
        </div>
      </ScrollArea>
    </Card>
  );
});

OverviewGrid.displayName = "OverviewGrid";

export default OverviewGrid;

