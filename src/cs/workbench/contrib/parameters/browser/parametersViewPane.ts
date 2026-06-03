import { Disposable, toDisposable } from "src/cs/base/common/lifecycle";

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

import "src/cs/workbench/contrib/parameters/browser/media/parametersView.css";

export class ParametersViewPane extends Disposable {
  constructor(private readonly container: HTMLElement) {
    super();
    this._register(toDisposable(() => {
      this.container.textContent = "";
    }));
  }

  renderParameters(options: ParametersViewOptions): void {
    renderParametersView(this.container, options);
  }

  renderRcSummary(options: {
    error: string;
    summary: RcAnalysisSummary | null;
  }): void {
    renderRcSummaryView(this.container, options);
  }

  renderRcCurveHeader(options: {
    series: RcCurveChartSeries[];
  }): void {
    renderRcCurveHeaderView(this.container, options);
  }

  renderRcCurveRows(options: {
    rows: RcCurveRow[];
  }): void {
    renderRcCurveRowsView(this.container, options);
  }
}
