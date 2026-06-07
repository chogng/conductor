import {
  createPlotThumbnail,
  type PlotThumbnailData,
} from "src/cs/workbench/contrib/plot/browser/plotThumbnail";
import type { CalculatedData } from "src/cs/workbench/contrib/calculation/common/calculatedData";
import type { OriginPlotOptions } from "src/cs/workbench/contrib/origin/common/originPlotOptions";
import type { PlotType } from "src/cs/workbench/contrib/plot/common/plot";
import type { PlotAxisSettings } from "src/cs/workbench/contrib/plot/common/plotAxisSettings";
import {
  drawThumbnailBitmap,
} from "src/cs/workbench/contrib/thumbnail/browser/thumbnailBitmap";
import type { IThumbnailService } from "src/cs/workbench/contrib/thumbnail/browser/thumbnailService";

export type CleanedFileLike = PlotThumbnailData & {
  fileId?: string;
  fileName?: string;
  yUnit?: string;
  curveFilterKey?: string | null;
  curveFilterField?: string | null;
  curveType?: string;
  x?: {
    sampledPoints?: number | null;
  };
  xAxisRole?: "vg" | "vd" | null;
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
  yLogCurrentMode = "all",
  yScale = "linear",
}: ThumbnailViewProps): HTMLElement => {
  const root = document.createElement("div");
  const title = file.fileName ?? file.fileId ?? "";
  const classes = [
    "thumbnail_view",
    isActive ? "thumbnail_view--active" : "",
  ].filter(Boolean);
  root.className = classes.join(" ");
  if (title) {
    root.title = title;
  }

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
    yLogCurrentMode,
    yScale,
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

  main.append(title);
  row.append(main);
  root.append(row);
  return root;
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
  yLogCurrentMode,
  yScale,
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
  readonly yLogCurrentMode: "all" | "positive";
  readonly yScale: string;
}): HTMLElement => {
  const root = document.createElement("div");
  root.className = "thumbnail_view_chart";
  root.style.aspectRatio = "16 / 9";
  if (plotModel) {
    root.append(createPlotMainThumbnailCanvas({
      file,
      originOpenPlotOptions,
      plotAxisSettings,
      plotModel,
      plotType,
      thumbnailService,
    }));
  } else {
    root.append(
      createPlotThumbnail({
        xGroups: file.xGroups,
        series: file.series,
        domain: file.domain,
        yScaleType: yScale === "log" ? "log" : "linear",
        yLogCurrentMode,
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
  return root;
};

const createPlotMainThumbnailCanvas = ({
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
  requestAnimationFrame(() => {
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

    drawThumbnailBitmap({ canvas, options });
  });
  return canvas;
};

export default ThumbnailView;
