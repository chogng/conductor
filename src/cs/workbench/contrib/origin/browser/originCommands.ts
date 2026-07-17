/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { Action2, registerAction2 } from "src/cs/platform/actions/common/actions";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import { IViewsService } from "src/cs/workbench/services/views/common/viewsService";
import { OriginExportSettingsViewContainerId } from "src/cs/workbench/services/origin/common/origin";

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
			void accessor.get(IViewsService).openViewContainer(OriginExportSettingsViewContainerId);
		}
	}));

	return disposables;
};
