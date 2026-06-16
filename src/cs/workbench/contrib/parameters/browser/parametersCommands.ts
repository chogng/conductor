/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { Action2, registerAction2 } from "src/cs/platform/actions/common/actions";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import { IWorkbenchLayoutService } from "src/cs/workbench/services/layout/browser/layoutService";
import { ParametersCommandId } from "src/cs/workbench/services/parameters/common/parameters";

export const registerParametersCommands = (): IDisposable => {
	const disposables = new DisposableStore();

	disposables.add(registerAction2(class ShowParametersAction extends Action2 {
		public constructor() {
			super({
				category: localize("parameters.commands.category", "Parameters"),
				f1: true,
				id: ParametersCommandId.showParameters,
				title: localize("parameters.commands.showParameters", "Show Parameters"),
				metadata: {
					description: localize("parameters.commands.showParameters", "Show Parameters"),
				},
			});
		}

		public run(accessor: ServicesAccessor): void {
			const layoutService = accessor.get(IWorkbenchLayoutService);
			layoutService.navigateToView("chart");
			layoutService.selectAuxiliaryBarView("parameters");
		}
	}));

	return disposables;
};
