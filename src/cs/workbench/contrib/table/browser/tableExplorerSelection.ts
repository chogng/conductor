/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import { ViewContainerLocation } from "src/cs/workbench/common/views";
import {
	registerWorkbenchContribution2,
	WorkbenchPhase,
	type IWorkbenchContribution,
} from "src/cs/workbench/common/contributions";
import {
	IExplorerService,
	type IExplorerService as IExplorerServiceType,
} from "src/cs/workbench/contrib/files/browser/files";
import {
	findExplorerFileEntryByResource,
} from "src/cs/workbench/contrib/files/common/explorerModel";
import {
	ITableService,
	type ITableService as ITableServiceType,
	type TableSource,
} from "src/cs/workbench/services/table/common/table";
import { TableViewContainerId } from "src/cs/workbench/contrib/table/common/table";
import { tableFormatService } from "src/cs/workbench/services/table/common/tableFormatService";
import {
	IViewsService,
	type IViewsService as IViewsServiceType,
} from "src/cs/workbench/services/views/common/viewsService";

const TableExplorerSelectionContributionId = "workbench.contrib.table.explorerSelection";

export class TableExplorerSelectionContribution extends Disposable implements IWorkbenchContribution {
	public constructor(
		@IExplorerService private readonly explorerService: IExplorerServiceType,
		@ITableService private readonly tableService: ITableServiceType,
		@IViewsService private readonly viewsService: IViewsServiceType,
	) {
		super();

		this._register(this.explorerService.onDidChangeContext(() => this.sync()));
		this._register(this.explorerService.onDidChangeFiles(() => this.sync()));
		this._register(this.explorerService.onDidChangeSelection(() => this.sync()));
		this._register(this.viewsService.onDidChangeViewContainerNavigation(event => {
			if (event.location === ViewContainerLocation.Panel) {
				this.sync();
			}
		}));
		this.sync();
	}

	public sync(): void {
		if (
			this.explorerService.isImportingSources ||
			this.viewsService.getViewContainerNavigationState(
				ViewContainerLocation.Panel,
			).activeViewContainerId !== TableViewContainerId
		) {
			return;
		}

		this.tableService.open(resolveExplorerTableSource(this.explorerService));
	}
}

export function resolveExplorerTableSource(
	explorerService: Pick<IExplorerServiceType, "files" | "selectedResource" | "selectedSheetId">,
): TableSource | null {
	const selectedFile = explorerService.selectedResource
		? findExplorerFileEntryByResource(explorerService.files, {
			resource: explorerService.selectedResource,
			sheetId: explorerService.selectedSheetId,
		})
		: null;
	const resource = selectedFile ? URI.revive(selectedFile.resource) : null;
	if (!resource) {
		return null;
	}

	const tablePath =
		normalizeValue(selectedFile?.normalizedCsvPath) ??
		normalizeValue(selectedFile?.sourcePath);
	const normalizedCsvPath = normalizeValue(selectedFile?.normalizedCsvPath);
	const sheetId =
		tablePath !== normalizedCsvPath &&
		tableFormatService.isMaterializableWorkbook(resource)
			? normalizeValue(selectedFile?.sheetId)
			: null;
	return {
		resource,
		...(sheetId ? { sheetId } : {}),
	};
}

function normalizeValue(value: unknown): string | null {
	const normalized = String(value ?? "").trim();
	return normalized || null;
}

registerWorkbenchContribution2(
	TableExplorerSelectionContributionId,
	TableExplorerSelectionContribution,
	WorkbenchPhase.BlockStartup,
);
