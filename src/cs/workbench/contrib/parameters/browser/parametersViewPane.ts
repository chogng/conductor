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

export class ParametersView extends ViewPane {
  constructor() {
    super({
      id: ParametersViewId,
      title: localize("da_analysis_views_parameters", "Parameters"),
      className: "auxiliarybar_view_pane",
      bodyClassName: "workbench-part-view-pane__body auxiliarybar_view_body auxiliarybar_view_body--scroll",
      headerVisible: false,
    });
  }

  renderParameters(options: ParametersViewOptions): void {
    renderParametersView(this.body, options);
  }

  renderEmpty(message: string): void {
    const root = document.createElement("div");
    root.className = "auxiliarybar_view_empty";
    root.textContent = message;
    this.body.replaceChildren(root);
  }

  renderRcSummary(options: {
    error: string;
    summary: RcAnalysisSummary | null;
  }): void {
    renderRcSummaryView(this.body, options);
  }

  renderRcCurveHeader(options: {
    series: RcCurveChartSeries[];
  }): void {
    renderRcCurveHeaderView(this.body, options);
  }

  renderRcCurveRows(options: {
    rows: RcCurveRow[];
  }): void {
    renderRcCurveRowsView(this.body, options);
  }

  public override dispose(): void {
    this.body.replaceChildren();
    super.dispose();
  }
}
