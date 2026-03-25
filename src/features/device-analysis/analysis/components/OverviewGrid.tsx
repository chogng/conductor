import { memo, useMemo, useRef, useState } from "react";
import {
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  Check,
  CheckCheck,
  ChevronDown,
  MousePointer2,
} from "lucide-react";
import Button from "../../../../components/ui/Button";
import Card from "../../../../components/ui/Card";
import DropdownMenu from "../../../../components/ui/DropdownMenu";
import ScrollArea from "../../../../components/ui/ScrollArea";
import { useLanguage } from "../../../../hooks/useLanguage";
import type { ProcessingStatus } from "../../shared/lib/sharedTypes";
import FileCard, { type ProcessedFileLike } from "./FileCard";

type OverviewGridProps = {
  processedData?: ProcessedFileLike[];
  processingStatus?: Partial<ProcessingStatus>;
  activeFileId?: string | null;
  onSelectFile?: (fileId: string | undefined) => void;
  selectedOriginCanvasKeySet?: Set<string>;
  onToggleOriginCanvasSelection?: (fileId: string | undefined) => void;
  onSelectAllOriginCanvases?: () => void;
  onClearOriginCanvasSelection?: () => void;
  xUnitFactor?: number;
  xUnitLabel?: string;
  yUnitFactor?: number;
  yUnitLabel?: string;
  yScale?: string;
};

type SortOrder = "none" | "desc" | "asc";
type CurveFilter = "all" | "transfer" | "output";

