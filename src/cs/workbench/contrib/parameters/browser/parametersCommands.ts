/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { Action2, registerAction2 } from "src/cs/platform/actions/common/actions";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import { IViewsService } from "src/cs/workbench/services/views/common/viewsService";
import { ParametersViewContainerId } from "src/cs/workbench/services/parameters/common/parameters";

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
			void accessor.get(IViewsService).openViewContainer(ParametersViewContainerId);
		}
	}));

	return disposables;
};
