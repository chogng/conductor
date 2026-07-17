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
import type { ExplorerResourceIdentity } from "src/cs/workbench/contrib/files/common/explorerModel";
import {
	ICalculationService,
	type ICalculationService as ICalculationServiceType,
} from "src/cs/workbench/services/calculation/common/calculation";
import {
	ISliceService,
	type ISliceService as ISliceServiceType,
	type SliceFileState,
} from "src/cs/workbench/services/slice/common/slice";

const CalculationPriorityContributionId = "workbench.contrib.calculation.priority";

export class CalculationPriorityContribution extends Disposable implements IWorkbenchContribution {
	public constructor(
		@IExplorerService private readonly explorerService: IExplorerServiceType,
		@ICalculationService private readonly calculationService: ICalculationServiceType,
		@ISliceService private readonly sliceService: ISliceServiceType,
	) {
		super();

		this._register(this.explorerService.onDidChangeSelection(event => {
			this.prioritize(event.selectedResource
				? { resource: event.selectedResource, sheetId: event.selectedSheetId ?? null }
				: null);
		}));
		this._register(this.explorerService.onDidChangeHoveredResource(event => {
			this.prioritize(event.resource);
		}));
		this.prioritize(this.explorerService.selectedResource
			? {
				resource: this.explorerService.selectedResource,
				sheetId: this.explorerService.selectedSheetId,
			}
			: null);
		this.prioritize(this.explorerService.hoveredResource);
	}

	private prioritize(target: ExplorerResourceIdentity | null): void {
		if (
			!target ||
			!(
				this.sliceService.getResourceResult(target.resource, target.sheetId) ||
				isSliceChartTargetState(this.sliceService.getResourceState(target.resource, target.sheetId))
			)
		) {
			return;
		}

		this.calculationService.prioritizeResource(target.resource, target.sheetId);
	}
}

function isSliceChartTargetState(state: SliceFileState | undefined): boolean {
	return state?.state === "queued" ||
		state?.state === "processing" ||
		state?.state === "ready";
}

registerWorkbenchContribution2(
	CalculationPriorityContributionId,
	CalculationPriorityContribution,
	WorkbenchPhase.AfterRestored,
);
