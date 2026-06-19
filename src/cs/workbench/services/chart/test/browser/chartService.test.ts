/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { createChartViewInput } from "src/cs/workbench/services/chart/browser/chartViewInput";
import { ChartService } from "src/cs/workbench/services/chart/browser/chartService";
import type {
	ChartState,
} from "src/cs/workbench/services/chart/common/chart";

suite("workbench/services/chart/test/browser/chartService", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const createService = (): ChartService => store.add(new ChartService());

	test("owns chart shell state outside session", () => {
		const service = createService();
		const states: ChartState[] = [];
		store.add(service.onDidChangeChartState(state => {
			states.push(state);
		}));

		service.toggleDetailPane("inspector");
		service.toggleHiddenLegendKey("file-a:iv", "series-b", ["series-a", "series-b"]);

		assert.deepEqual(service.getState(), {
			visibleDetailPanes: ["inspector"],
			hiddenLegendKeysByContext: {
				"file-a:iv": ["series-b"],
			},
			legendPopoverContextKey: null,
		});
		assert.equal(states.length, 2);
	});

	test("starts with inspector hidden until the user opens it in the current run", () => {
		const service = createService();

		assert.deepEqual(service.getState().visibleDetailPanes, []);

		service.toggleDetailPane("inspector");

		assert.deepEqual(service.getState().visibleDetailPanes, ["inspector"]);

		service.toggleDetailPane("inspector");

		assert.deepEqual(service.getState().visibleDetailPanes, []);
	});

	test("owns legend popover context", () => {
		const service = createService();
		const states: ChartState[] = [];
		store.add(service.onDidChangeChartState(state => {
			states.push(state);
		}));

		service.setLegendPopoverContextKey(" file-a:iv ");
		service.setLegendPopoverContextKey("file-a:iv");
		service.setLegendPopoverContextKey(null);

		assert.deepEqual(states.map(state => state.legendPopoverContextKey), [
			"file-a:iv",
			null,
		]);
		assert.equal(service.getState().legendPopoverContextKey, null);
	});

	test("filters stale legend keys without mutating chart state", () => {
		const service = createService();

		service.toggleHiddenLegendKey("file-a:iv", "series-b", ["series-a", "series-b"]);

		assert.deepEqual(service.getHiddenLegendKeys("file-a:iv", ["series-a"]), []);
		assert.deepEqual(service.getState().hiddenLegendKeysByContext, {
			"file-a:iv": ["series-b"],
		});
	});

	test("publishes chart view input", () => {
		const service = createService();
		const input = {
			activeFileId: "file-a",
			activePlotType: "iv" as const,
			chartFileOptions: [{ fileId: "file-a", fileName: "file-a.csv" }],
			hasChartData: true,
		};
		let changeCount = 0;
		store.add(service.onDidChangeChartViewInput(() => {
			changeCount += 1;
		}));

		service.updateViewInput(input);
		service.updateViewInput({
			...input,
			chartFileOptions: [{ fileId: "file-a", fileName: "file-a.csv" }],
		});

		assert.equal(service.getViewInput(), input);
		assert.equal(changeCount, 1);
	});

	test("creates chart view input without plot-owned data", () => {
		const input = createChartViewInput({
			activeFileId: "file-a",
			activePlotType: "gm",
			chartFileOptions: [{ fileId: "file-a", fileName: "file-a.csv" }],
			processingStatus: { processed: 1, state: "processing", total: 3 },
		});

		assert.equal(input.activeFileId, "file-a");
		assert.equal(input.activePlotType, "gm");
		assert.equal(input.hasChartData, true);
		assert.equal(input.processingStatus, undefined);
		assert.deepEqual(input.chartFileOptions, [{ fileId: "file-a", fileName: "file-a.csv" }]);
		assert.equal("createPlotDisplayModel" in input, false);
		assert.equal("plotDisplayModel" in input, false);
		assert.equal("plotLegendModel" in input, false);
	});

	test("keeps processing status only while active chart has no data", () => {
		const processingStatus = { processed: 1, state: "processing" as const, total: 3 };
		const input = createChartViewInput({
			activeFileId: "raw-only-file",
			activePlotType: "iv",
			chartFileOptions: [{ fileId: "chart-file", fileName: "chart.csv" }],
			processingStatus,
		});

		assert.equal(input.hasChartData, false);
		assert.equal(input.processingStatus, processingStatus);
	});

	test("keeps selected pending target even when chart option exists", () => {
		const processingStatus = { processed: 1, state: "processing" as const, total: 3 };
		const input = createChartViewInput({
			activeFileId: "file-pending",
			activePlotType: "iv",
			chartFileOptions: [{ fileId: "file-pending", fileName: "pending.csv" }],
			hasChartData: false,
			processingStatus,
		});

		assert.equal(input.activeFileId, "file-pending");
		assert.equal(input.hasChartData, false);
		assert.equal(input.processingStatus, processingStatus);
		assert.deepEqual(input.chartFileOptions, [{ fileId: "file-pending", fileName: "pending.csv" }]);
	});

	test("does not publish chart input changes for hidden background file options", () => {
		const service = createService();
		let changeCount = 0;
		store.add(service.onDidChangeChartViewInput(() => {
			changeCount += 1;
		}));
		const first = createChartViewInput({
			activeFileId: "file-a",
			activePlotType: "iv",
			chartFileOptions: [{ fileId: "file-a", fileName: "file-a.csv" }],
			showFileSelect: false,
		});
		const next = createChartViewInput({
			activeFileId: "file-a",
			activePlotType: "iv",
			chartFileOptions: [
				{ fileId: "file-a", fileName: "file-a.csv" },
				{ fileId: "file-b", fileName: "file-b.csv" },
			],
			showFileSelect: false,
		});

		service.updateViewInput(first);
		service.updateViewInput(next);

		assert.equal(changeCount, 1);
		assert.deepEqual(next.chartFileOptions, [{ fileId: "file-a", fileName: "file-a.csv" }]);
	});

	test("does not report chart data when active file is absent from chart options", () => {
		const input = createChartViewInput({
			activeFileId: "raw-only-file",
			activePlotType: "iv",
			chartFileOptions: [{ fileId: "chart-file", fileName: "chart.csv" }],
		});

		assert.equal(input.activeFileId, "raw-only-file");
		assert.equal(input.hasChartData, false);
	});
});
