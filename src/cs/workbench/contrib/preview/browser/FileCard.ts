import {
  createCanvasMultiLineChart,
  resolvePreviewChartYDataRange,
  type CanvasMultiLineChartProps,
} from "src/cs/workbench/contrib/chart/browser/CanvasMultiLineChart";
import { formatNumber } from "src/cs/workbench/contrib/diagnostics/common/numberFormat";

export type ProcessedFileLike = {
  fileId?: string;
  fileName: string;
  yUnit?: string;
  curveFilterKey?: string | null;
  curveFilterField?: string | null;
  curveType?: string;
  curveTypeConfidence?: "high" | "medium" | "low";
  x?: {
    sampledPoints?: number | null;
  };
  xAxisRole?: "vg" | "vd" | null;
  xGroups?: number[][];
  series?: CanvasMultiLineChartProps["series"];
  domain?: {
    x?: [number, number];
    y?: [number, number];
  };
};

type FileCardProps = {
  file: ProcessedFileLike;
  isActive: boolean;
  onSelectFile?: (fileId: string | undefined) => void;
  isSelectionMode?: boolean;
  isOriginSelected?: boolean;
  showOriginSelectionBadge?: boolean;
  onToggleOriginSelected?: (fileId: string | undefined) => void;
  originSelectedBadgeLabel?: string;
  xUnitFactor?: number;
  xUnitLabel?: string;
  yUnitFactor?: number;
  yUnitLabel?: string;
  yScale?: string;
  yLogCurrentMode?: "all" | "positive";
};

const FileCard = (props: FileCardProps): any => createFileCard(props);

export const createFileCard = ({
  file,
  isActive,
  isOriginSelected = false,
  isSelectionMode = false,
  onSelectFile,
  onToggleOriginSelected,
  originSelectedBadgeLabel = "SELECT",
  showOriginSelectionBadge = false,
  xUnitFactor = 1,
  xUnitLabel = "V",
  yLogCurrentMode = "all",
  yScale = "linear",
  yUnitFactor = 1,
  yUnitLabel = "A",
}: FileCardProps): HTMLButtonElement => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = isActive
    ? "preview_file_card preview_file_card--active"
    : "preview_file_card";
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => {
    if (isSelectionMode) {
      onToggleOriginSelected?.(file?.fileId);
      return;
    }
    onSelectFile?.(file?.fileId);
  });

  button.append(createHeader(file), createChartPreview({
    file,
    isOriginSelected,
    originSelectedBadgeLabel,
    showOriginSelectionBadge,
    xUnitFactor,
    xUnitLabel,
    yLogCurrentMode,
    yScale,
    yUnitFactor,
    yUnitLabel,
  }));
  return button;
};

const createHeader = (file: ProcessedFileLike): HTMLElement => {
  const root = document.createElement("div");
  root.className = "preview_file_card_header";

  const row = document.createElement("div");
  row.className = "preview_file_card_header_row";
  const main = document.createElement("div");
  main.className = "preview_file_card_header_main";

  const title = document.createElement("div");
  title.className = "preview_file_card_title";
  title.textContent = file.fileName;

  const meta = document.createElement("div");
  meta.className = "preview_file_card_meta";
  const metaText = document.createElement("div");
  metaText.id = `file-card-series-${toSafeIdSuffix(file?.fileId ?? file?.fileName)}`;
  metaText.className = "preview_file_card_meta_text";
  metaText.textContent = createMetaText(file);
  meta.append(metaText);
  main.append(title, meta);
  row.append(main);
  root.append(row);
  return root;
};

const createMetaText = (file: ProcessedFileLike): string => {
  const seriesCount = Array.isArray(file?.series) ? file.series.length : 0;
  const sampledPoints = file?.x?.sampledPoints ?? null;
  const parts = [`series:${seriesCount}`];
  if (sampledPoints) {
    parts.push(`points: ${sampledPoints}`);
  }
  if (file.curveType) {
    parts.push(
      `Type:${file.curveType}${file.curveTypeConfidence ? ` (${file.curveTypeConfidence})` : ""}`,
    );
  }
  return parts.join(" | ");
};

const createChartPreview = ({
  file,
  isOriginSelected,
  originSelectedBadgeLabel,
  showOriginSelectionBadge,
  xUnitFactor,
  xUnitLabel,
  yLogCurrentMode,
  yScale,
  yUnitFactor,
  yUnitLabel,
}: {
  readonly file: ProcessedFileLike;
  readonly isOriginSelected: boolean;
  readonly originSelectedBadgeLabel: string;
  readonly showOriginSelectionBadge: boolean;
  readonly xUnitFactor: number;
  readonly xUnitLabel: string;
  readonly yLogCurrentMode: "all" | "positive";
  readonly yScale: string;
  readonly yUnitFactor: number;
  readonly yUnitLabel: string;
}): HTMLElement => {
  const root = document.createElement("div");
  root.className = "preview_file_card_chart";
  root.style.aspectRatio = "16 / 9";
  root.append(
    createCanvasMultiLineChart({
      xGroups: file.xGroups,
      series: file.series,
      domain: file.domain,
      xScaleFactor: xUnitFactor,
      xUnitLabel,
      yScaleFactor: yUnitFactor,
      yScaleType: yScale === "log" ? "log" : "linear",
      yLogCurrentMode,
      yUnitLabel,
      title: file.fileName,
      className: "preview_file_card_chart_canvas",
    }),
  );

  if (showOriginSelectionBadge && isOriginSelected) {
    const badge = document.createElement("div");
    badge.className = "preview_file_card_selection_badge";
    badge.textContent = originSelectedBadgeLabel;
    root.append(badge);
  }

  const range = resolvePreviewChartYDataRange({
    series: file?.series,
    yScaleType: yScale === "log" ? "log" : "linear",
    yLogCurrentMode,
  });
  const labels = createYAxisRangeLabels(range, yUnitFactor, yUnitLabel);
  if (labels) {
    root.append(labels);
  }
  return root;
};

const createYAxisRangeLabels = (
  range: { min: number | null; max: number | null },
  factor: number,
  unitLabel: string,
): HTMLElement | null => {
  const min = Number(range.min);
  const max = Number(range.max);
  const hasMin = Number.isFinite(min);
  const hasMax = Number.isFinite(max);
  if (!hasMin && !hasMax) {
    return null;
  }

  const suffix = unitLabel ? ` ${unitLabel}` : "";
  const root = document.createElement("div");
  root.className = "preview_file_card_axis_range";
  if (hasMin) {
    root.append(createRangeLine(`ymin:${formatNumber(min * factor, { digits: 3 })}${suffix}`));
  }
  if (hasMax) {
    root.append(createRangeLine(`ymax:${formatNumber(max * factor, { digits: 3 })}${suffix}`));
  }
  return root;
};

const createRangeLine = (text: string): HTMLElement => {
  const line = document.createElement("div");
  line.textContent = text;
  return line;
};

const toSafeIdSuffix = (value: string | undefined): string => {
  const normalized = (value ?? "").trim();
  if (!normalized) {
    return "unknown";
  }
  return normalized.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
};

export default FileCard;
