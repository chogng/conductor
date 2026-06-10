/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import {
	registerWorkbenchContribution2,
	WorkbenchPhase,
	type IWorkbenchContribution,
} from "src/cs/workbench/common/contributions";
import {
	ILifecycleService,
	WillShutdownJoinerOrder,
	type ILifecycleService as ILifecycleServiceType,
} from "src/cs/workbench/services/lifecycle/common/lifecycle";
import {
	ITableBackendService,
	type ITableBackendService as ITableBackendServiceType,
} from "src/cs/workbench/services/table/common/table";
import { localize } from "src/cs/nls";

const TablePreviewLifecycleContributionId = "workbench.contrib.tablePreviewLifecycle";

export class TablePreviewLifecycleContribution extends Disposable implements IWorkbenchContribution {
	public constructor(
		@ITableBackendService private readonly tableBackendService: ITableBackendServiceType,
		@ILifecycleService lifecycleService: ILifecycleServiceType,
	) {
		super();

		this._register(lifecycleService.onWillShutdown(event => {
			if (!this.tableBackendService.canDisposeFile()) {
				return;
			}

			event.join(
				() => this.tableBackendService.disposeFile({ clear: true }).then(() => undefined),
				{
					id: "table.clearRustPreviewFiles",
					label: localize("table.clearRustPreviewFiles", "Clear Rust preview files"),
					order: WillShutdownJoinerOrder.Last,
				},
			);
		}));
	}
}

registerWorkbenchContribution2(
	TablePreviewLifecycleContributionId,
	TablePreviewLifecycleContribution as new (...args: unknown[]) => IWorkbenchContribution,
	WorkbenchPhase.BlockStartup,
);
