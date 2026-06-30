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
import {
	IExplorerService,
	type ExplorerResourceTarget,
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
			this.prioritizeResource(event.selectedResource, event.selectedSheetId ?? null);
		}));
		this._register(this.explorerService.onDidChangeHoveredResource(event => {
			this.prioritizeTarget(event.target);
		}));

		this.prioritizeResource(this.explorerService.selectedResource, this.explorerService.selectedSheetId);
		this.prioritizeTarget(this.explorerService.hoveredResource);
	}

	private prioritizeTarget(target: ExplorerResourceTarget | null): void {
		this.prioritizeResource(target?.resource ?? null, target?.sheetId ?? null);
	}

	private prioritizeResource(resource: URI | null, sheetId: string | null | undefined): void {
		if (!resource) {
			return;
		}

		this.sliceService.prioritizeResource(resource, normalizeText(sheetId));
	}
}

const normalizeText = (value: unknown): string | null => {
	const normalizedValue = String(value ?? "").trim();
	return normalizedValue || null;
};

registerWorkbenchContribution2(
	SlicePriorityContributionId,
	SlicePriorityContribution,
	WorkbenchPhase.AfterRestored,
);
