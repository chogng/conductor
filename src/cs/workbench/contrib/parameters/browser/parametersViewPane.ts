import { localize } from "src/cs/nls";
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";

import {
  renderParametersView,
  type ParametersViewOptions,
} from "src/cs/workbench/contrib/parameters/browser/parametersView";
import {
  renderRcCurveHeaderView,
  renderRcCurveRowsView,
  renderRcSummaryView,
  type RcAnalysisSummary,
  type RcCurveRow,
} from "src/cs/workbench/contrib/parameters/browser/rcAnalysisView";
import type { RcCurveChartSeries } from "src/cs/workbench/contrib/parameters/browser/rcAnalysisModel";
import { ParametersViewId } from "src/cs/workbench/contrib/parameters/common/parameters";

import "src/cs/workbench/contrib/parameters/browser/media/parametersView.css";
import "src/cs/workbench/browser/parts/views/media/views.css";

export class ParametersViewPane extends ViewPane {
  private readonly pane = document.createElement("div");
  private readonly view = document.createElement("div");
  private readonly content = document.createElement("div");

  constructor() {
    super({
      id: ParametersViewId,
      title: localize("analysis_views_parameters", "Parameters"),
      className: "auxiliarybar_view_pane parameters_view_pane",
      bodyClassName: "workbench-part-view-pane__body",
      headerVisible: false,
    });
    this.pane.className = "parameters_pane";
    this.view.className = "parameters_view";
    this.content.className = "parameters_view_content";
    this.view.append(this.content);
    this.pane.append(this.view);
    this.body.append(this.pane);
  }

  renderParameters(options: ParametersViewOptions): void {
    renderParametersView(this.content, options);
  }

  renderEmpty(message: string): void {
    const root = document.createElement("div");
    root.className = "workbench-view-pane__empty";
    root.textContent = message;
    this.content.replaceChildren(root);
  }

  renderRcSummary(options: {
    error: string;
    summary: RcAnalysisSummary | null;
  }): void {
    renderRcSummaryView(this.content, options);
  }

  renderRcCurveHeader(options: {
    series: RcCurveChartSeries[];
  }): void {
    renderRcCurveHeaderView(this.content, options);
  }

  renderRcCurveRows(options: {
    rows: RcCurveRow[];
  }): void {
    renderRcCurveRowsView(this.content, options);
  }

  public override dispose(): void {
    this.content.replaceChildren();
    this.pane.remove();
    super.dispose();
  }
}
