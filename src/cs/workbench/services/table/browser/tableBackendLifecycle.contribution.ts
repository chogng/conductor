/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
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

const TableBackendLifecycleContributionId = "workbench.contrib.tableBackendLifecycle";

// Cleans runtime files exposed through ITableBackendService. In desktop builds those
// files are Rust-held artifacts; the browser implementation simply reports no cleanup.
export class TableBackendLifecycleContribution extends Disposable implements IWorkbenchContribution {
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
					id: "table.clearTemporaryFiles",
					label: localize("table.clearTemporaryFiles", "Clear Table Temporary Files"),
					order: WillShutdownJoinerOrder.Last,
				},
			);
		}));
	}
}

registerWorkbenchContribution2(
	TableBackendLifecycleContributionId,
	TableBackendLifecycleContribution as new (...args: unknown[]) => IWorkbenchContribution,
	WorkbenchPhase.BlockStartup,
);
