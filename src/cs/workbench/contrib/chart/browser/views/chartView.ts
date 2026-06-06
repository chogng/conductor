import { localize } from "src/cs/nls";
import type { OriginPlotOptions } from "src/cs/workbench/contrib/origin/common/originPlotOptions";
import { createMainPlotView } from "src/cs/workbench/contrib/plot/browser/mainPlotView";
import {
  createSecondCalculatedData,
  getCalculatedData,
  type CalculatedDataByKey,
} from "src/cs/workbench/contrib/calculation/common/calculatedData";
import type { PlotType } from "src/cs/workbench/contrib/plot/common/plot";
import type { PlotAxisSettings } from "src/cs/workbench/contrib/plot/common/plotAxisSettings";
import { createEmptyView } from "src/cs/workbench/contrib/chart/browser/views/emptyView";
import { filterCalculatedDataSeries } from "src/cs/workbench/contrib/chart/browser/chartLegendVisibility";
import type {
  IonIoffManualTargetsByFileId,
  IonIoffMethod,
  SsManualRanges,
  SsMethod,
} from "src/cs/workbench/contrib/session/browser/sessionContext";
import type {
  CleanedEntry,
  ProcessingStatus,
} from "src/cs/workbench/contrib/session/common/sessionTypes";

import "src/cs/workbench/contrib/chart/browser/views/media/chartView.css";

type StateSetter<T> = (next: T | ((previous: T) => T)) => void;

export type ChartPane = "chart" | "inspector";

export type ChartViewProps = {
  visiblePanes?: readonly ChartPane[];
  activePlotType?: PlotType;
  onActivePlotTypeChange?: (next: PlotType) => void;
  cleanedData: CleanedEntry[];
  calculatedDataByKey?: CalculatedDataByKey;
  processingStatus?: Partial<ProcessingStatus>;
  activeFileId?: string | null;
  ionIoffMethod?: IonIoffMethod;
  ionIoffManualTargetsByFileId?: IonIoffManualTargetsByFileId;
  onActiveFileIdChange?: (nextFileId: string | null) => void;
  showFileSelect?: boolean;
  hiddenLegendKeys?: readonly string[];
  setIonIoffMethod?: (next: IonIoffMethod) => void;
  setIonIoffManualTargetsByFileId?: StateSetter<IonIoffManualTargetsByFileId>;
  ssMethod?: SsMethod;
  setSsMethod?: (next: SsMethod) => void;
  ssShowFitLine?: boolean;
  setSsShowFitLine?: (next: boolean) => void;
  ssManualRanges?: SsManualRanges;
  setSsManualRanges?: (next: SsManualRanges) => void;
  originOpenPlotOptions?: OriginPlotOptions;
  onOriginOpenPlotOptionsChange?: (updates: unknown) => Promise<unknown> | void;
  plotAxisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
  onPlotAxisSettingsChange?: (updates: unknown) => Promise<unknown> | void;
};

export type ChartViewElement = HTMLElement & {
  readonly dispose?: () => void;
};

export const createChartView = (props: ChartViewProps): ChartViewElement => {
  const {
    activePlotType = "iv",
    calculatedDataByKey,
    cleanedData = [],
    processingStatus,
    activeFileId: controlledActiveFileId = undefined,
  } = props;
  const visiblePanes = normalizeVisiblePanes(props.visiblePanes);
  const root = document.createElement("section") as ChartViewElement;
  root.className = "chart_view";
  root.setAttribute("aria-label", localize("analysis.visualization", "Analysis & Visualization"));

  if (!cleanedData.length) {
    root.append(createEmptyView({
      hint: processingStatus?.state === "processing"
        ? localize("analysis_processing_hint", "Extracting and preparing chart data, please wait.")
        : localize("analysis.empty.hint", "Apply a template to generate chart data."),
      title: processingStatus?.state === "processing"
        ? localize("analysis_processing", "Processing analysis data...")
        : localize("analysis.empty.title", "No analysis data"),
    }));
    return root;
  }

  const calculatedData = getCalculatedData(
    calculatedDataByKey,
    activePlotType,
    controlledActiveFileId,
  );
  if (!calculatedData) {
    root.append(createEmptyView({
      hint: localize("analysis_calculation_hint", "Preparing chart calculations, please wait."),
      title: localize("analysis_calculation", "Calculating chart data..."),
    }));
    return root;
  }

  const filteredData = filterCalculatedDataSeries(calculatedData, props.hiddenLegendKeys ?? []);

  const chartPlotView = createMainPlotView({
    model: filteredData,
    originOpenPlotOptions: props.originOpenPlotOptions,
    plotAxisSettings: props.plotAxisSettings,
    plotType: activePlotType,
  });
  const inspectorPlotView = createMainPlotView({
    model: createSecondCalculatedData(filteredData),
    originOpenPlotOptions: props.originOpenPlotOptions,
    plotAxisSettings: props.plotAxisSettings,
    plotType: activePlotType,
  });

  const chartHost = document.createElement("div");
  chartHost.className = "chart_view_host";
  chartHost.append(chartPlotView.element);

  const inspectorHost = document.createElement("div");
  inspectorHost.className = "chart_view_host";
  inspectorHost.append(inspectorPlotView.element);

  const main = document.createElement("div");
  main.className = "chart_view_main";
  main.dataset.paneCount = String(visiblePanes.length);

  const mainPane = document.createElement("div");
  mainPane.className = "chart_view_main_pane";
  mainPane.append(chartHost);

  const inspectorPane = document.createElement("div");
  inspectorPane.className = "chart_view_main_pane chart_view_inspector_pane";
  inspectorPane.append(inspectorHost);

  if (visiblePanes.includes("chart")) {
    main.append(mainPane);
  }
  if (visiblePanes.includes("inspector")) {
    main.append(inspectorPane);
  }
  root.append(main);
  Object.defineProperty(root, "dispose", {
    value: (): void => {
      chartPlotView.dispose();
      inspectorPlotView.dispose();
      root.replaceChildren();
    },
  });

  return root;
};

const normalizeVisiblePanes = (
  visiblePanes: readonly ChartPane[] | undefined,
): readonly ChartPane[] => {
  if (!visiblePanes?.length) {
    return ["chart", "inspector"];
  }

  const next: ChartPane[] = [];
  for (const pane of visiblePanes) {
    if (!next.includes(pane)) {
      next.push(pane);
    }
  }
  return next.length ? next : ["chart"];
};

const ChartView = (props: ChartViewProps): ChartViewElement =>
  createChartView(props);

export default ChartView;
