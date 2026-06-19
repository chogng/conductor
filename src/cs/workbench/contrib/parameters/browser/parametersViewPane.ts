/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { ActionBar } from "src/cs/base/browser/ui/actionbar/actionbar";
import { ActionViewItem, type IActionViewItemOptions } from "src/cs/base/browser/ui/actionbar/actionViewItem";
import { replaceChildrenIfChanged } from "src/cs/base/browser/dom";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import { Action, type IAction } from "src/cs/base/common/actions";
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
  type RcCalculationSummary,
  type RcCurveRow,
} from "src/cs/workbench/contrib/parameters/browser/rcCalculationView";
import type { RcCurveChartSeries } from "src/cs/workbench/contrib/parameters/browser/rcCalculationModel";
import {
  IParametersService,
  ParametersViewId,
} from "src/cs/workbench/services/parameters/common/parameters";
import {
  INotificationService,
  Severity,
} from "src/cs/workbench/services/notification/common/notificationService";

import "src/cs/workbench/contrib/parameters/browser/media/parametersView.css";
import "src/cs/workbench/browser/parts/views/media/views.css";

const COPY_TABLE_ACTION_ID = "parameters.copyTable";

export class ParametersViewPane extends ViewPane {
  private readonly shellStore = new DisposableStore();
  private readonly renderStore = new DisposableStore();
  private readonly pane = document.createElement("div");
  private readonly view = document.createElement("div");
  private readonly content = document.createElement("div");
  private readonly emptyRoot = document.createElement("div");
  private readonly tableRoot = document.createElement("div");
  private readonly tableToolbar = document.createElement("div");
  private readonly tableTitle = document.createElement("div");
  private readonly tableScroll = document.createElement("div");
  private readonly copyAction = this.shellStore.add(new Action(
    COPY_TABLE_ACTION_ID,
    localize("parameters.copyTable.label", "Copy table"),
    undefined,
    false,
    () => void this.copyCurrentParameterTable(),
  ));
  private readonly tableActionBar = this.shellStore.add(new ActionBar({
    ariaLabel: localize("parameters.table.actions", "Parameter table actions"),
    className: "parameters_table_actionbar",
    actionViewItemProvider: (action, itemOptions) =>
      action.id === COPY_TABLE_ACTION_ID
        ? new CopyTableActionViewItem(action, itemOptions)
        : undefined,
  }));
  private currentParametersOptions: ParametersViewOptions | null = null;
  private tableRenderSignature = "";

  constructor(
    @IParametersService private readonly parametersService: IParametersService,
    @INotificationService private readonly notificationService: INotificationService,
  ) {
    super({
      id: ParametersViewId,
      title: localize("chart.views.parameters", "Parameters"),
      className: "auxiliarybar_view_pane parameters_view_pane",
      bodyClassName: "workbench-part-view-pane__body",
    });
    this.pane.className = "parameters_pane";
    this.view.className = "parameters_view";
    this.content.className = "parameters_view_content";
    this.emptyRoot.className = "workbench-view-pane__empty";
    this.tableRoot.className = "parameters_table_layout";
    this.tableToolbar.className = "parameters_table_toolbar";
    this.tableToolbar.setAttribute("role", "toolbar");
    this.tableToolbar.setAttribute("aria-label", localize("parameters.toolbar.ariaLabel", "Parameter table"));
    this.tableTitle.className = "parameters_table_toolbar_title";
    this.tableTitle.textContent = localize("chart.views.parameters", "Parameters");
    this.copyAction.tooltip = localize("parameters.copyTable.label", "Copy table");
    this.tableActionBar.push(this.copyAction);
    this.tableToolbar.append(this.tableTitle, this.tableActionBar.domNode);
    this.tableScroll.className = "parameters_table_scroll";
    this.tableRoot.append(this.tableToolbar, this.tableScroll);
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
    this.currentParametersOptions = options;
    this.copyAction.enabled = options.rows.length > 0;

    const nextSignature = createParametersTableRenderSignature(options);
    if (this.tableRenderSignature !== nextSignature) {
      renderParametersView(this.tableScroll, options);
      this.tableRenderSignature = nextSignature;
    }

    replaceChildrenIfChanged(this.content, this.tableRoot);
  }

