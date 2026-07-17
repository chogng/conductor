/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
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
	getExplorerFileResourceIdentity,
	getExplorerResourceIdentityKey,
	type ExplorerResourceIdentity,
} from "src/cs/workbench/contrib/files/common/explorerModel";
import { ChartViewContainerId } from "src/cs/workbench/services/chart/common/chart";
import {
	IPlotService,
	type IPlotService as IPlotServiceType,
	type PlotCalculatedDataPrefetchPriority,
} from "src/cs/workbench/services/plot/common/plot";
import {
	ISliceService,
	type ISliceService as ISliceServiceType,
	type SliceFileState,
} from "src/cs/workbench/services/slice/common/slice";
import {
	IViewsService,
	type IViewsService as IViewsServiceType,
} from "src/cs/workbench/services/views/common/viewsService";

const PlotExplorerPrefetchContributionId = "workbench.contrib.plot.explorerPrefetch";
const RECENT_TARGET_LIMIT = 16;

export class PlotExplorerPrefetchContribution extends Disposable implements IWorkbenchContribution {
	private readonly recentTargets: ExplorerResourceIdentity[] = [];

	public constructor(
		@IExplorerService private readonly explorerService: IExplorerServiceType,
		@IPlotService private readonly plotService: IPlotServiceType,
		@ISliceService private readonly sliceService: ISliceServiceType,
		@IViewsService private readonly viewsService: IViewsServiceType,
	) {
		super();

		this._register(this.explorerService.onDidChangeSelection(event => {
			this.prefetchInteractiveTarget(
				event.selectedResource
					? { resource: event.selectedResource, sheetId: event.selectedSheetId ?? null }
					: null,
				"active",
			);
		}));
		this._register(this.explorerService.onDidChangeHoveredResource(event => {
			this.prefetchInteractiveTarget(event.resource, "hover");
		}));
		this._register(this.explorerService.onDidChangeVisibleTargets(event => {
			if (!this.isChartPanelActive()) {
				return;
			}
			this.prefetch(event.visibleTargets, "visible");
			this.prefetch(event.nearbyTargets, "nearby");
		}));
		this._register(this.explorerService.onDidChangeFiles(() => this.pruneRecentTargets()));
	}

	private prefetchInteractiveTarget(
		target: ExplorerResourceIdentity | null,
		priority: "active" | "hover",
	): void {
		if (!target) {
			return;
		}

		const previous = this.rememberRecentTarget(target);
		if (!this.isChartPanelActive()) {
			return;
		}

		if (this.isSliceChartTarget(target)) {
			this.prefetch([target], priority);
		}
		if (previous) {
			this.prefetch([previous], "recent");
		}
	}

	private prefetch(
		targets: readonly ExplorerResourceIdentity[],
		priority: PlotCalculatedDataPrefetchPriority,
	): void {
		if (!targets.length) {
			return;
		}

		const plotType = this.plotService.getState().activePlotType;
		this.plotService.prefetchPlotDisplayModels(
			targets.map(target => ({
				plotType,
				resource: target.resource,
				sheetId: target.sheetId ?? null,
			})),
			priority,
		);
	}

	private rememberRecentTarget(target: ExplorerResourceIdentity): ExplorerResourceIdentity | null {
		const key = getExplorerResourceIdentityKey(target);
		if (!key) {
			return null;
		}

		const previous = this.recentTargets[0] ?? null;
		const existingIndex = this.recentTargets.findIndex(candidate =>
			getExplorerResourceIdentityKey(candidate) === key);
		if (existingIndex >= 0) {
			this.recentTargets.splice(existingIndex, 1);
		}
		this.recentTargets.unshift(target);
		if (this.recentTargets.length > RECENT_TARGET_LIMIT) {
			this.recentTargets.length = RECENT_TARGET_LIMIT;
		}
		return previous && getExplorerResourceIdentityKey(previous) !== key ? previous : null;
	}

	private pruneRecentTargets(): void {
		const fileKeys = new Set(
			this.explorerService.files
				.map(file => getExplorerResourceIdentityKey(getExplorerFileResourceIdentity(file)))
				.filter((key): key is string => Boolean(key)),
		);
		for (let index = this.recentTargets.length - 1; index >= 0; index -= 1) {
			if (!fileKeys.has(getExplorerResourceIdentityKey(this.recentTargets[index]) ?? "")) {
				this.recentTargets.splice(index, 1);
			}
		}
	}

	private isSliceChartTarget(target: ExplorerResourceIdentity): boolean {
		return Boolean(this.sliceService.getResourceResult(target.resource, target.sheetId)) ||
			isSliceChartTargetState(this.sliceService.getResourceState(target.resource, target.sheetId));
	}

	private isChartPanelActive(): boolean {
		return this.viewsService.getViewContainerNavigationState(
			ViewContainerLocation.Panel,
		).activeViewContainerId === ChartViewContainerId;
	}
}

function isSliceChartTargetState(state: SliceFileState | undefined): boolean {
	return state?.state === "queued" ||
		state?.state === "processing" ||
		state?.state === "ready";
}

registerWorkbenchContribution2(
	PlotExplorerPrefetchContributionId,
	PlotExplorerPrefetchContribution,
	WorkbenchPhase.AfterRestored,
);
