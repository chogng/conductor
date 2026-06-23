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
	IExplorerService,
	type IExplorerService as IExplorerServiceType,
} from "src/cs/workbench/contrib/files/browser/files";
import {
	ISliceService,
	SlicePriorityContributionId,
	type ISliceService as ISliceServiceType,
} from "src/cs/workbench/services/slice/common/slice";

export class SlicePriorityContribution extends Disposable implements IWorkbenchContribution {
	public constructor(
		@IExplorerService private readonly explorerService: IExplorerServiceType,
		@ISliceService private readonly sliceService: ISliceServiceType,
	) {
		super();

		this._register(this.explorerService.onDidChangeSelection(event => {
			this.prioritizeFile(event.selectedFileId);
		}));
		this._register(this.explorerService.onDidChangeHoveredFile(event => {
			this.prioritizeFile(event.fileId);
		}));

		this.prioritizeFile(this.getCurrentSelectedFileId());
		this.prioritizeFile(this.explorerService.hoveredFileId);
	}

	private getCurrentSelectedFileId(): string | null {
		return normalizeFileId(this.explorerService.selectedRawFileId) ??
			normalizeFileId(this.explorerService.selectedProcessedFileId);
	}

	private prioritizeFile(fileId: string | null): void {
		const normalizedFileId = normalizeFileId(fileId);
		if (!normalizedFileId) {
			return;
		}

		this.sliceService.prioritize(normalizedFileId);
	}
}

const normalizeFileId = (fileId: string | null): string | null => {
	const normalizedFileId = String(fileId ?? "").trim();
	return normalizedFileId || null;
};

registerWorkbenchContribution2(
	SlicePriorityContributionId,
	SlicePriorityContribution,
	WorkbenchPhase.AfterRestored,
);
