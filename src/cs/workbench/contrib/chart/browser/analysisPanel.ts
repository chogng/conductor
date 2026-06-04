import { localize } from "src/cs/nls";
import {
  getCardClassName,
  type CardVariant,
} from "cs/base/browser/ui/card/card";
import {
  getLxIconClassName,
  getLxIconMarkup,
  getLxIconStyle,
  type LxIconDefinition,
  type LxIconStyle,
} from "src/cs/base/browser/ui/lxicon/lxicon";
import { LxIcon } from "src/cs/base/common/lxicon";
import type {
  CleanedEntry,
  ProcessingStatus,
} from "src/cs/workbench/contrib/session/common/sessionTypes";
import type { OriginPlotOptions } from "src/cs/workbench/contrib/origin/common/originPlotOptions";
import type { PlotAxisSettings } from "src/cs/workbench/contrib/plot/common/plotAxisSettings";
import type { CalculatedDataByKey } from "src/cs/workbench/contrib/calculation/common/calculatedData";
import type {
  IonIoffManualTargetsByFileId,
  IonIoffMethod,
  SsManualRanges,
  SsMethod,
} from "src/cs/workbench/contrib/session/browser/sessionContext";
import type { PlotType } from "src/cs/workbench/contrib/plot/common/plot";
import { createChartView, type ChartPane } from "src/cs/workbench/contrib/chart/browser/views/chartView";

type StateSetter<T> = (next: T | ((previous: T) => T)) => void;

export type ChartViewLazyProps = {
  visiblePanes?: readonly ChartPane[];
  activePlotType?: PlotType;
  cleanedData: CleanedEntry[];
  calculatedDataByKey?: CalculatedDataByKey;
  processingStatus?: Partial<ProcessingStatus>;
  activeFileId?: string | null;
  ionIoffMethod?: IonIoffMethod;
  ionIoffManualTargetsByFileId?: IonIoffManualTargetsByFileId;
  onActiveFileIdChange?: (nextFileId: string | null) => void;
  showFileSelect?: boolean;
  setIonIoffMethod?: (next: IonIoffMethod) => void;
  setIonIoffManualTargetsByFileId?: StateSetter<IonIoffManualTargetsByFileId>;
  ssMethod?: SsMethod;
  setSsMethod?: (next: SsMethod) => void;
  ssDiagnosticsEnabled?: boolean;
  setSsDiagnosticsEnabled?: (next: boolean) => void;
  vthDiagnosticsEnabled?: boolean;
  setVthDiagnosticsEnabled?: (next: boolean) => void;
  gmDiagnosticsEnabled?: boolean;
  setGmDiagnosticsEnabled?: (next: boolean) => void;
  ssShowFitLine?: boolean;
  setSsShowFitLine?: (next: boolean) => void;
  ssManualRanges?: SsManualRanges;
  setSsManualRanges?: (next: SsManualRanges) => void;
  originOpenPlotOptions?: OriginPlotOptions;
  onOriginOpenPlotOptionsChange?: (updates: unknown) => Promise<unknown> | void;
  plotAxisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
  onPlotAxisSettingsChange?: (updates: unknown) => Promise<unknown> | void;
};

export type AnalysisPanelProps = ChartViewLazyProps & {
  shouldMountCharts?: boolean;
};

export class AnalysisPanel {
  public readonly element: HTMLElement;

  constructor(props: AnalysisPanelProps) {
    this.element = document.createElement("section");
    this.element.className = "chart_panel";
    this.update(props);
  }

  public update(props: AnalysisPanelProps): void {
    this.element.setAttribute("aria-label", localize("analysis_visualization", "Analysis & Visualization"));
    this.element.replaceChildren(createAnalysisPanelContent(props));
  }

  public dispose(): void {
    this.element.replaceChildren();
    this.element.remove();
  }
}

const createAnalysisPanelContent = (props: AnalysisPanelProps): HTMLElement => {
  const {
    cleanedData = [],
    processingStatus,
    shouldMountCharts = false,
  } = props;

  if (cleanedData.length > 0) {
    if (shouldMountCharts) {
      return createAnalysisStatusCard({
        id: "analysis-analysis-loading-card",
        iconClassName: "analysis_status_icon--muted analysis_status_icon--pulse",
        message: localize("analysis_loading", "Loading analysis charts..."),
        hint: localize("analysis_loading_hint", "Preparing visualization modules, please wait."),
      });
    }

    return createChartView({
      ...props,
      cleanedData,
    });
  }

  if (processingStatus?.state === "processing") {
    return createProcessingCard(processingStatus);
  }

  return createChartView({
    ...props,
    cleanedData,
  });
};

const createProcessingCard = (
  processingStatus: Partial<ProcessingStatus>,
): HTMLElement => {
  const processed = processingStatus.processed ?? 0;
  const total = Math.max(1, processingStatus.total ?? 0);
  const percent = Math.min(100, Math.round((processed / total) * 100));
  const card = createAnalysisStatusCard({
    id: "analysis-processing-card",
    iconClassName: "analysis_status_icon--muted analysis_status_icon--pulse",
    message: localize("analysis_processing", "Processing analysis data..."),
    hint: localize("analysis_processing_hint", "Extracting and preparing chart data, please wait."),
  });

  const progress = document.createElement("div");
  progress.className = "analysis_processing_progress";

  const labelRow = document.createElement("div");
  labelRow.className =
    "analysis_processing_progress_label";

  const processedLabel = document.createElement("span");
  processedLabel.textContent = localize("analysis_processing_progress", "{processed}/{total} files processed", {
    processed,
    total: processingStatus.total ?? 0,
  });

  const percentLabel = document.createElement("span");
  percentLabel.textContent = `${percent}%`;
  labelRow.append(processedLabel, percentLabel);

  const track = document.createElement("div");
  track.className = "analysis_processing_progress_track";

  const bar = document.createElement("div");
  bar.className = "analysis_processing_progress_bar";
  bar.style.width = `${percent}%`;
  track.append(bar);
  progress.append(labelRow, track);
  card.append(progress);
  return card;
};

const createAnalysisStatusCard = ({
  hint,
  iconClassName,
  id,
  message,
}: {
  readonly hint: string;
  readonly iconClassName: string;
  readonly id: string;
  readonly message: string;
}): HTMLElement => {
  const card = createLocalCard({
    id,
    variant: "fill",
    className: "analysis_status_card",
  });
  card.append(
    createLocalLxIcon({
      icon: LxIcon.analysis,
      size: 48,
      className: `analysis_status_icon ${iconClassName}`,
    }),
    createText("p", "analysis_status_message", message),
    createText("p", "analysis_status_hint", hint),
  );
  return card;
};

const createLocalLxIcon = ({
  className,
  icon,
  size = 16,
  style,
}: {
  readonly className?: string;
  readonly icon: LxIconDefinition;
  readonly size?: number | string;
  readonly style?: LxIconStyle;
}): HTMLSpanElement => {
  const element = document.createElement("span");
  element.className = getLxIconClassName(className);
  Object.assign(element.style, getLxIconStyle({ size, style }));
  element.innerHTML = getLxIconMarkup(icon);
  return element;
};

const createLocalCard = ({
  className = "",
  id,
  variant = "default",
}: {
  readonly className?: string;
  readonly id?: string;
  readonly variant?: CardVariant;
}): HTMLDivElement => {
  const card = document.createElement("div");
  if (id) {
    card.id = id;
  }
  card.className = getCardClassName({ className, variant });
  return card;
};

const createText = (
  tagName: "p",
  className: string,
  text: string,
): HTMLParagraphElement => {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
};

export default AnalysisPanel;
