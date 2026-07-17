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

export const SHOW_ORIGIN_EXPORT_SETTINGS_COMMAND_ID = "workbench.action.showOriginSettings";

export const registerOriginCommands = (): IDisposable => {
	const disposables = new DisposableStore();

	disposables.add(registerAction2(class ShowOriginExportSettingsAction extends Action2 {
		public constructor() {
			super({
				category: localize("origin.commands.category", "Origin"),
				f1: true,
				id: SHOW_ORIGIN_EXPORT_SETTINGS_COMMAND_ID,
				title: localize("origin.commands.showExportSettings", "Show Origin Settings"),
				metadata: {
					description: localize("origin.commands.showExportSettings", "Show Origin Settings"),
				},
			});
		}

		public run(accessor: ServicesAccessor): void {
			const layoutService = accessor.get(IWorkbenchLayoutService);
			void accessor.get(IViewsService).openViewContainer(
				ChartViewContainerId,
			);
			layoutService.selectAuxiliaryBarView("settings");
		}
	}));
	disposables.add(MenuRegistry.appendMenuItem(MenuId.AuxiliaryBarTitle, {
		command: {
			id: SHOW_ORIGIN_EXPORT_SETTINGS_COMMAND_ID,
			title: localize("origin.curveSettings.title", "Origin Settings"),
			icon: LxIcon.settings,
			toggled: ActiveAuxiliaryBarViewContext.isEqualTo("settings"),
		},
		group: "navigation",
		order: 30,
		when: ActivePanelViewContainerContext.isEqualTo(ChartViewContainerId),
	}));

	return disposables;
};
