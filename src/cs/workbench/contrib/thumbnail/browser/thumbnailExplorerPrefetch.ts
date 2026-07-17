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
	getExplorerResourceIdentityKey,
	type ExplorerResourceIdentity,
} from "src/cs/workbench/contrib/files/common/explorerModel";
import { ChartViewContainerId } from "src/cs/workbench/services/chart/common/chart";
import {
	IThumbnailPreviewService,
	type IThumbnailPreviewService as IThumbnailPreviewServiceType,
} from "src/cs/workbench/services/thumbnail/common/thumbnail";
import {
	IViewsService,
	type IViewsService as IViewsServiceType,
} from "src/cs/workbench/services/views/common/viewsService";

const ThumbnailExplorerPrefetchContributionId = "workbench.contrib.thumbnail.explorerPrefetch";
const RECENT_TARGET_LIMIT = 16;

export class ThumbnailExplorerPrefetchContribution extends Disposable implements IWorkbenchContribution {
	private readonly recentTargets: ExplorerResourceIdentity[] = [];

	public constructor(
		@IExplorerService private readonly explorerService: IExplorerServiceType,
		@IThumbnailPreviewService private readonly thumbnailPreviewService: IThumbnailPreviewServiceType,
		@IViewsService private readonly viewsService: IViewsServiceType,
	) {
		super();

		this._register(this.explorerService.onDidChangeSelection(event => {
			this.rememberInteractiveTarget(
				event.selectedResource
					? { resource: event.selectedResource, sheetId: event.selectedSheetId ?? null }
					: null,
			);
		}));
		this._register(this.explorerService.onDidChangeHoveredResource(event => {
			this.rememberInteractiveTarget(event.resource);
		}));
		this._register(this.explorerService.onDidChangeVisibleTargets(event => {
			if (!this.shouldPrefetchVisibleTargets()) {
				return;
			}
			this.thumbnailPreviewService.prefetch(event.visibleTargets, "visible");
			this.thumbnailPreviewService.prefetch(event.nearbyTargets, "nearby");
		}));
	}

	private rememberInteractiveTarget(target: ExplorerResourceIdentity | null): void {
		const key = getExplorerResourceIdentityKey(target);
		if (!target || !key) {
			return;
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

		if (
			previous &&
			getExplorerResourceIdentityKey(previous) !== key &&
			this.isChartPanelActive()
		) {
			this.thumbnailPreviewService.prefetch([previous], "recent");
		}
	}

	private shouldPrefetchVisibleTargets(): boolean {
		return this.isChartPanelActive() && this.explorerService.viewLayout === "thumbnail";
	}

	private isChartPanelActive(): boolean {
		return this.viewsService.getViewContainerNavigationState(
			ViewContainerLocation.Panel,
		).activeViewContainerId === ChartViewContainerId;
	}
}

registerWorkbenchContribution2(
	ThumbnailExplorerPrefetchContributionId,
	ThumbnailExplorerPrefetchContribution,
	WorkbenchPhase.AfterRestored,
);
