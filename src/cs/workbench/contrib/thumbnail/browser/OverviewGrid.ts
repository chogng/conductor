import { localize } from "src/cs/nls";
import {
  getCardClassName,
  type CardVariant,
} from "cs/base/browser/ui/card/card";
import { getYUnitMeta } from "src/cs/workbench/contrib/plot/common/units";
import type { OriginCanvasExportScope } from "src/cs/workbench/contrib/export/browser/originCanvasExport";
import type { ProcessingStatus } from "src/cs/workbench/contrib/session/common/sessionTypes";
import {
  createThumbnailView,
  type CleanedFileLike,
} from "src/cs/workbench/contrib/thumbnail/browser/ThumbnailView";
import {
  createThumbnailFieldFilterOptions,
  filterThumbnailFiles,
  getVisibleThumbnailFileIds,
  isBuiltInThumbnailCurveFilter,
} from "src/cs/workbench/contrib/thumbnail/browser/thumbnailFilters";
import {
  createThumbnailSelectionEvent,
  createThumbnailVisibleFilesEvent,
} from "src/cs/workbench/contrib/thumbnail/browser/thumbnailViewPane";

type OverviewGridProps = {
  cleanedData?: CleanedFileLike[];
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
  resolveYUnitForFile?: (file: CleanedFileLike | null | undefined) => string;
  resolveYScaleForFile?: (file: CleanedFileLike | null | undefined) => string;
  resolveYLogCurrentModeForFile?: (
    file: CleanedFileLike | null | undefined,
  ) => "all" | "positive";
};

type CurveFilter = string;

const OverviewGrid = (props: OverviewGridProps): HTMLElement | null =>
  createOverviewGrid(props);

export const createOverviewGrid = ({
  activeFileId,
  isSelectionMode = false,
  onSelectFile,
  onToggleOriginCanvasSelection,
  onVisibleFileIdsChange,
  originCanvasExportScope = "selected",
  cleanedData = [],
  processingStatus,
  resolveYLogCurrentModeForFile,
  resolveYScaleForFile,
  resolveYUnitForFile,
  selectedOriginCanvasKeySet,
  xUnitFactor,
  xUnitLabel,
}: OverviewGridProps): HTMLElement | null => {
  if (!cleanedData.length) {
    return null;
  }
  let curveFilter: CurveFilter = "all";
  const fieldFilterOptions = createThumbnailFieldFilterOptions(cleanedData);
  const curveFilterOptions = [
    ...fieldFilterOptions,
    { label: localize("da_overview_curve_filter_all", "All"), value: "all" as const },
    { label: localize("da_overview_curve_filter_transfer", "Transfer"), value: "transfer" as const },
    { label: localize("da_overview_curve_filter_output", "Output"), value: "output" as const },
  ];

  const card = createCard({
    variant: "panel",
    className: "thumbnail_overview_grid_card",
  });
  const list = document.createElement("div");
  list.className = "thumbnail_overview_grid_list";

  const renderList = (): void => {
    const filteredData = filterThumbnailFiles(cleanedData, curveFilter);
    const visibleFileIds = getVisibleThumbnailFileIds(filteredData);
    onVisibleFileIdsChange?.(
      createThumbnailVisibleFilesEvent(visibleFileIds).fileIds,
    );
    list.replaceChildren(
      ...filteredData.map((file) => {
        const yUnitMeta = getYUnitMeta(resolveYUnitForFile?.(file) ?? file?.yUnit ?? "A");
        const item = document.createElement("button");
        item.type = "button";
        item.className = "thumbnail_overview_grid_item";
        item.addEventListener("mousedown", (event) => event.preventDefault());
        item.addEventListener("click", () => {
          if (isSelectionMode && originCanvasExportScope === "selected") {
            onToggleOriginCanvasSelection?.(file?.fileId);
            return;
          }
          const event = createThumbnailSelectionEvent(file?.fileId);
          if (event) {
            onSelectFile?.(event.fileId);
          }
        });
        item.append(createThumbnailView({
          file,
          isActive: file.fileId === activeFileId,
          isOriginSelected: selectedOriginCanvasKeySet?.has(
            String(file?.fileId ?? ""),
          ),
          showOriginSelectionBadge:
            isSelectionMode && originCanvasExportScope === "selected",
          originSelectedBadgeLabel: localize("da_overview_select_badge", "SELECT"),
          xUnitFactor,
          xUnitLabel,
          yUnitFactor: yUnitMeta.factor,
          yUnitLabel: yUnitMeta.label,
          yScale: resolveYScaleForFile?.(file) ?? "linear",
          yLogCurrentMode: resolveYLogCurrentModeForFile?.(file) ?? "all",
        }));
        return item;
      }),
    );
  };

  card.append(
    createToolbar({
      curveFilter,
      curveFilterOptions,
      fieldFilterOptions,
      onChange: (nextFilter) => {
        curveFilter = nextFilter;
        renderList();
      },
      processingStatus,
    }),
    createScrollArea(list),
  );
  renderList();
  return card;
};

