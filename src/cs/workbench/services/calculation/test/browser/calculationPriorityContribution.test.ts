/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter } from "src/cs/base/common/event";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type {
	ExplorerHoveredResourceChangeEvent,
	ExplorerSelectionChangeEvent,
	IExplorerService,
} from "src/cs/workbench/contrib/files/browser/files";
import { CalculationPriorityContribution } from "src/cs/workbench/services/calculation/browser/calculationPriority.contribution";
import type { ICalculationService } from "src/cs/workbench/services/calculation/common/calculation";
import type { ISliceService } from "src/cs/workbench/services/slice/common/slice";

suite("workbench/services/calculation/browser/calculationPriorityContribution", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("prioritizes only Explorer targets accepted by the Slice owner", () => {
		const readyResource = URI.file("/workspace/ready.csv");
		const missingResource = URI.file("/workspace/missing.csv");
		const selection = store.add(new Emitter<ExplorerSelectionChangeEvent>());
		const hover = store.add(new Emitter<ExplorerHoveredResourceChangeEvent>());
		const priorities: string[] = [];
		const contribution = store.add(new CalculationPriorityContribution(
			{
				hoveredResource: null,
				onDidChangeHoveredResource: hover.event,
				onDidChangeSelection: selection.event,
				selectedResource: null,
				selectedSheetId: null,
			} as unknown as IExplorerService,
			{
				prioritizeResource: (resource: URI) => priorities.push(resource.toString()),
			} as unknown as ICalculationService,
			{
				getResourceResult: (resource: URI) =>
					resource.toString() === readyResource.toString() ? {} : null,
				getResourceState: () => ({ state: "none" }),
			} as unknown as ISliceService,
		));

		selection.fire({ selectedResource: missingResource });
		hover.fire({ resource: { resource: readyResource } });

		assert.deepEqual(priorities, [readyResource.toString()]);
		contribution.dispose();
	});
});
