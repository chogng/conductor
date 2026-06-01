import AnalysisPanel, {
  type AnalysisPanelProps,
} from "src/cs/workbench/contrib/chartPreview/browser/analysisPanel";

import "src/cs/workbench/contrib/chartPreview/browser/media/chartPreview.css";

export class ChartPreviewViewPane {
  public readonly element: HTMLElement;
  private readonly analysisPanel: AnalysisPanel;

  constructor(props: AnalysisPanelProps) {
    this.element = document.createElement("div");
    this.element.className = "chart_preview_view_pane da_page_scroll";
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
