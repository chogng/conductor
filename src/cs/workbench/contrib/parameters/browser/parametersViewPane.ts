/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { ActionBar } from "src/cs/base/browser/ui/actionbar/actionbar";
import { ActionViewItem, type IActionViewItemOptions } from "src/cs/base/browser/ui/actionbar/actionViewItem";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import { toAction, type IAction } from "src/cs/base/common/actions";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { LxIcon } from "src/cs/base/common/lxicon";
import { localize } from "src/cs/nls";
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";

import { createParameterTableTsv } from "src/cs/workbench/contrib/parameters/browser/parameterTableCopy";
import {
  renderParametersView,
  type ParametersViewOptions,
} from "src/cs/workbench/contrib/parameters/browser/parametersView";
import type { ParametersViewState } from "src/cs/workbench/services/parameters/common/parameterModel";
import {
  renderRcCurveHeaderView,
  renderRcCurveRowsView,
  renderRcSummaryView,
  type RcAnalysisSummary,
  type RcCurveRow,
} from "src/cs/workbench/contrib/parameters/browser/rcAnalysisView";
import type { RcCurveChartSeries } from "src/cs/workbench/contrib/parameters/browser/rcAnalysisModel";
import {
  IParametersService,
  ParametersViewId,
  type IParametersService as IParametersServiceType,
} from "src/cs/workbench/services/parameters/common/parameters";
import { notificationService } from "src/cs/workbench/services/notification/common/notificationService";

import "src/cs/workbench/contrib/parameters/browser/media/parametersView.css";
import "src/cs/workbench/browser/parts/views/media/views.css";

const COPY_TABLE_ACTION_ID = "parameters.copyTable";

export class ParametersViewPane extends ViewPane {
  private readonly renderStore = new DisposableStore();
  private readonly pane = document.createElement("div");
  private readonly view = document.createElement("div");
  private readonly content = document.createElement("div");

  constructor(
    @IParametersService private readonly parametersService: IParametersServiceType,
  ) {
    super({
      id: ParametersViewId,
      title: localize("analysis_views_parameters", "Parameters"),
      className: "auxiliarybar_view_pane parameters_view_pane",
      bodyClassName: "workbench-part-view-pane__body",
    });
    this.pane.className = "parameters_pane";
    this.view.className = "parameters_view";
    this.content.className = "parameters_view_content";
    this.view.append(this.content);
    this.pane.append(this.view);
    this.body.append(this.pane);
    this._register(this.parametersService.onDidChangeParametersViewState(state => {
      this.renderViewState(state);
    }));
    this.renderViewState(this.parametersService.getViewState());
  }

  private renderViewState(state: ParametersViewState): void {
    if (state.kind === "empty") {
      this.renderEmpty(state.message);
      return;
    }

    this.renderParameters(state);
  }

  renderParameters(options: ParametersViewOptions): void {
    this.renderStore.clear();

    const root = document.createElement("div");
    root.className = "parameters_table_layout";

    const toolbar = document.createElement("div");
    toolbar.className = "parameters_table_toolbar";
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", localize("parameters_toolbar_aria_label", "Parameter table"));

    const title = document.createElement("div");
    title.className = "parameters_table_toolbar_title";
    title.textContent = localize("analysis_views_parameters", "Parameters");

    const actionBar = this.renderStore.add(new ActionBar({
      ariaLabel: localize("parameters_table_actions", "Parameter table actions"),
      className: "parameters_table_actionbar",
      actionViewItemProvider: (action, itemOptions) =>
        action.id === COPY_TABLE_ACTION_ID
          ? new CopyTableActionViewItem(action, itemOptions)
          : undefined,
    }));
    actionBar.push(toAction({
      id: COPY_TABLE_ACTION_ID,
      label: localize("parameters_copy_table", "Copy table"),
      tooltip: localize("parameters_copy_table", "Copy table"),
      enabled: options.rows.length > 0,
      run: () => void this.copyParameterTable(options),
    }));

    toolbar.append(title, actionBar.domNode);

    const tableHost = document.createElement("div");
    tableHost.className = "parameters_table_scroll";
    renderParametersView(tableHost, options);

    root.append(toolbar, tableHost);
    this.content.replaceChildren(root);
  }

  renderEmpty(message: string): void {
    this.renderStore.clear();
    const root = document.createElement("div");
    root.className = "workbench-view-pane__empty";
    root.textContent = message;
    this.content.replaceChildren(root);
  }

  renderRcSummary(options: {
    error: string;
    summary: RcAnalysisSummary | null;
  }): void {
    this.renderStore.clear();
    renderRcSummaryView(this.content, options);
  }

  renderRcCurveHeader(options: {
    series: RcCurveChartSeries[];
  }): void {
    this.renderStore.clear();
    renderRcCurveHeaderView(this.content, options);
  }

  renderRcCurveRows(options: {
    rows: RcCurveRow[];
  }): void {
    this.renderStore.clear();
    renderRcCurveRowsView(this.content, options);
  }

  public override dispose(): void {
    this.renderStore.dispose();
    this.content.replaceChildren();
    this.pane.remove();
    super.dispose();
  }

  private async copyParameterTable(options: ParametersViewOptions): Promise<void> {
    if (options.rows.length === 0) {
      notificationService.showToast({
        id: "parameters.copyTable",
        message: localize("parameters_copy_table_empty", "No parameter rows to copy."),
        type: "warning",
      });
      return;
    }

    try {
      await writeClipboardText(createParameterTableTsv(options));
      notificationService.showToast({
        id: "parameters.copyTable",
        message: localize("parameters_copy_table_success", "Parameter table copied."),
        type: "success",
      });
    } catch (error) {
      notificationService.showToast({
        id: "parameters.copyTable",
        message: localize("parameters_copy_table_failed", "Failed to copy parameter table: {error}", {
          error: error instanceof Error ? error.message : String(error),
        }),
        type: "error",
      });
    }
  }
}

const writeClipboardText = async (text: string): Promise<void> => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.className = "parameters_clipboard_textarea";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    if (!document.execCommand("copy")) {
      throw new Error(localize("parameters_copy_table_failed_fallback", "Clipboard copy command failed."));
    }
  } finally {
    textarea.remove();
  }
};

class CopyTableActionViewItem extends ActionViewItem {
  constructor(action: IAction, options: IActionViewItemOptions) {
    super(undefined, action, {
      ...options,
      className: "parameters_table_copy_action",
    });
  }

  protected override updateLabel(): void {
    if (!this.label) {
      return;
    }

    this.label.replaceChildren(createLxIcon({
      className: "parameters_table_copy_action_icon",
      icon: LxIcon.copy,
      size: 16,
    }));
  }
}
