/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

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
import type { ProcessingStatus } from "src/cs/workbench/services/session/common/sessionTypes";
import type { ChartViewInput } from "src/cs/workbench/services/chart/common/chartViewInput";
import { createChartView, type ChartPane } from "src/cs/workbench/contrib/chart/browser/views/chartView";

export class AnalysisPanel {
  public readonly element: HTMLElement;
  private content: DisposableContent | null = null;

  constructor(props: ChartViewInput) {
    this.element = document.createElement("section");
    this.element.className = "chart_panel";
    this.update(props);
  }

  public update(props: ChartViewInput): void {
    this.element.setAttribute("aria-label", localize("analysis_visualization", "Analysis & Visualization"));
    disposeContent(this.content);
    this.content = createAnalysisPanelContent(props);
    this.element.replaceChildren(this.content);
  }

  public dispose(): void {
    disposeContent(this.content);
    this.content = null;
    this.element.replaceChildren();
    this.element.remove();
  }

  public editAxisTitle(pane: ChartPane, axis: "x" | "y"): boolean {
    return this.content?.editAxisTitle?.(pane, axis) ?? false;
  }
}

type DisposableContent = HTMLElement & {
  readonly dispose?: () => void;
  readonly editAxisTitle?: (pane: ChartPane, axis: "x" | "y") => boolean;
};

const disposeContent = (content: DisposableContent | null): void => {
  content?.dispose?.();
};

const createAnalysisPanelContent = (props: ChartViewInput): DisposableContent => {
  const {
    hasAnalysisData = false,
    processingStatus,
    shouldMountCharts = false,
  } = props;

  if (hasAnalysisData) {
    if (shouldMountCharts) {
      return createAnalysisStatusCard({
        id: "analysis-analysis-loading-card",
        iconClassName: "status-icon--muted status-icon--pulse",
        message: localize("analysis_loading", "Loading analysis charts..."),
        hint: localize("analysis_loading_hint", "Preparing visualization modules, please wait."),
      });
    }

    return createChartView({
      ...props,
    });
  }

  if (processingStatus?.state === "processing") {
    return createProcessingCard(processingStatus);
  }

  return createChartView({
    ...props,
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
    iconClassName: "status-icon--muted status-icon--pulse",
    message: localize("analysis_processing", "Processing analysis data..."),
    hint: localize("analysis_processing_hint", "Extracting and preparing chart data, please wait."),
  });

  const progress = document.createElement("div");
  progress.className = "processing-progress";

  const labelRow = document.createElement("div");
  labelRow.className =
    "processing-progress-label";

  const processedLabel = document.createElement("span");
  processedLabel.textContent = localize("analysis_processing_progress", "{processed}/{total} files processed", {
    processed,
    total: processingStatus.total ?? 0,
  });

  const percentLabel = document.createElement("span");
  percentLabel.textContent = `${percent}%`;
  labelRow.append(processedLabel, percentLabel);

  const track = document.createElement("div");
  track.className = "processing-progress-track";

  const bar = document.createElement("div");
  bar.className = "processing-progress-bar";
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
    className: "status-card",
  });
  card.append(
    createLocalLxIcon({
      icon: LxIcon.analysis,
      size: 48,
      className: `status-icon ${iconClassName}`,
    }),
    createText("p", "status-message", message),
    createText("p", "status-hint", hint),
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
