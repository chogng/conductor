/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { CommandsRegistry } from "src/cs/platform/commands/common/commands";
import {
  EDIT_CHART_X_AXIS_TITLE_COMMAND_ID,
  EDIT_CHART_Y_AXIS_TITLE_COMMAND_ID,
  IChartService,
  type ChartAxis,
  type ChartAxisTitlePane,
  type IChartService as IChartServiceType,
} from "src/cs/workbench/services/chart/common/chart";

export const registerChartCommands = (): IDisposable => {
  const disposables = new DisposableStore();
  disposables.add(CommandsRegistry.registerCommand({
    id: EDIT_CHART_X_AXIS_TITLE_COMMAND_ID,
    handler: (accessor, pane?: unknown) =>
      editAxisTitle(accessor.get(IChartService), "x", pane),
    metadata: {
      description: localize("chart.commands.editXAxisTitle", "Edit chart X axis title"),
    },
  }));
  disposables.add(CommandsRegistry.registerCommand({
    id: EDIT_CHART_Y_AXIS_TITLE_COMMAND_ID,
    handler: (accessor, pane?: unknown) =>
      editAxisTitle(accessor.get(IChartService), "y", pane),
    metadata: {
      description: localize("chart.commands.editYAxisTitle", "Edit chart Y axis title"),
    },
  }));
  return disposables;
};

const editAxisTitle = (
  chartService: IChartServiceType,
  axis: ChartAxis,
  pane: unknown,
): boolean => {
  chartService.requestAxisTitleEdit({
    axis,
    pane: readPane(pane),
  });
  return true;
};

const readPane = (pane: unknown): ChartAxisTitlePane =>
  pane === "inspector" ? "inspector" : "chart";
