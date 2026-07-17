/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { ViewContainerLocation } from "src/cs/workbench/common/views";
import { ExplorerService } from "src/cs/workbench/contrib/files/browser/explorerService";
import {
	TemplateApplyPerformanceTraceContribution,
	type TemplateApplyPerformanceTraceTargetApi,
} from "src/cs/workbench/contrib/performance/browser/templateApplyPerformanceTrace";
import { ChartViewContainerId } from "src/cs/workbench/services/chart/common/chart";
import type { ISliceService } from "src/cs/workbench/services/slice/common/slice";
import type { IViewsService } from "src/cs/workbench/services/views/common/viewsService";

type TraceGlobalForTest = typeof globalThis & {
	__conductorTemplateApplyPerformanceTrace?: {
		readonly targetApi?: TemplateApplyPerformanceTraceTargetApi;
	};
};

suite("workbench/contrib/performance/browser/templateApplyPerformanceTraceContribution", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("exposes chart targets directly from Explorer and Slice owners", () => {
		const resourceA = URI.file("/workspace/a.csv");
		const resourceB = URI.file("/workspace/b.csv");
		const explorerService = store.add(new ExplorerService());
		explorerService.replaceFiles([
			{ fileId: "a", fileName: "A.csv", resource: resourceA },
			{ fileId: "b", fileName: "B.csv", resource: resourceB },
		]);
		explorerService.setViewLayout("thumbnail");
		const previousLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
		const storage = new Map<string, string>([
			["conductor.templateApplyPerformanceTrace", "true"],
		]);
		Object.defineProperty(globalThis, "localStorage", {
			configurable: true,
			value: {
				getItem: (key: string) => storage.get(key) ?? null,
			},
		});

		const contribution = store.add(new TemplateApplyPerformanceTraceContribution(
			explorerService,
			{
				getResourceResult: (resource: URI) =>
					resource.toString() === resourceA.toString() ? {} : null,
				getResourceState: (resource: URI) =>
					resource.toString() === resourceA.toString()
						? { state: "ready" }
						: { state: "none" },
			} as unknown as ISliceService,
			{
				getViewContainerNavigationState: (location: ViewContainerLocation) => ({
					activeViewContainerId:
						location === ViewContainerLocation.Panel ? ChartViewContainerId : null,
				}),
			} as unknown as IViewsService,
		));
		const api = (globalThis as TraceGlobalForTest)
			.__conductorTemplateApplyPerformanceTrace?.targetApi;

		assert.deepEqual(api?.getChartTargets().map(target => ({
			fileId: target.fileId,
			selected: target.selected,
		})), [{ fileId: "a", selected: true }]);
		assert.equal(api?.selectChartTarget("b"), null);
		assert.equal(api?.setHoveredChartTarget("a"), "a");
		assert.equal(explorerService.hoveredResource?.resource.toString(), resourceA.toString());

		contribution.dispose();
		if (previousLocalStorage) {
			Object.defineProperty(globalThis, "localStorage", previousLocalStorage);
		} else {
			delete (globalThis as { localStorage?: Storage }).localStorage;
		}
	});
});
