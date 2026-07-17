/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { LxIcon } from "src/cs/base/common/lxicon";
import { localize } from "src/cs/nls";
import {
	Action2,
	MenuId,
	MenuRegistry,
	registerAction2,
} from "src/cs/platform/actions/common/actions";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import {
	ActiveAuxiliaryBarViewContext,
	ActivePanelViewContainerContext,
} from "src/cs/workbench/common/contextkeys";
import { IWorkbenchLayoutService } from "src/cs/workbench/services/layout/browser/layoutService";
import { IViewsService } from "src/cs/workbench/services/views/common/viewsService";
import { ChartViewContainerId } from "src/cs/workbench/services/chart/common/chart";

export const SHOW_PARAMETERS_COMMAND_ID = "workbench.action.showParameters";

export const registerParametersCommands = (): IDisposable => {
	const disposables = new DisposableStore();

	disposables.add(registerAction2(class ShowParametersAction extends Action2 {
		public constructor() {
			super({
				category: localize("parameters.commands.category", "Parameters"),
				f1: true,
				id: SHOW_PARAMETERS_COMMAND_ID,
				title: localize("parameters.commands.showParameters", "Show Parameters"),
				metadata: {
					description: localize("parameters.commands.showParameters", "Show Parameters"),
				},
			});
		}

		public run(accessor: ServicesAccessor): void {
			const layoutService = accessor.get(IWorkbenchLayoutService);
			void accessor.get(IViewsService).openViewContainer(
				ChartViewContainerId,
			);
			layoutService.selectAuxiliaryBarView("parameters");
		}
	}));
	disposables.add(MenuRegistry.appendMenuItem(MenuId.AuxiliaryBarTitle, {
		command: {
			id: SHOW_PARAMETERS_COMMAND_ID,
			title: localize("chart.views.parameters", "Parameters"),
			icon: LxIcon.parameters,
			toggled: ActiveAuxiliaryBarViewContext.isEqualTo("parameters"),
		},
		group: "navigation",
		order: 20,
		when: ActivePanelViewContainerContext.isEqualTo(ChartViewContainerId),
	}));

	return disposables;
};
