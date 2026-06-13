/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { Action2, registerAction2 } from "src/cs/platform/actions/common/actions";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
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
  disposables.add(registerAction2(class EditChartXAxisTitleAction extends Action2 {
    public constructor() {
      super({
        category: localize("chart.commands.category", "Chart"),
        f1: true,
        id: EDIT_CHART_X_AXIS_TITLE_COMMAND_ID,
        title: localize("chart.commands.editXAxisTitle", "Edit chart X axis title"),
        metadata: {
          description: localize("chart.commands.editXAxisTitle", "Edit chart X axis title"),
        },
      });
    }

    public run(accessor: ServicesAccessor, pane?: unknown): boolean {
      return editAxisTitle(accessor.get(IChartTitleEditService), "x", pane);
    }
  }));
  disposables.add(registerAction2(class EditChartYAxisTitleAction extends Action2 {
    public constructor() {
      super({
        category: localize("chart.commands.category", "Chart"),
        f1: true,
        id: EDIT_CHART_Y_AXIS_TITLE_COMMAND_ID,
        title: localize("chart.commands.editYAxisTitle", "Edit chart Y axis title"),
        metadata: {
          description: localize("chart.commands.editYAxisTitle", "Edit chart Y axis title"),
        },
      });
    }

    public run(accessor: ServicesAccessor, pane?: unknown): boolean {
      return editAxisTitle(accessor.get(IChartTitleEditService), "y", pane);
    }
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