const createToolbar = ({
  curveFilter,
  curveFilterOptions,
  fieldFilterOptions,
  onChange,
  processingStatus,
}: {
  readonly curveFilter: CurveFilter;
  readonly curveFilterOptions: Array<{ label: string; value: string }>;
  readonly fieldFilterOptions: Array<{ label: string; value: string }>;
  readonly onChange: (nextFilter: CurveFilter) => void;
  readonly processingStatus?: Partial<ProcessingStatus>;
}): HTMLElement => {
  const root = document.createElement("div");
  root.className = "thumbnail_overview_grid_toolbar";

  const row = document.createElement("div");
  row.className = "thumbnail_overview_grid_toolbar_row";
  const controls = document.createElement("div");
  controls.className = "thumbnail_overview_grid_toolbar_controls";
  const filterWrap = document.createElement("div");
  filterWrap.className = "thumbnail_overview_grid_filter";

  const label = document.createElement("label");
  label.htmlFor = "analysis-overview-curve-filter-btn";
  label.className = "thumbnail_visually_hidden";
  label.textContent = localize("da_overview_curve_filter_label", "Curve filter");
  filterWrap.append(
    label,
    createDropdown({
      id: "analysis-overview-curve-filter-btn",
      value: curveFilter,
      options: curveFilterOptions,
      onChange: (next) => {
        const nextValue = String(next ?? "").trim();
        if (!nextValue) {
          onChange("all");
          return;
        }
        if (isBuiltInThumbnailCurveFilter(nextValue)) {
          onChange(nextValue);
          return;
        }
        const matchedFieldOption = fieldFilterOptions.find(
          (option) => option.value === nextValue,
        );
        onChange(matchedFieldOption?.value ?? "all");
      },
      className: "thumbnail_overview_grid_select da-neutral-select",
    }),
  );
  controls.append(filterWrap);

  if (processingStatus?.state === "processing") {
    const progress = document.createElement("div");
    progress.className = "thumbnail_overview_grid_progress";
    progress.textContent = localize("da_overview_processing", "Processing {processed}/{total}", {
      processed: processingStatus.processed,
      total: processingStatus.total,
    });
    controls.append(progress);
  }

  row.append(controls);
  root.append(row);
  return root;
};

const createScrollArea = (content: HTMLElement): HTMLElement => {
  const root = document.createElement("div");
  root.className = "scrollArea thumbnail_overview_grid_scroll";
  const viewport = document.createElement("div");
  viewport.className = "scrollAreaViewport thumbnail_overview_grid_scroll_viewport";
  viewport.dataset.axis = "y";
  viewport.append(content);
  root.append(viewport);
  return root;
};

const createDropdown = ({
  className = "",
  disabled = false,
  id,
  onChange,
  options = [],
  size = "sm",
  value,
}: {
  readonly className?: string;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly onChange?: (next: string | number) => void;
  readonly options?: Array<{ disabled?: boolean; label?: string | number; value: string | number }>;
  readonly size?: "sm" | "md" | "xl";
  readonly value?: string | number;
}): HTMLSelectElement => {
  const select = document.createElement("select");
  if (id) {
    select.id = id;
  }
  select.disabled = disabled;
  select.value = String(value ?? "");
  select.className = `dropdown-field dropdown-field--${size} ${className}`.trim();
  select.addEventListener("change", () => onChange?.(select.value));
  for (const option of options) {
    const item = document.createElement("option");
    item.value = String(option.value);
    item.disabled = Boolean(option.disabled);
    item.textContent = String(option.label ?? option.value);
    select.append(item);
  }
  return select;
};

const createCard = ({
  className = "",
  variant = "default",
}: {
  readonly className?: string;
  readonly variant?: CardVariant;
}): HTMLElement => {
  const card = document.createElement("div");
  card.className = getCardClassName({ className, variant });
  return card;
};

export default OverviewGrid;
