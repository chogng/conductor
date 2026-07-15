/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import {
  getCardClassName,
  type CardVariant,
} from "cs/base/browser/ui/card/card";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import { LxIcon } from "src/cs/base/common/lxicon";
import { createChartView, type ChartPane, type ChartViewProps } from "src/cs/workbench/contrib/chart/browser/views/chartView";

export class ChartPanel {
  public readonly element: HTMLElement;
  private content: DisposableContent | null = null;

  constructor(props: ChartViewProps) {
    this.element = document.createElement("section");
    this.element.className = "chart_panel";
    this.update(props);
  }

  public update(props: ChartViewProps): void {
    this.element.setAttribute("aria-label", localize("chart.title", "Chart"));
    const nextKind = getChartPanelContentKind(props);
    if (this.content?.contentKind === nextKind && this.content.update?.(props)) {
      return;
    }

    disposeContent(this.content);
    this.content = createChartPanelContent(props, nextKind);
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

  public getMainPlotOverlayHost(): HTMLElement | null {
    return this.content?.mainPlotOverlayHost ?? null;
  }
}

type DisposableContent = HTMLElement & {
  readonly contentKind: ChartPanelContentKind;
  readonly dispose?: () => void;
  readonly editAxisTitle?: (pane: ChartPane, axis: "x" | "y") => boolean;
  readonly mainPlotOverlayHost?: HTMLElement;
  readonly update?: (props: ChartViewProps) => boolean;
};

type ChartPanelContentKind = "chart-view" | "loading-card" | "processing-card";

const disposeContent = (content: DisposableContent | null): void => {
  content?.dispose?.();
};

const getChartPanelContentKind = (props: ChartViewProps): ChartPanelContentKind => {
  const {
    hasChartData = false,
    processingStatus,
    shouldMountCharts = false,
  } = props;

  if (hasChartData) {
    return shouldMountCharts ? "loading-card" : "chart-view";
  }

  if (isPendingChartTarget(props)) {
    return "chart-view";
  }

  return processingStatus?.state === "processing"
    ? "processing-card"
    : "chart-view";
};

const createChartPanelContent = (
  props: ChartViewProps,
  kind: ChartPanelContentKind,
): DisposableContent => {
  const {
    hasChartData = false,
    processingStatus,
    shouldMountCharts = false,
  } = props;

  if (hasChartData) {
    if (shouldMountCharts) {
      return withContentKind(createChartStatusCard({
        id: "chart-loading-card",
        iconClassName: "status-icon--muted status-icon--pulse",
        message: localize("chart.loading.title", "Loading charts..."),
        hint: localize("chart.loading.hint", "Preparing chart modules, please wait."),
      }), kind);
    }

    return withContentKind(createChartView({
      ...props,
    }), kind);
  }

  if (isPendingChartTarget(props)) {
    return withContentKind(createChartView({
      ...props,
    }), kind);
  }

  if (processingStatus?.state === "processing") {
    return withContentKind(createProcessingCard(processingStatus), kind);
  }

  return withContentKind(createChartView({
    ...props,
  }), kind);
};

const withContentKind = <T extends HTMLElement>(
  content: T,
  kind: ChartPanelContentKind,
): T & { readonly contentKind: ChartPanelContentKind } => {
  Object.defineProperty(content, "contentKind", {
    value: kind,
  });
  return content as T & { readonly contentKind: ChartPanelContentKind };
};

const isPendingChartTarget = (props: ChartViewProps): boolean =>
  Boolean(props.activeFileId) &&
  props.hasChartData !== true &&
  props.processingStatus?.state === "processing";

const createProcessingCard = (
  processingStatus: NonNullable<ChartViewProps["processingStatus"]>,
): HTMLElement => {
  const processed = processingStatus.processed ?? 0;
  const total = Math.max(1, processingStatus.total ?? 0);
  const percent = Math.min(100, Math.round((processed / total) * 100));
  const card = createChartStatusCard({
    id: "chart-processing-card",
    iconClassName: "status-icon--muted status-icon--pulse",
    message: localize("chart.processing.title", "Processing chart data..."),
    hint: localize("chart.processing.hint", "Extracting and preparing chart data, please wait."),
  });

  const progress = document.createElement("div");
  progress.className = "processing-progress";

  const labelRow = document.createElement("div");
  labelRow.className =
    "processing-progress-label";

  const processedLabel = document.createElement("span");
  processedLabel.textContent = localize("chart.processing.progress", "{processed}/{total} files processed", {
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

const createChartStatusCard = ({
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
    createLxIcon({
      icon: LxIcon.chart,
      size: 48,
      className: `status-icon ${iconClassName}`,
    }),
    createText("p", "status-message", message),
    createText("p", "status-hint", hint),
  );
  return card;
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

export default ChartPanel;
