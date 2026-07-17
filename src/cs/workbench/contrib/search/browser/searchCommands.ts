/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { Action2, registerAction2 } from "src/cs/platform/actions/common/actions";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import { IViewsService } from "src/cs/workbench/services/views/common/viewsService";
import { SearchViewContainerId } from "src/cs/workbench/services/search/common/search";

export const SHOW_SEARCH_COMMAND_ID = "workbench.action.showSearch";

export const registerSearchCommands = (): IDisposable => {
	const disposables = new DisposableStore();

	disposables.add(registerAction2(class ShowSearchAction extends Action2 {
		public constructor() {
			super({
				category: localize("search.commands.category", "Search"),
				f1: true,
				id: SHOW_SEARCH_COMMAND_ID,
				title: localize("search.commands.showSearch", "Show Search"),
				metadata: {
					description: localize("search.commands.showSearch", "Show Search"),
				},
			});
		}

		public run(accessor: ServicesAccessor): void {
			void accessor.get(IViewsService).openViewContainer(SearchViewContainerId);
		}
	}));

	return disposables;
};
