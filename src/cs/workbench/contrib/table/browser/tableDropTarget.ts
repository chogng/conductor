/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { DragAndDropObserver } from "src/cs/base/browser/dom";
import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { IFileService } from "src/cs/platform/files/common/files";
import {
	collectDroppedFiles,
	type FileSource,
} from "src/cs/workbench/contrib/files/browser/fileImportExport";
import {
	INotificationService,
	Severity,
} from "src/cs/workbench/services/notification/common/notificationService";
import {
	ITableService,
} from "src/cs/workbench/services/table/common/table";
import {
	ITableModelService,
} from "src/cs/workbench/services/table/common/resolverService";

const TABLE_DROP_TARGET_DRAGGING_CLASS_NAME = "table_view_drop_target--dragging";

export class TableDropTarget extends Disposable {
	public constructor(
		private readonly container: HTMLElement,
		@IFileService private readonly filesService: IFileService,
		@INotificationService private readonly notificationService: INotificationService,
		@ITableService private readonly tableService: ITableService,
		@ITableModelService private readonly tableModelService: ITableModelService,
	) {
		super();
		this._register(new DragAndDropObserver(this.container, {
			onDragEnter: event => this.onDragEnter(event),
			onDragLeave: () => this.setDragging(false),
			onDragOver: event => this.onDragOver(event),
			onDrop: event => void this.onDrop(event),
			onDragEnd: () => this.setDragging(false),
		}));
	}

	public override dispose(): void {
		this.setDragging(false);
		super.dispose();
	}

	private onDragEnter(event: DragEvent): void {
		event.preventDefault();
		this.setDropEffect(event);
		this.setDragging(true);
	}

	private onDragOver(event: DragEvent): void {
		event.preventDefault();
		this.setDropEffect(event);
		this.setDragging(true);
	}

	private async onDrop(event: DragEvent): Promise<void> {
		event.preventDefault();
		this.setDragging(false);
		await this.openDroppedTable(event.dataTransfer);
	}

	private setDropEffect(event: DragEvent): void {
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = "copy";
		}
	}

	private setDragging(isDragging: boolean): void {
		this.container.classList.toggle(TABLE_DROP_TARGET_DRAGGING_CLASS_NAME, isDragging);
	}

	private async openDroppedTable(dataTransfer: DataTransfer | null): Promise<void> {
		const sources = dataTransfer
			? await collectDroppedFiles(dataTransfer, this.filesService)
			: [];
		const source = getFirstDroppedTableResource(sources, this.tableModelService);
		if (!source) {
			this.showOpenError(getDropTableOpenErrorMessage(sources));
			return;
		}

		this.tableService.open({ resource: source.resource });
	}

	private showOpenError(message: string | null): void {
		if (!message) {
			return;
		}

		this.notificationService.notify({
			id: "table.dropTarget.openError",
			message,
			severity: Severity.Warning,
		});
	}
}

const getFirstDroppedTableResource = (
	sources: readonly FileSource[],
	tableModelService: ITableModelService,
): Extract<FileSource, { readonly kind: "path" }> | null => {
	for (const source of sources) {
		if (source.kind !== "path" || !source.resource) {
			continue;
		}

		if (tableModelService.canHandleResource(source.resource)) {
			return source;
		}
	}

	return null;
};

const getDropTableOpenErrorMessage = (
	sources: readonly FileSource[],
): string => sources.length === 0
	? localize("table.dropTarget.noSupportedFiles", "No supported table files were dropped.")
	: localize(
		"table.dropTarget.requiresResource",
		"Dropped table files need a file-system path before they can be opened in Table.",
	);