  renderEmpty(message: string): void {
    this.renderStore.clear();
    this.currentParametersOptions = null;
    this.copyAction.enabled = false;
    this.tableRenderSignature = "";
    if (this.emptyRoot.textContent !== message) {
      this.emptyRoot.textContent = message;
    }
    replaceChildrenIfChanged(this.content, this.emptyRoot);
  }

  renderRcSummary(options: {
    error: string;
    summary: RcCalculationSummary | null;
  }): void {
    this.renderStore.clear();
    this.clearParametersTableState();
    renderRcSummaryView(this.content, options);
  }

  renderRcCurveHeader(options: {
    series: RcCurveChartSeries[];
  }): void {
    this.renderStore.clear();
    this.clearParametersTableState();
    renderRcCurveHeaderView(this.content, options);
  }

  renderRcCurveRows(options: {
    rows: RcCurveRow[];
  }): void {
    this.renderStore.clear();
    this.clearParametersTableState();
    renderRcCurveRowsView(this.content, options);
  }

  public override dispose(): void {
    this.renderStore.dispose();
    this.shellStore.dispose();
    this.currentParametersOptions = null;
    this.content.replaceChildren();
    this.pane.remove();
    super.dispose();
  }

  private clearParametersTableState(): void {
    this.currentParametersOptions = null;
    this.copyAction.enabled = false;
    this.tableRenderSignature = "";
  }

  private async copyCurrentParameterTable(): Promise<void> {
    if (this.currentParametersOptions) {
      await this.copyParameterTable(this.currentParametersOptions);
      return;
    }

    this.notificationService.notify({
      id: "parameters.copyTable",
      message: localize("parameters.copyTable.empty", "No parameter rows to copy."),
      severity: Severity.Warning,
    });
  }

  private async copyParameterTable(options: ParametersViewOptions): Promise<void> {
    if (options.rows.length === 0) {
      this.notificationService.notify({
        id: "parameters.copyTable",
        message: localize("parameters.copyTable.empty", "No parameter rows to copy."),
        severity: Severity.Warning,
      });
      return;
    }

    try {
      await writeClipboardText(createParameterTableTsv(options));
      this.notificationService.notify({
        id: "parameters.copyTable",
        message: localize("parameters.copyTable.success", "Parameter table copied."),
        presentation: { type: "success" },
        severity: Severity.Info,
      });
    } catch (error) {
      this.notificationService.notify({
        id: "parameters.copyTable",
        message: localize("parameters.copyTable.failed", "Failed to copy parameter table: {error}", {
          error: error instanceof Error ? error.message : String(error),
        }),
        severity: Severity.Error,
      });
    }
  }
}

const createParametersTableRenderSignature = (
  options: ParametersViewOptions,
): string => {
  const parts = [
    options.gmMetricHeader,
    options.showTransferMetrics ? "transfer" : "output",
    String(options.rows.length),
  ];
  for (const row of options.rows) {
    parts.push(
      String(row.id ?? ""),
      String(row.legendHeader ?? ""),
      row.name,
      String(row.isPending ?? false),
      String(row.currentMethod ?? ""),
      String(row.ion ?? ""),
      String(row.xAtIon ?? ""),
      String(row.ioff ?? ""),
      String(row.xAtIoff ?? ""),
      String(row.ionIoff ?? ""),
      String(row.gmMaxAbs ?? ""),
      String(row.xAtGmMaxAbs ?? ""),
      String(row.thresholdVoltage ?? ""),
      String(row.thresholdVoltageElectron ?? ""),
      String(row.thresholdVoltageHole ?? ""),
      String(row.ss ?? ""),
      String(row.ssConfidence ?? ""),
      String(row.xAtSs ?? ""),
      String(row.jon ?? ""),
    );
    if (options.showTransferMetrics && !row.isPending) {
      parts.push(
        String(options.buildCurrentTooltip?.("ion", row) ?? ""),
        String(options.buildCurrentTooltip?.("ioff", row) ?? ""),
        String(options.buildCurrentTooltip?.("ratio", row) ?? ""),
        String(options.buildSsTooltip?.(row) ?? ""),
      );
    }
  }
  return parts.join("\u001f");
};

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
      throw new Error(localize("parameters.copyTable.failedFallback", "Clipboard copy command failed."));
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
