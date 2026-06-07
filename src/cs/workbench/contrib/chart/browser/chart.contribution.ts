import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { CommandsRegistry } from "src/cs/platform/commands/common/commands";
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from "src/cs/workbench/common/contributions";
import { ChartViewPane } from "src/cs/workbench/contrib/chart/browser/chartViewPane";
import {
  ChartContributionId,
  ChartViewId,
  EDIT_CHART_X_AXIS_TITLE_COMMAND_ID,
  EDIT_CHART_Y_AXIS_TITLE_COMMAND_ID,
} from "src/cs/workbench/contrib/chart/common/chart";
import { IViewsService, type IViewsService as IViewsServiceType } from "src/cs/workbench/services/views/common/viewsService";

type AxisTitlePane = "chart" | "inspector";

export class ChartContribution extends Disposable implements IWorkbenchContribution {
  public constructor(
    @IViewsService private readonly viewsService: IViewsServiceType,
  ) {
    super();

    this._register(CommandsRegistry.registerCommand({
      id: EDIT_CHART_X_AXIS_TITLE_COMMAND_ID,
      handler: (_accessor, pane?: unknown) => this.editAxisTitle("x", pane),
      metadata: {
        description: localize("chart.commands.editXAxisTitle", "Edit chart X axis title"),
      },
    }));
    this._register(CommandsRegistry.registerCommand({
      id: EDIT_CHART_Y_AXIS_TITLE_COMMAND_ID,
      handler: (_accessor, pane?: unknown) => this.editAxisTitle("y", pane),
      metadata: {
        description: localize("chart.commands.editYAxisTitle", "Edit chart Y axis title"),
      },
    }));
  }

  private editAxisTitle(axis: "x" | "y", pane: unknown): boolean {
    const chartPane = this.viewsService.getViewWithId<ChartViewPane>(ChartViewId);
    return chartPane?.editAxisTitle(this.readPane(pane), axis) ?? false;
  }

  private readPane(pane: unknown): AxisTitlePane {
    return pane === "inspector" ? "inspector" : "chart";
  }
}

registerWorkbenchContribution2(ChartContributionId, ChartContribution, WorkbenchPhase.AfterRestored);
