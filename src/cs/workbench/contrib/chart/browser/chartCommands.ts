/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { CommandsRegistry } from "src/cs/platform/commands/common/commands";
import {
  EDIT_CHART_X_AXIS_TITLE_COMMAND_ID,
  EDIT_CHART_Y_AXIS_TITLE_COMMAND_ID,
  type ChartAxis,
  type ChartAxisTitlePane,
} from "src/cs/workbench/services/chart/common/chart";
import {
  IChartTitleEditService,
} from "src/cs/workbench/contrib/chart/browser/chartTitleEditService";

export const registerChartCommands = (): IDisposable => {
  const disposables = new DisposableStore();
  disposables.add(CommandsRegistry.registerCommand({
    id: EDIT_CHART_X_AXIS_TITLE_COMMAND_ID,
    handler: (accessor, pane?: unknown) =>
      editAxisTitle(accessor.get(IChartTitleEditService), "x", pane),
    metadata: {
      description: localize("chart.commands.editXAxisTitle", "Edit chart X axis title"),
    },
  }));
  disposables.add(CommandsRegistry.registerCommand({
    id: EDIT_CHART_Y_AXIS_TITLE_COMMAND_ID,
    handler: (accessor, pane?: unknown) =>
      editAxisTitle(accessor.get(IChartTitleEditService), "y", pane),
    metadata: {
      description: localize("chart.commands.editYAxisTitle", "Edit chart Y axis title"),
    },
  }));
  return disposables;
};

const editAxisTitle = (
  chartTitleEditService: IChartTitleEditService,
  axis: ChartAxis,
  pane: unknown,
): boolean => {
  return chartTitleEditService.editAxisTitle({
    axis,
    pane: readPane(pane),
  });
};

const readPane = (pane: unknown): ChartAxisTitlePane =>
  pane === "inspector" ? "inspector" : "chart";
