/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { Action2, registerAction2 } from "src/cs/platform/actions/common/actions";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import {
  IExportService,
} from "src/cs/workbench/services/export/common/export";
import { IWorkbenchLayoutService } from "src/cs/workbench/services/layout/browser/layoutService";
import { IViewsService } from "src/cs/workbench/services/views/common/viewsService";
import { ChartViewContainerId } from "src/cs/workbench/services/chart/common/chart";

export const EXPORT_ORIGIN_ZIP_COMMAND_ID = "workbench.action.exportOriginZip";
export const OPEN_IN_ORIGIN_COMMAND_ID = "workbench.action.openInOrigin";
export const SHOW_EXPORT_COMMAND_ID = "workbench.action.showExport";

export const registerExportCommands = (): IDisposable => {
	const disposables = new DisposableStore();

	disposables.add(registerAction2(class ShowExportAction extends Action2 {
		public constructor() {
			super({
				category: localize("export.commands.category", "Export"),
				f1: true,
				id: SHOW_EXPORT_COMMAND_ID,
				title: localize("export.commands.showExport", "Show Export"),
				metadata: {
					description: localize("export.commands.showExport", "Show Export"),
				},
			});
		}

		public run(accessor: ServicesAccessor): void {
			showChartAuxiliaryView(accessor, "export");
		}
	}));

	disposables.add(registerAction2(class OpenInOriginAction extends Action2 {
		public constructor() {
			super({
				category: localize("export.commands.category", "Export"),
				f1: true,
				id: OPEN_IN_ORIGIN_COMMAND_ID,
				title: localize("export.commands.openInOrigin", "Open in Origin"),
				metadata: {
					description: localize("export.commands.openInOrigin", "Open in Origin"),
				},
			});
		}

		public run(accessor: ServicesAccessor): Promise<void> {
			return accessor.get(IExportService).openInOrigin();
		}
	}));

	disposables.add(registerAction2(class ExportOriginZipAction extends Action2 {
		public constructor() {
			super({
				category: localize("export.commands.category", "Export"),
				f1: true,
				id: EXPORT_ORIGIN_ZIP_COMMAND_ID,
				title: localize("export.commands.exportOriginZip", "Export Origin ZIP"),
				metadata: {
					description: localize("export.commands.exportOriginZip", "Export Origin ZIP"),
				},
			});
		}

		public run(accessor: ServicesAccessor): Promise<void> {
			return accessor.get(IExportService).exportOriginZip();
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