const OverviewGrid = memo(function OverviewGrid({
  processedData = [],
  processingStatus,
  activeFileId,
  onSelectFile,
  selectedOriginCanvasKeySet,
  onToggleOriginCanvasSelection,
  onSelectAllOriginCanvases,
  onClearOriginCanvasSelection,
  xUnitFactor,
  xUnitLabel,
  yUnitFactor,
  yUnitLabel,
  yScale,
}: OverviewGridProps) {
  const { t } = useLanguage();
  const curveFilterDropdownRef = useRef<HTMLDivElement | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>("none");
  const [curveFilter, setCurveFilter] = useState<CurveFilter>("all");
  const [isCurveFilterMenuOpen, setIsCurveFilterMenuOpen] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);

  const curveFilterOptions = useMemo(
    () => [
      { label: t("da_overview_curve_filter_all"), value: "all" as const },
      {
        label: t("da_overview_curve_filter_transfer"),
        value: "transfer" as const,
      },
      { label: t("da_overview_curve_filter_output"), value: "output" as const },
    ],
    [t],
  );

  const activeCurveFilterLabel =
    curveFilterOptions.find((option) => option.value === curveFilter)?.label ??
    curveFilterOptions[0]?.label ??
    t("da_overview_curve_filter_all");

  const sortOrderLabel =
    sortOrder === "none"
      ? t("da_overview_sort_ymax_none")
      : sortOrder === "desc"
        ? t("da_overview_sort_ymax_desc")
        : t("da_overview_sort_ymax_asc");

  const sortedData = useMemo(() => {
    if (!processedData.length) return [];
    if (sortOrder === "none") return processedData;
    return [...processedData].sort((a, b) => {
      // Sort by yMax.
      const aY = a?.domain?.y?.[1] ?? Number.NEGATIVE_INFINITY;
      const bY = b?.domain?.y?.[1] ?? Number.NEGATIVE_INFINITY;
      return sortOrder === "desc" ? bY - aY : aY - bY;
    });
  }, [processedData, sortOrder]);

  const filteredData = useMemo(() => {
    if (curveFilter === "all") return sortedData;
    const target = curveFilter === "transfer" ? "vg" : "vd";
    return sortedData.filter((file) => {
      // Check curveType field first (if available).
      if (file?.curveType) {
        const curveType = String(file.curveType).toLowerCase();
        return curveType.includes(target);
      }
      // Fallback to xLabel (may exist in broader processed shape).
      const label = String(
        (file as ProcessedFileLike & { xLabel?: string })?.xLabel || "",
      ).toLowerCase();
      return label.includes(target);
    });
  }, [sortedData, curveFilter]);

  const selectedCanvasCount = selectedOriginCanvasKeySet?.size ?? 0;
  const isAllCanvasSelected =
    processedData.length > 0 && selectedCanvasCount >= processedData.length;
  const selectModeStateLabel = isSelectMode
    ? t("da_overview_select_mode_on")
    : t("da_overview_select_mode_off");

  if (!processedData.length) return null;

  return (
    <Card variant="panel" className="h-full min-h-0 flex flex-col !pr-0">
      <div className="mb-3 pr-4 space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex items-center gap-2">
            <label
              htmlFor="device-analysis-overview-curve-filter-btn"
              className="sr-only"
            >
              {t("da_overview_curve_filter_label")}
            </label>
            <div ref={curveFilterDropdownRef} className="relative">
              <div
                className="input_field input_field--md relative pr-1"
                data-state="enable"
                data-cta="Device Analysis"
                data-cta-position="overview-grid"
                data-cta-copy="curve filter"
              >
                <button
                  id="device-analysis-overview-curve-filter-btn"
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={isCurveFilterMenuOpen}
                  aria-controls="device-analysis-overview-curve-filter-menu"
                  aria-label={t("da_overview_curve_filter_label")}
                  title={t("da_overview_curve_filter_label")}
                  onClick={() => setIsCurveFilterMenuOpen((prev) => !prev)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setIsCurveFilterMenuOpen(false);
                      return;
                    }

                    if (
                      event.key === "Enter" ||
                      event.key === " " ||
                      event.key === "ArrowDown"
                    ) {
                      event.preventDefault();
                      setIsCurveFilterMenuOpen(true);
                    }
                  }}
                  className="input_native no-focus-outline p-0 pr-8 text-left cursor-pointer select-none"
                >
                  <span className="block truncate text-text-primary">
                    {activeCurveFilterLabel}
                  </span>
                </button>

                <span className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-secondary pointer-events-none">
                  <ChevronDown
                    size={16}
                    className={`transition-transform duration-200 ${
                      isCurveFilterMenuOpen ? "rotate-180" : ""
                    }`}
                  />
                </span>
              </div>

              <DropdownMenu
                isOpen={isCurveFilterMenuOpen}
                onClose={() => setIsCurveFilterMenuOpen(false)}
                anchorRef={curveFilterDropdownRef}
                id="device-analysis-overview-curve-filter-menu"
                role="menu"
                className="left-0 right-auto w-max min-w-max"
              >
                {curveFilterOptions.map((option) => {
                  const isActive = option.value === curveFilter;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isActive}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm text-left whitespace-nowrap transition-colors ${
                        isActive
                          ? "bg-bg-page text-text-primary"
                          : "text-text-secondary hover:bg-bg-page hover:text-text-primary"
                      }`}
                      onClick={() => {
                        setCurveFilter(option.value);
                        setIsCurveFilterMenuOpen(false);
                      }}
                    >
                      <span className="whitespace-nowrap">{option.label}</span>
                      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-accent">
                        <Check
                          size={14}
                          className={isActive ? "opacity-100" : "opacity-0"}
                        />
                      </span>
                    </button>
                  );
                })}
              </DropdownMenu>
            </div>
          </div>

          <Button
            id="device-analysis-overview-sort-ymax-btn"
            cta="Device Analysis"
            ctaPosition="overview-grid"
            ctaCopy="sort by ymax"
            variant={sortOrder !== "none" ? "secondary" : "ghost"}
            size="control"
            onClick={() => {
              setSortOrder((prev) => {
                if (prev === "none") return "desc";
                if (prev === "desc") return "asc";
                return "none";
              });
            }}
            title={t("da_overview_sort_ymax_title", { order: sortOrderLabel })}
            aria-label={t("da_overview_sort_ymax_title", {
              order: sortOrderLabel,
            })}
          >
            {sortOrder === "asc" ? (
              <ArrowUpWideNarrow size={18} />
            ) : (
              <ArrowDownWideNarrow size={18} />
            )}
          </Button>

          <Button
            id="device-analysis-overview-select-mode-btn"
            cta="Device Analysis"
            ctaPosition="overview-grid"
            ctaCopy="canvas select mode"
            variant={isSelectMode ? "secondary" : "ghost"}
            size="control"
            onClick={() => setIsSelectMode((prev) => !prev)}
            title={t("da_overview_select_mode_title", {
              state: selectModeStateLabel,
            })}
            aria-label={t("da_overview_select_mode_title", {
              state: selectModeStateLabel,
            })}
          >
            <MousePointer2 size={16} className={isSelectMode ? "text-accent" : ""} />
          </Button>

          <Button
            id="device-analysis-overview-canvas-toggle-all-btn"
            cta="Device Analysis"
            ctaPosition="overview-grid"
            ctaCopy="canvas toggle all"
            variant="ghost"
            size="control"
            onClick={() => {
              if (isAllCanvasSelected) {
                onClearOriginCanvasSelection?.();
                return;
              }
              onSelectAllOriginCanvases?.();
            }}
            disabled={
              !isSelectMode ||
              !onSelectAllOriginCanvases ||
              !onClearOriginCanvasSelection ||
              processedData.length === 0
            }
            title={t(
              isAllCanvasSelected
                ? "da_origin_canvas_clear"
                : "da_origin_canvas_select_all",
            )}
            aria-label={t(
              isAllCanvasSelected
                ? "da_origin_canvas_clear"
                : "da_origin_canvas_select_all",
            )}
          >
            <CheckCheck size={16} />
          </Button>

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

        <div className="meta_text whitespace-nowrap">
          {t("da_overview_selected_num_figures", {
            count: selectedCanvasCount,
          })}
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0" viewportClassName="pr-4" axis="y">
        <div className="grid grid-cols-1 auto-rows-max gap-2.5 content-start">
          {filteredData.map((file) => (
            <FileCard
              key={file.fileId}
              file={file}
              isActive={file.fileId === activeFileId}
              onSelectFile={onSelectFile}
              isSelectionMode={isSelectMode}
              isOriginSelected={selectedOriginCanvasKeySet?.has(
                String(file?.fileId ?? ""),
              )}
              onToggleOriginSelected={onToggleOriginCanvasSelection}
              originSelectedBadgeLabel={t("da_overview_select_badge")}
              xUnitFactor={xUnitFactor}
              xUnitLabel={xUnitLabel}
              yUnitFactor={yUnitFactor}
              yUnitLabel={yUnitLabel}
              yScale={yScale}
            />
          ))}
        </div>
      </ScrollArea>
    </Card>
  );
});

OverviewGrid.displayName = "OverviewGrid";

export default OverviewGrid;
