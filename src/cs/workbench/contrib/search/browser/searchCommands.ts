/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { Action2, registerAction2 } from "src/cs/platform/actions/common/actions";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import { SearchCommandId } from "src/cs/workbench/services/search/common/search";
import { IWorkbenchLayoutService } from "src/cs/workbench/services/layout/browser/layoutService";
import { IViewsService } from "src/cs/workbench/services/views/common/viewsService";
import { ChartViewContainerId } from "src/cs/workbench/services/chart/common/chart";

export const registerSearchCommands = (): IDisposable => {
	const disposables = new DisposableStore();

	disposables.add(registerAction2(class ShowSearchAction extends Action2 {
		public constructor() {
			super({
				category: localize("search.commands.category", "Search"),
				f1: true,
				id: SearchCommandId.showSearch,
				title: localize("search.commands.showSearch", "Show Search"),
				metadata: {
					description: localize("search.commands.showSearch", "Show Search"),
				},
			});
		}

		public run(accessor: ServicesAccessor): void {
			showChartAuxiliaryView(accessor, "search");
		}
	}));

	return disposables;
};

const showChartAuxiliaryView = (
	accessor: ServicesAccessor,
	view: string,
): void => {
	const layoutService = accessor.get(IWorkbenchLayoutService);
	void accessor.get(IViewsService).openViewContainer(
		ChartViewContainerId,
	);
	layoutService.selectAuxiliaryBarView(view);
};
