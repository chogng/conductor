import AnalysisPanel, {
  type AnalysisPanelProps,
} from "src/cs/workbench/contrib/chartPreview/browser/analysisPanel";

export class ChartPreviewViewPane {
  public readonly element: HTMLElement;
  private readonly analysisPanel: AnalysisPanel;

  constructor(props: AnalysisPanelProps) {
    this.element = document.createElement("div");
    this.element.className =
      "da_page_scroll h-full min-h-0 overflow-hidden p-1 pt-0";
    this.analysisPanel = new AnalysisPanel(props);
    this.element.append(this.analysisPanel.element);
  }

  public update(props: AnalysisPanelProps): void {
    this.analysisPanel.update(props);
  }

  public dispose(): void {
    this.analysisPanel.dispose();
    this.element.remove();
  }
}

export default ChartPreviewViewPane;
