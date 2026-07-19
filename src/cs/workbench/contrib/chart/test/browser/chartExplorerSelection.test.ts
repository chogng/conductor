/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Event } from "src/cs/base/common/event";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { ChartExplorerSelectionContribution } from "src/cs/workbench/contrib/chart/browser/chartExplorerSelection";
import { ExplorerService } from "src/cs/workbench/contrib/files/browser/explorerService";
import type { ICalculationService } from "src/cs/workbench/services/calculation/common/calculation";
import type { IChartService } from "src/cs/workbench/services/chart/common/chart";
import type { ChartViewInput } from "src/cs/workbench/services/chart/common/chartViewInput";
import type {
	IPlotService,
	PlotDisplayModelInput,
} from "src/cs/workbench/services/plot/common/plot";
import type { ISliceService } from "src/cs/workbench/services/slice/common/slice";

suite("workbench/contrib/chart/browser/chartExplorerSelection", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("projects the selected Explorer resource into Chart owner input", async () => {
		const resourceA = URI.file("/workspace/a.csv");
		const resourceB = URI.file("/workspace/b.csv");
		const explorerService = store.add(new ExplorerService());
		explorerService.replaceFiles([
			{ fileId: "a", fileName: "A.csv", resource: resourceA },
			{ fileId: "b", fileName: "B.csv", resource: resourceB },
		]);

		const viewInputs: ChartViewInput[] = [];
		const plotPrefetches: string[] = [];
		const calculationPriorities: string[] = [];
		let resourceBQueued = false;
		const contribution = store.add(new ChartExplorerSelectionContribution(
			explorerService,
			{
				onDidChangeResourceCalculationResult: Event.None,
				prioritizeResource: (resource: URI) => calculationPriorities.push(resource.toString()),
			} as unknown as ICalculationService,
			{
				updateViewInput: (input: ChartViewInput) => viewInputs.push(input),
			} as unknown as IChartService,
			{
				onDidChangePlotState: Event.None,
				getState: () => ({
					activePlotType: "iv",
					axisTitleOverridesByKey: {},
					hiddenLegendKeysByPlotKey: {},
					legendLabelsByResourceKey: {},
				}),
				prefetchPlotDisplayModel: (input: PlotDisplayModelInput) => {
					plotPrefetches.push(input.resource?.toString() ?? "");
				},
			} as unknown as IPlotService,
			{
				onDidChangeResourceSliceResult: Event.None,
				onDidChangeSliceState: Event.None,
				getResourceResult: (resource: URI) =>
					resource.toString() === resourceA.toString() ? {} : null,
				getResourceState: (resource: URI) =>
					resourceBQueued && resource.toString() === resourceB.toString()
						? { state: "queued" }
						: { state: "none" },
			} as unknown as ISliceService,
		));

		assert.deepEqual(toComparableInput(viewInputs.at(-1)), {
			activeFileId: "a",
			activeResource: resourceA.toString(),
			activeSheetId: null,
			hasChartData: true,
			processingState: null,
		});
		assert.deepEqual(calculationPriorities, [resourceA.toString()]);
		assert.deepEqual(plotPrefetches, [resourceA.toString()]);

		resourceBQueued = true;
		explorerService.select(resourceB);
		await Promise.resolve();

		assert.deepEqual(toComparableInput(viewInputs.at(-1)), {
			activeFileId: "b",
			activeResource: resourceB.toString(),
			activeSheetId: null,
			hasChartData: false,
			processingState: "processing",
		});

		explorerService.select(null);
		await Promise.resolve();
		assert.equal(viewInputs.at(-1)?.activeFileId, null);
		assert.equal(viewInputs.at(-1)?.activeResource, null);

		contribution.dispose();
	});
});

function toComparableInput(input: ChartViewInput | undefined): object {
	return {
		activeFileId: input?.activeFileId ?? null,
		activeResource: input?.activeResource?.toString() ?? null,
		activeSheetId: input?.activeSheetId ?? null,
		hasChartData: input?.hasChartData ?? false,
		processingState: input?.processingStatus?.state ?? null,
	};
}
