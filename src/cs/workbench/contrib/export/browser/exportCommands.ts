/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { Action2, registerAction2 } from "src/cs/platform/actions/common/actions";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import { ExportCommandId, IExportService } from "src/cs/workbench/services/export/common/export";
import { IWorkbenchLayoutService } from "src/cs/workbench/services/layout/browser/layoutService";

export const registerExportCommands = (): IDisposable => {
	const disposables = new DisposableStore();

	disposables.add(registerAction2(class ShowExportAction extends Action2 {
		public constructor() {
			super({
				category: localize("export.commands.category", "Export"),
				f1: true,
				id: ExportCommandId.showExport,
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
				id: ExportCommandId.openInOrigin,
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
				id: ExportCommandId.exportOriginZip,
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
	layoutService.navigateToView("chart");
	layoutService.selectAuxiliaryBarView(view);
};
