import {
  getCardClassName,
  type CardVariant,
} from "cs/base/browser/ui/card/card";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import { languageService } from "src/cs/platform/language/browser/languageService";
import { getYUnitMeta } from "src/cs/workbench/contrib/chart/common/units";
import type { OriginCanvasExportScope } from "src/cs/workbench/contrib/export/browser/originCanvasExport";
import type { ProcessingStatus } from "src/cs/workbench/common/deviceAnalysis/sharedTypes";
import { createFileCard, type ProcessedFileLike } from "./FileCard";
import {
  createPreviewFieldFilterOptions,
  filterPreviewFiles,
  getVisiblePreviewFileIds,
  isBuiltInPreviewCurveFilter,
} from "src/cs/workbench/contrib/preview/browser/previewView";
import {
  createPreviewSelectionEvent,
  createPreviewVisibleFilesEvent,
} from "src/cs/workbench/contrib/preview/browser/previewViewPane";

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
  resolveYLogCurrentModeForFile?: (
    file: ProcessedFileLike | null | undefined,
  ) => "all" | "positive";
};

type CurveFilter = string;

const OverviewGrid = (props: OverviewGridProps): any => createOverviewGrid(props);

export const createOverviewGrid = ({
  activeFileId,
  isSelectionMode = false,
  onSelectFile,
  onToggleOriginCanvasSelection,
  onVisibleFileIdsChange,
  originCanvasExportScope = "selected",
  processedData = [],
  processingStatus,
  resolveYLogCurrentModeForFile,
  resolveYScaleForFile,
  resolveYUnitForFile,
  selectedOriginCanvasKeySet,
  xUnitFactor,
  xUnitLabel,
}: OverviewGridProps): HTMLElement | null => {
  if (!processedData.length) {
    return null;
  }

  const { t } = languageService.getSnapshot();
  let curveFilter: CurveFilter = "all";
  const fieldFilterOptions = createPreviewFieldFilterOptions(processedData, t);
  const curveFilterOptions = [
    ...fieldFilterOptions,
    { label: t("da_overview_curve_filter_all"), value: "all" as const },
    { label: t("da_overview_curve_filter_transfer"), value: "transfer" as const },
    { label: t("da_overview_curve_filter_output"), value: "output" as const },
  ];

  const card = createCard({
    variant: "panel",
    className: "preview_overview_grid_card",
  });
  const list = document.createElement("div");
  list.className = "preview_overview_grid_list";

  const renderList = (): void => {
    const filteredData = filterPreviewFiles(processedData, curveFilter);
    const visibleFileIds = getVisiblePreviewFileIds(filteredData);
    onVisibleFileIdsChange?.(
      createPreviewVisibleFilesEvent(visibleFileIds).fileIds,
    );
    list.replaceChildren(
      ...filteredData.map((file) => {
        const yUnitMeta = getYUnitMeta(resolveYUnitForFile?.(file) ?? file?.yUnit ?? "A");
        return createFileCard({
          file,
          isActive: file.fileId === activeFileId,
          onSelectFile: (fileId) => {
            const event = createPreviewSelectionEvent(fileId);
            if (event) {
              onSelectFile?.(event.fileId);
            }
          },
          isSelectionMode:
            isSelectionMode && originCanvasExportScope === "selected",
          isOriginSelected: selectedOriginCanvasKeySet?.has(
            String(file?.fileId ?? ""),
          ),
          showOriginSelectionBadge:
            isSelectionMode && originCanvasExportScope === "selected",
          onToggleOriginSelected: onToggleOriginCanvasSelection,
          originSelectedBadgeLabel: t("da_overview_select_badge"),
          xUnitFactor,
          xUnitLabel,
          yUnitFactor: yUnitMeta.factor,
          yUnitLabel: yUnitMeta.label,
          yScale: resolveYScaleForFile?.(file) ?? "linear",
          yLogCurrentMode: resolveYLogCurrentModeForFile?.(file) ?? "all",
        });
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
      t,
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
  t,
}: {
  readonly curveFilter: CurveFilter;
  readonly curveFilterOptions: Array<{ label: string; value: string }>;
  readonly fieldFilterOptions: Array<{ label: string; value: string }>;
  readonly onChange: (nextFilter: CurveFilter) => void;
  readonly processingStatus?: Partial<ProcessingStatus>;
  readonly t: TranslateFn;
}): HTMLElement => {
  const root = document.createElement("div");
  root.className = "preview_overview_grid_toolbar";

  const row = document.createElement("div");
  row.className = "preview_overview_grid_toolbar_row";
  const controls = document.createElement("div");
  controls.className = "preview_overview_grid_toolbar_controls";
  const filterWrap = document.createElement("div");
  filterWrap.className = "preview_overview_grid_filter";

  const label = document.createElement("label");
  label.htmlFor = "analysis-overview-curve-filter-btn";
  label.className = "preview_visually_hidden";
  label.textContent = t("da_overview_curve_filter_label");
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
        if (isBuiltInPreviewCurveFilter(nextValue)) {
          onChange(nextValue);
          return;
        }
        const matchedFieldOption = fieldFilterOptions.find(
          (option) => option.value === nextValue,
        );
        onChange(matchedFieldOption?.value ?? "all");
      },
      className: "preview_overview_grid_select da-neutral-select",
    }),
  );
  controls.append(filterWrap);

  if (processingStatus?.state === "processing") {
    const progress = document.createElement("div");
    progress.className = "preview_overview_grid_progress";
    progress.textContent = t("da_overview_processing", {
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
  root.className = "scrollArea preview_overview_grid_scroll";
  const viewport = document.createElement("div");
  viewport.className = "scrollAreaViewport preview_overview_grid_scroll_viewport";
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
