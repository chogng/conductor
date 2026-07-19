/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter, Event } from "src/cs/base/common/event";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { ViewContainerLocation } from "src/cs/workbench/common/views";
import type {
	ExplorerHoveredResourceChangeEvent,
	ExplorerSelectionChangeEvent,
	ExplorerVisibleTargetsChangeEvent,
	IExplorerService,
} from "src/cs/workbench/contrib/files/browser/files";
import { PlotExplorerPrefetchContribution } from "src/cs/workbench/contrib/plot/browser/plotExplorerPrefetch";
import { ChartViewContainerId } from "src/cs/workbench/services/chart/common/chart";
import type {
	IPlotService,
	PlotCalculatedDataPrefetchPriority,
	PlotDisplayModelInput,
} from "src/cs/workbench/services/plot/common/plot";
import type { ISliceService } from "src/cs/workbench/services/slice/common/slice";
import type { IViewsService } from "src/cs/workbench/services/views/common/viewsService";

suite("workbench/contrib/plot/browser/plotExplorerPrefetch", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("prefetches active, recent, visible, and nearby resource targets", () => {
		const resourceA = URI.file("/workspace/a.csv");
		const resourceB = URI.file("/workspace/b.csv");
		const selection = store.add(new Emitter<ExplorerSelectionChangeEvent>());
		const hover = store.add(new Emitter<ExplorerHoveredResourceChangeEvent>());
		const visible = store.add(new Emitter<ExplorerVisibleTargetsChangeEvent>());
		const calls: Array<{
			readonly priority: PlotCalculatedDataPrefetchPriority;
			readonly resources: readonly string[];
		}> = [];
		const explorerService = {
			files: [
				{ fileId: "a", fileName: "A.csv", resource: resourceA },
				{ fileId: "b", fileName: "B.csv", resource: resourceB },
			],
			onDidChangeFiles: Event.None,
			onDidChangeHoveredResource: hover.event,
			onDidChangeSelection: selection.event,
			onDidChangeVisibleTargets: visible.event,
		} as unknown as IExplorerService;
		const contribution = store.add(new PlotExplorerPrefetchContribution(
			explorerService,
			{
				getState: () => ({
					activePlotType: "iv",
					axisTitleOverridesByKey: {},
					hiddenLegendKeysByPlotKey: {},
					legendLabels: {},
				}),
				prefetchPlotDisplayModels: (
					inputs: readonly PlotDisplayModelInput[],
					priority: PlotCalculatedDataPrefetchPriority,
				) => calls.push({
					priority,
					resources: inputs.map(input => input.resource?.toString() ?? ""),
				}),
			} as unknown as IPlotService,
			{
				getResourceResult: () => ({}),
				getResourceState: () => ({ state: "ready" }),
			} as unknown as ISliceService,
			{
				getViewContainerNavigationState: (location: ViewContainerLocation) => ({
					activeViewContainerId:
						location === ViewContainerLocation.Panel ? ChartViewContainerId : null,
				}),
			} as unknown as IViewsService,
		));

		selection.fire({ selectedResource: resourceA });
		selection.fire({ selectedResource: resourceB });
		visible.fire({
			visibleTargets: [{ resource: resourceA }],
			nearbyTargets: [{ resource: resourceB }],
		});

		assert.deepEqual(calls, [
			{ priority: "active", resources: [resourceA.toString()] },
			{ priority: "active", resources: [resourceB.toString()] },
			{ priority: "recent", resources: [resourceA.toString()] },
			{ priority: "visible", resources: [resourceA.toString()] },
			{ priority: "nearby", resources: [resourceB.toString()] },
		]);
		contribution.dispose();
	});
});
