import AnalysisPanel, {
  type AnalysisPanelProps,
} from "src/cs/workbench/contrib/chart/browser/analysisPanel";
import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import { createButton } from "src/cs/base/browser/ui/button/button";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { createPreviewPart } from "src/cs/workbench/browser/parts/previewArea/previewPart";
import { ChartViewId } from "src/cs/workbench/contrib/chart/common/chart";
import type { ProcessedEntry } from "src/cs/workbench/contrib/session/common/sessionTypes";

import "src/cs/workbench/contrib/chart/browser/media/chart.css";

export class ChartViewPane {
  public readonly element: HTMLElement;
  private readonly header = document.createElement("div");
  private readonly headerTitle = document.createElement("div");
  private readonly headerActions = document.createElement("div");
  private readonly headerStore = new DisposableStore();
  private readonly content = document.createElement("div");
  private readonly analysisPanel: AnalysisPanel;

  constructor(props: AnalysisPanelProps) {
    this.analysisPanel = new AnalysisPanel(props);
    this.header.className = "chart_view_header";
    this.headerTitle.className = "chart_view_header_title";
    this.headerActions.className = "chart_view_header_actions";
    this.content.className = "chart_view_pane_content";
    this.header.append(this.headerTitle, this.headerActions);
    this.content.append(this.header, this.analysisPanel.element);
    this.element = createPreviewPart({
      id: ChartViewId,
      ariaLabel: localize("analysis.visualization", "Analysis & Visualization"),
      className: "chart_view_pane",
      children: this.content,
    });
    this.update(props);
  }

  public update(props: AnalysisPanelProps): void {
    this.renderHeader(props);
    this.analysisPanel.update(props);
  }

  public dispose(): void {
    this.headerStore.dispose();
    this.analysisPanel.dispose();
    this.content.replaceChildren();
    this.element.remove();
  }

  private renderHeader(props: AnalysisPanelProps): void {
    this.headerStore.clear();
    const activeFile = resolveActiveFile(props);
    this.headerTitle.replaceChildren(createHeaderTitle(props, activeFile));
    this.headerActions.replaceChildren();

    if (!activeFile) {
      return;
    }

    if (props.showFileSelect !== false) {
      this.headerActions.append(createFileSelect(props, activeFile, this.headerStore));
    }

    this.headerActions.append(createToolbarControls(props, this.headerStore));
  }
}

const resolveActiveFile = ({
  activeFileId,
  processedData = [],
}: AnalysisPanelProps): ProcessedEntry | null => {
  const normalizedActiveFileId = String(activeFileId ?? "").trim();
  return (
    processedData.find((file) => String(file?.fileId ?? "") === normalizedActiveFileId) ??
    processedData[0] ??
    null
  );
};

const createHeaderTitle = (
  props: AnalysisPanelProps,
  activeFile: ProcessedEntry | null,
): HTMLElement => {
  const root = document.createElement("div");
  root.className = "chart_view_title";

  const heading = document.createElement("h2");
  heading.className = "chart_view_heading";
  heading.textContent = activeFile
    ? String(activeFile.fileName ?? props.t("analysis.visualization")).replace(/\.csv$/i, "")
    : props.t("analysis.empty.title");

  const subtitle = document.createElement("p");
  subtitle.className = "chart_view_subtitle";
  subtitle.textContent = activeFile
    ? props.t("analysis.fileCount", { count: props.processedData.length })
    : props.t("analysis.empty.hint");

  root.append(heading, subtitle);
  return root;
};

const createFileSelect = (
  props: AnalysisPanelProps,
  activeFile: ProcessedEntry,
  store: DisposableStore,
): HTMLSelectElement => {
  const select = document.createElement("select");
  select.className = "chart_view_file_select dropdown-field dropdown-field--sm";
  select.value = String(activeFile.fileId ?? "");
  for (const file of props.processedData) {
    const fileId = String(file?.fileId ?? "");
    if (!fileId) {
      continue;
    }

    const option = document.createElement("option");
    option.value = fileId;
    option.textContent = String(file?.fileName ?? fileId).replace(/\.csv$/i, "");
    select.append(option);
  }
  store.add(addDisposableListener(select, EventType.CHANGE, () => {
    props.onActiveFileIdChange?.(select.value || null);
  }));
  return select;
};

const createToolbarControls = (
  props: AnalysisPanelProps,
  store: DisposableStore,
): HTMLElement => {
  const controls = document.createElement("div");
  controls.className = "chart_view_toolbar";

  const ionIoffMethod = props.ionIoffMethod ?? "auto";
  const ssMethod = props.ssMethod ?? "auto";
  const gmDiagnosticsEnabled = Boolean(props.gmDiagnosticsEnabled);
  const ssDiagnosticsEnabled = props.ssDiagnosticsEnabled ?? true;
  const vthDiagnosticsEnabled = Boolean(props.vthDiagnosticsEnabled);
  const ssShowFitLine = props.ssShowFitLine ?? true;

  const ionToggle = createButton({
    label: ionIoffMethod === "manual" ? props.t("analysis.ionIoffManual") : props.t("analysis.ionIoffAuto"),
    size: "sm",
    variant: "secondary",
  });
  store.add(addDisposableListener(ionToggle, EventType.CLICK, () => {
    props.setIonIoffMethod?.(ionIoffMethod === "manual" ? "auto" : "manual");
  }));

  const ssToggle = createButton({
    label: ssMethod === "manual" ? props.t("analysis.ssManual") : props.t("analysis.ssAuto"),
    size: "sm",
    variant: "secondary",
  });
  store.add(addDisposableListener(ssToggle, EventType.CLICK, () => {
    props.setSsMethod?.(ssMethod === "manual" ? "auto" : "manual");
  }));

  const gmToggle = createButton({
    label: props.t("analysis.gmDiagnostics"),
    size: "sm",
    variant: gmDiagnosticsEnabled ? "primary" : "secondary",
  });
  store.add(addDisposableListener(gmToggle, EventType.CLICK, () => {
    props.setGmDiagnosticsEnabled?.(!gmDiagnosticsEnabled);
  }));

  const ssDiagnosticsToggle = createButton({
    label: props.t("analysis.ssDiagnostics"),
    size: "sm",
    variant: ssDiagnosticsEnabled ? "primary" : "secondary",
  });
  store.add(addDisposableListener(ssDiagnosticsToggle, EventType.CLICK, () => {
    props.setSsDiagnosticsEnabled?.(!ssDiagnosticsEnabled);
  }));

  const vthToggle = createButton({
    label: props.t("analysis.vthDiagnostics"),
    size: "sm",
    variant: vthDiagnosticsEnabled ? "primary" : "secondary",
  });
  store.add(addDisposableListener(vthToggle, EventType.CLICK, () => {
    props.setVthDiagnosticsEnabled?.(!vthDiagnosticsEnabled);
  }));

  const ssFitToggle = createButton({
    label: props.t("analysis.ssShowFitLine"),
    size: "sm",
    variant: ssShowFitLine ? "primary" : "secondary",
  });
  store.add(addDisposableListener(ssFitToggle, EventType.CLICK, () => {
    props.setSsShowFitLine?.(!ssShowFitLine);
  }));

  controls.append(ionToggle, ssToggle, gmToggle, ssDiagnosticsToggle, vthToggle, ssFitToggle);
  return controls;
};

export default ChartViewPane;
