/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter } from "src/cs/base/common/event";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { ViewContainerLocation } from "src/cs/workbench/common/views";
import type {
	ExplorerHoveredResourceChangeEvent,
	ExplorerSelectionChangeEvent,
	ExplorerVisibleTargetsChangeEvent,
	IExplorerService,
} from "src/cs/workbench/contrib/files/browser/files";
import { ThumbnailExplorerPrefetchContribution } from "src/cs/workbench/contrib/thumbnail/browser/thumbnailExplorerPrefetch";
import { ChartViewContainerId } from "src/cs/workbench/services/chart/common/chart";
import type {
	IThumbnailPreviewService,
	ThumbnailPreviewPriority,
	ThumbnailPreviewTarget,
} from "src/cs/workbench/services/thumbnail/common/thumbnail";
import type { IViewsService } from "src/cs/workbench/services/views/common/viewsService";

suite("workbench/contrib/thumbnail/browser/thumbnailExplorerPrefetch", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("prefetches recent and viewport targets only for chart thumbnails", () => {
		const resourceA = URI.file("/workspace/a.csv");
		const resourceB = URI.file("/workspace/b.csv");
		const selection = store.add(new Emitter<ExplorerSelectionChangeEvent>());
		const hover = store.add(new Emitter<ExplorerHoveredResourceChangeEvent>());
		const visible = store.add(new Emitter<ExplorerVisibleTargetsChangeEvent>());
		const calls: Array<{
			readonly priority: ThumbnailPreviewPriority;
			readonly resources: readonly string[];
		}> = [];
		const explorerService = {
			onDidChangeHoveredResource: hover.event,
			onDidChangeSelection: selection.event,
			onDidChangeVisibleTargets: visible.event,
			viewLayout: "thumbnail",
		} as unknown as IExplorerService;
		const contribution = store.add(new ThumbnailExplorerPrefetchContribution(
			explorerService,
			{
				prefetch: (
					targets: readonly ThumbnailPreviewTarget[],
					priority: Exclude<ThumbnailPreviewPriority, "hover">,
				) => calls.push({
					priority,
					resources: targets.map((target: ThumbnailPreviewTarget) =>
						target.resource.toString()),
				}),
			} as unknown as IThumbnailPreviewService,
			{
				getViewContainerNavigationState: (location: ViewContainerLocation) => ({
					activeViewContainerId:
						location === ViewContainerLocation.Panel ? ChartViewContainerId : null,
				}),
			} as unknown as IViewsService,
		));

		selection.fire({ selectedResource: resourceA });
		hover.fire({ resource: { resource: resourceB } });
		visible.fire({
			visibleTargets: [{ resource: resourceA }],
			nearbyTargets: [{ resource: resourceB }],
		});

		assert.deepEqual(calls, [
			{ priority: "recent", resources: [resourceA.toString()] },
			{ priority: "visible", resources: [resourceA.toString()] },
			{ priority: "nearby", resources: [resourceB.toString()] },
		]);
		contribution.dispose();
	});
});
