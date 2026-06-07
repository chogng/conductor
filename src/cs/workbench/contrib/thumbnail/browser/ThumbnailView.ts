import {
  createCanvasMultiLinePlot,
  resolvePreviewPlotYDataRange,
  type CanvasMultiLinePlotProps,
} from "src/cs/workbench/contrib/plot/browser/CanvasMultiLinePlot";
import { formatNumber } from "src/cs/workbench/contrib/calculation/common/numberFormat";
import type { CalculatedData } from "src/cs/workbench/contrib/calculation/common/calculatedData";
import type { OriginPlotOptions } from "src/cs/workbench/contrib/origin/common/originPlotOptions";
import type { PlotType } from "src/cs/workbench/contrib/plot/common/plot";
import type { PlotAxisSettings } from "src/cs/workbench/contrib/plot/common/plotAxisSettings";
import {
  drawThumbnailPlotBitmap,
} from "src/cs/workbench/contrib/thumbnail/browser/thumbnailPlotBitmap";
import type { IThumbnailService } from "src/cs/workbench/contrib/thumbnail/browser/thumbnailService";

export type CleanedFileLike = {
  fileId?: string;
  fileName?: string;
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
  series?: CanvasMultiLinePlotProps["series"];
  domain?: {
    x?: [number, number];
    y?: [number, number];
  };
};

export type ThumbnailViewProps = {
  file: CleanedFileLike;
  originOpenPlotOptions?: OriginPlotOptions;
  plotAxisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
  plotModel?: CalculatedData | null;
  plotType?: PlotType;
  thumbnailService?: Pick<IThumbnailService, "drawPlotThumbnail"> | null;
  isActive?: boolean;
  isOriginSelected?: boolean;
  showOriginSelectionBadge?: boolean;
  originSelectedBadgeLabel?: string;
  xUnitFactor?: number;
  xUnitLabel?: string;
  yUnitFactor?: number;
  yUnitLabel?: string;
  yScale?: string;
  yLogCurrentMode?: "all" | "positive";
};

const ThumbnailView = (props: ThumbnailViewProps): HTMLElement => createThumbnailView(props);

export const createThumbnailView = ({
  file,
  originOpenPlotOptions,
  plotAxisSettings,
  plotModel = null,
  plotType = "iv",
  thumbnailService = null,
  isActive = false,
  isOriginSelected = false,
  originSelectedBadgeLabel = "SELECT",
  showOriginSelectionBadge = false,
  xUnitFactor = 1,
  xUnitLabel = "V",
  yLogCurrentMode = "all",
  yScale = "linear",
  yUnitFactor = 1,
  yUnitLabel = "A",
}: ThumbnailViewProps): HTMLElement => {
  const root = document.createElement("div");
  root.className = isActive
    ? "thumbnail_view thumbnail_view--active"
    : "thumbnail_view";

  root.append(createHeader(file), createChartThumbnail({
    file,
    originOpenPlotOptions,
    plotAxisSettings,
    plotModel,
    plotType,
    thumbnailService,
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
  return root;
};

const createHeader = (file: CleanedFileLike): HTMLElement => {
  const root = document.createElement("div");
  root.className = "thumbnail_view_header";

  const row = document.createElement("div");
  row.className = "thumbnail_view_header_row";
  const main = document.createElement("div");
  main.className = "thumbnail_view_header_main";

  const title = document.createElement("div");
  title.className = "thumbnail_view_title";
  title.textContent = file.fileName ?? file.fileId ?? "";

  const meta = document.createElement("div");
  meta.className = "thumbnail_view_meta";
  const metaText = document.createElement("div");
  metaText.id = `thumbnail-series-${toSafeIdSuffix(file?.fileId ?? file?.fileName)}`;
  metaText.className = "thumbnail_view_meta_text";
  metaText.textContent = createMetaText(file);
  meta.append(metaText);
  main.append(title, meta);
  row.append(main);
  root.append(row);
  return root;
};

const createMetaText = (file: CleanedFileLike): string => {
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

const createChartThumbnail = ({
  file,
  originOpenPlotOptions,
  plotAxisSettings,
  plotModel,
  plotType,
  thumbnailService,
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
  readonly file: CleanedFileLike;
  readonly originOpenPlotOptions?: OriginPlotOptions;
  readonly plotAxisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
  readonly plotModel: CalculatedData | null;
  readonly plotType: PlotType;
  readonly thumbnailService: Pick<IThumbnailService, "drawPlotThumbnail"> | null;
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
  root.className = "thumbnail_view_chart";
  root.style.aspectRatio = "16 / 9";
  if (plotModel) {
    root.append(createMainPlotThumbnailCanvas({
      file,
      originOpenPlotOptions,
      plotAxisSettings,
      plotModel,
      plotType,
      thumbnailService,
    }));
  } else {
    root.append(
      createCanvasMultiLinePlot({
        xGroups: file.xGroups,
        series: file.series,
        domain: file.domain,
        xScaleFactor: xUnitFactor,
        xUnitLabel,
        yScaleFactor: yUnitFactor,
        yScaleType: yScale === "log" ? "log" : "linear",
        yLogCurrentMode,
        yUnitLabel,
        title: file.fileName ?? file.fileId ?? "",
        className: "thumbnail_view_chart_canvas",
      }),
    );
  }

  if (showOriginSelectionBadge && isOriginSelected) {
    const badge = document.createElement("div");
    badge.className = "thumbnail_view_selection_badge";
    badge.textContent = originSelectedBadgeLabel;
    root.append(badge);
  }

  const range = plotModel
    ? { min: plotModel.yDomain[0], max: plotModel.yDomain[1] }
    : resolvePreviewPlotYDataRange({
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

const createMainPlotThumbnailCanvas = ({
  file,
  originOpenPlotOptions,
  plotAxisSettings,
  plotModel,
  plotType,
  thumbnailService,
}: {
  readonly file: CleanedFileLike;
  readonly originOpenPlotOptions?: OriginPlotOptions;
  readonly plotAxisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
  readonly plotModel: CalculatedData;
  readonly plotType: PlotType;
  readonly thumbnailService: Pick<IThumbnailService, "drawPlotThumbnail"> | null;
}): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.className = "thumbnail_view_chart_canvas";
  canvas.title = file.fileName ?? file.fileId ?? "";
  queueMicrotask(() => {
    const options = {
      model: plotModel,
      originOpenPlotOptions,
      plotAxisSettings,
      plotType,
    };
    if (thumbnailService) {
      thumbnailService.drawPlotThumbnail(canvas, options);
      return;
    }

    drawThumbnailPlotBitmap({ canvas, options });
  });
  return canvas;
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
  root.className = "thumbnail_view_axis_range";
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

export default ThumbnailView;
