/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ChartTitleEditService } from "src/cs/workbench/contrib/chart/browser/chartTitleEditService";
import type { ChartAxisTitleEditRequest } from "src/cs/workbench/services/chart/common/chart";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/chart/test/browser/chartTitleEditService", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
	test("dispatches axis title edit commands to the registered handler", () => {
		const service = new ChartTitleEditService();
		const requests: ChartAxisTitleEditRequest[] = [];

		assert.equal(service.editAxisTitle({ axis: "y", pane: "chart" }), false);

		const registration = service.registerHandler({
			editAxisTitle: request => {
				requests.push(request);
			},
		});

		assert.equal(service.editAxisTitle({ axis: "y", pane: "inspector" }), true);
		assert.equal(service.editAxisTitle({
			axis: "x",
			pane: "chart",
		}), true);

		assert.deepEqual(requests, [
			{ axis: "y", pane: "inspector" },
			{ axis: "x", pane: "chart" },
		]);

		registration.dispose();
		assert.equal(service.editAxisTitle({ axis: "y", pane: "chart" }), false);

		assert.equal(requests.length, 2);
		service.dispose();
	});
});
