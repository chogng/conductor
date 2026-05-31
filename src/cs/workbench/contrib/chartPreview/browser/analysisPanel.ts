import { lxAnalysis } from "cogicon";
import {
  getCardClassName,
  getCardDataAttributes,
  type CardVariant,
} from "cs/base/browser/ui/card/card";
import {
  getCogIconClassName,
  getCogIconMarkup,
  getCogIconStyle,
  type CogIconRenderer,
  type CogIconStyle,
} from "src/cs/base/browser/ui/cogIcon/cogIcon";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import type {
  ProcessedEntry,
  ProcessingStatus,
} from "src/cs/workbench/common/deviceAnalysis/sharedTypes";
import type { OriginPlotOptions } from "src/cs/workbench/contrib/origin/common/originPlotOptions";
import type {
  IonIoffManualTargetsByFileId,
  IonIoffMethod,
  SsManualRanges,
  SsMethod,
} from "src/cs/workbench/contrib/session/analysis-session-context";

type StateSetter<T> = (next: T | ((previous: T) => T)) => void;

export type AnalysisChartsLazyProps = {
  processedData: ProcessedEntry[];
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
};

export type AnalysisPanelProps = AnalysisChartsLazyProps & {
  shouldMountCharts?: boolean;
  t: TranslateFn;
};

export class AnalysisPanel {
  public readonly element: HTMLElement;

  constructor(props: AnalysisPanelProps) {
    this.element = document.createElement("section");
    this.element.className = "h-full flex flex-col";
    this.update(props);
  }

  public update(props: AnalysisPanelProps): void {
    this.element.setAttribute("aria-label", props.t("da_analysis_visualization"));
    this.element.replaceChildren(createAnalysisPanelContent(props));
  }

  public dispose(): void {
    this.element.replaceChildren();
    this.element.remove();
  }
}

const createAnalysisPanelContent = ({
  processedData = [],
  processingStatus,
  shouldMountCharts = false,
  t,
}: AnalysisPanelProps): HTMLElement => {
  if (processedData.length > 0) {
    if (shouldMountCharts) {
      return createAnalysisStatusCard({
        id: "analysis-analysis-loading-card",
        iconClassName: "mb-4 opacity-20 animate-pulse",
        message: t("da_analysis_loading"),
        hint: t("da_analysis_loading_hint"),
        ctaCopy: "loading analysis charts",
      });
    }

    return document.createElement("div");
  }

  if (processingStatus?.state === "processing") {
    return createProcessingCard(t, processingStatus);
  }

  return createAnalysisStatusCard({
    id: "analysis-empty-processed-data-card",
    iconClassName: "mb-4 opacity-20",
    message: t("da_no_processed_data"),
    hint: t("da_no_processed_data_hint"),
    ctaCopy: "empty processed data",
  });
};

const createProcessingCard = (
  t: TranslateFn,
  processingStatus: Partial<ProcessingStatus>,
): HTMLElement => {
  const processed = processingStatus.processed ?? 0;
  const total = Math.max(1, processingStatus.total ?? 0);
  const percent = Math.min(100, Math.round((processed / total) * 100));
  const card = createAnalysisStatusCard({
    id: "analysis-processing-card",
    iconClassName: "mb-4 opacity-20 animate-pulse",
    message: t("da_analysis_processing"),
    hint: t("da_analysis_processing_hint"),
    ctaCopy: "processing analysis data",
  });

  const progress = document.createElement("div");
  progress.className = "mt-4 w-full max-w-sm";

  const labelRow = document.createElement("div");
  labelRow.className =
    "mb-2 flex items-center justify-between text-xs text-text-secondary";

  const processedLabel = document.createElement("span");
  processedLabel.textContent = t("da_analysis_processing_progress", {
    processed,
    total: processingStatus.total ?? 0,
  });

  const percentLabel = document.createElement("span");
  percentLabel.textContent = `${percent}%`;
  labelRow.append(processedLabel, percentLabel);

  const track = document.createElement("div");
  track.className = "h-2 overflow-hidden rounded-full bg-bg-page";

  const bar = document.createElement("div");
  bar.className = "h-full rounded-full bg-accent transition-[width] duration-200";
  bar.style.width = `${percent}%`;
  track.append(bar);
  progress.append(labelRow, track);
  card.append(progress);
  return card;
};

const createAnalysisStatusCard = ({
  ctaCopy,
  hint,
  iconClassName,
  id,
  message,
}: {
  readonly ctaCopy: string;
  readonly hint: string;
  readonly iconClassName: string;
  readonly id: string;
  readonly message: string;
}): HTMLElement => {
  const card = createLocalCard({
    id,
    variant: "fill",
    cta: "Device analysis",
    ctaPosition: "analysis",
    ctaCopy,
    className:
      "flex-1 flex flex-col items-center justify-center border-2 border-dashed border-border bg-bg-surface/50 text-text-secondary",
  });
  card.append(
    createLocalCogIcon({
      icon: lxAnalysis,
      size: 48,
      className: iconClassName,
    }),
    createText("p", "text-lg font-medium", message),
    createText("p", "text-sm", hint),
  );
  return card;
};

const createLocalCogIcon = ({
  className,
  icon,
  size = 16,
  style,
}: {
  readonly className?: string;
  readonly icon: CogIconRenderer;
  readonly size?: number | string;
  readonly style?: CogIconStyle;
}): HTMLSpanElement => {
  const element = document.createElement("span");
  element.className = getCogIconClassName(className);
  Object.assign(element.style, getCogIconStyle({ size, style }));
  element.innerHTML = getCogIconMarkup(icon);
  return element;
};

const createLocalCard = ({
  className = "",
  cta,
  ctaCopy,
  ctaPosition,
  id,
  variant = "default",
}: {
  readonly className?: string;
  readonly cta?: string;
  readonly ctaCopy?: string;
  readonly ctaPosition?: string;
  readonly id?: string;
  readonly variant?: CardVariant;
}): HTMLDivElement => {
  const card = document.createElement("div");
  if (id) {
    card.id = id;
  }
  Object.entries(getCardDataAttributes({ cta, ctaCopy, ctaPosition })).forEach(
    ([name, value]) => {
      if (value !== undefined) {
        card.setAttribute(name, String(value));
      }
    },
  );
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
