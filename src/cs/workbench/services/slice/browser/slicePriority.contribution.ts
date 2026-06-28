/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import {
	registerWorkbenchContribution2,
	WorkbenchPhase,
	type IWorkbenchContribution,
} from "src/cs/workbench/common/contributions";
import type { ExplorerFileEntry } from "src/cs/workbench/contrib/files/common/explorerModel";
import {
	IExplorerService,
	type IExplorerService as IExplorerServiceType,
} from "src/cs/workbench/contrib/files/browser/files";
import {
	ISliceService,
	SlicePriorityContributionId,
	type ISliceService as ISliceServiceType,
	type SliceUriTarget,
} from "src/cs/workbench/services/slice/common/slice";

export class SlicePriorityContribution extends Disposable implements IWorkbenchContribution {
	public constructor(
		@IExplorerService private readonly explorerService: IExplorerServiceType,
		@ISliceService private readonly sliceService: ISliceServiceType,
	) {
		super();

		this._register(this.explorerService.onDidChangeSelection(event => {
			this.prioritizeResource(event.selectedResource, event.selectedSheetId ?? null);
		}));
		this._register(this.explorerService.onDidChangeHoveredFile(event => {
			this.prioritizeFile(event.fileId);
		}));

		this.prioritizeResource(this.explorerService.selectedResource, this.explorerService.selectedSheetId);
		this.prioritizeFile(this.explorerService.hoveredFileId);
	}

	private prioritizeFile(fileId: string | null): void {
		const normalizedFileId = normalizeFileId(fileId);
		if (!normalizedFileId) {
			return;
		}

		const target = this.getUriTargetForExplorerFileId(normalizedFileId);
		if (target) {
			this.sliceService.prioritizeUri(target);
		}
	}

	private prioritizeResource(resource: URI | null, sheetId: string | null | undefined): void {
		if (!resource) {
			return;
		}

		this.sliceService.prioritizeUri({
			resource,
			sheetId: normalizeFileId(sheetId) ?? null,
		});
	}

	private getUriTargetForExplorerFileId(fileId: string): SliceUriTarget | null {
		const files = this.explorerService.getPaneInput()?.files ?? [];
		for (const file of files) {
			const target = getExplorerFileUriTarget(file);
			if (!target) {
				continue;
			}
			if (
				normalizeFileId(file.fileId) === fileId
			) {
				return target;
			}
		}
		return null;
	}
}

const normalizeFileId = (fileId: unknown): string | null => {
	const normalizedFileId = String(fileId ?? "").trim();
	return normalizedFileId || null;
};

const getExplorerFileUriTarget = (
	file: ExplorerFileEntry,
): SliceUriTarget | null => {
	const resource = file.resource ? URI.revive(file.resource) : null;
	if (!resource) {
		return null;
	}

	return {
		resource,
		sheetId: normalizeFileId(file.sheetId) ?? null,
	};
};

registerWorkbenchContribution2(
	SlicePriorityContributionId,
	SlicePriorityContribution,
	WorkbenchPhase.AfterRestored,
);
