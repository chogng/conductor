/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { createChartViewInput } from "src/cs/workbench/services/chart/browser/chartViewInput";
import { ChartService } from "src/cs/workbench/services/chart/browser/chartService";
import type {
	ChartAxisTitleEditRequest,
	ChartState,
} from "src/cs/workbench/services/chart/common/chart";
import type {
	IPlotService,
	PlotDisplayModelInput,
	PlotMainRenderModelInput,
} from "src/cs/workbench/services/plot/common/plot";

suite("workbench/services/chart/test/browser/chartService", () => {
	test("owns chart shell state outside session", () => {
		const service = new ChartService();
		const states: ChartState[] = [];
		const disposable = service.onDidChangeChartState(state => {
			states.push(state);
		});

		service.toggleDetailPane("inspector");
		service.toggleHiddenLegendKey("file-a:iv", "series-b", ["series-a", "series-b"]);

		assert.deepEqual(service.getState(), {
			visibleDetailPanes: [],
			hiddenLegendKeysByContext: {
				"file-a:iv": ["series-b"],
			},
			legendPopoverContextKey: null,
		});
		assert.equal(states.length, 2);

		disposable.dispose();
		service.dispose();
	});

	test("owns legend popover context", () => {
		const service = new ChartService();
		const states: ChartState[] = [];
		const disposable = service.onDidChangeChartState(state => {
			states.push(state);
		});

		service.setLegendPopoverContextKey(" file-a:iv ");
		service.setLegendPopoverContextKey("file-a:iv");
		service.setLegendPopoverContextKey(null);

		assert.deepEqual(states.map(state => state.legendPopoverContextKey), [
			"file-a:iv",
			null,
		]);
		assert.equal(service.getState().legendPopoverContextKey, null);

		disposable.dispose();
		service.dispose();
	});

	test("filters stale legend keys without mutating chart state", () => {
		const service = new ChartService();

		service.toggleHiddenLegendKey("file-a:iv", "series-b", ["series-a", "series-b"]);

		assert.deepEqual(service.getHiddenLegendKeys("file-a:iv", ["series-a"]), []);
		assert.deepEqual(service.getState().hiddenLegendKeysByContext, {
			"file-a:iv": ["series-b"],
		});

		service.dispose();
	});

	test("owns chart axis title edit requests", () => {
		const service = new ChartService();
		const requests: ChartAxisTitleEditRequest[] = [];
		const disposable = service.onDidRequestAxisTitleEdit(request => {
			requests.push(request);
		});

		service.requestAxisTitleEdit({ axis: "y", pane: "inspector" });

		assert.deepEqual(requests, [
			{ axis: "y", pane: "inspector" },
		]);

		disposable.dispose();
		service.dispose();
	});

	test("publishes chart view input", () => {
		const service = new ChartService();
		const input = {
			activeFileId: "file-a",
			activePlotType: "iv" as const,
			chartFileOptions: [{ fileId: "file-a", fileName: "file-a.csv" }],
			hasAnalysisData: true,
		};
		const inputs: unknown[] = [];
		const disposable = service.onDidChangeChartViewInput(nextInput => {
			inputs.push(nextInput);
		});

		service.updateViewInput(input);

		assert.equal(service.getViewInput(), input);
		assert.deepEqual(inputs, [input]);
		disposable.dispose();
		service.dispose();
	});

	test("creates chart view input through plot service", () => {
		let displayInput: PlotDisplayModelInput | null = null;
		let legendInput: PlotMainRenderModelInput | null = null;
		const plotService = {
			getPlotDisplayModel: (input: PlotDisplayModelInput) => {
				displayInput = input;
				return null;
			},
			getPlotLegendModel: (input: PlotMainRenderModelInput) => {
				legendInput = input;
				return null;
			},
		} as IPlotService;

		const input = createChartViewInput({
			activeFileId: "file-a",
			activePlotType: "gm",
			axisSettings: {
				xUnitByFileId: { "file-a": "mV" },
			},
			chartFileOptions: [{ fileId: "file-a", fileName: "file-a.csv" }],
			legendLabels: { "series-a": "Device A" },
			plotService,
		});

		assert.equal(input.activeFileId, "file-a");
		assert.equal(input.activePlotType, "gm");
		assert.equal(input.hasAnalysisData, true);
		assert.deepEqual(input.chartFileOptions, [{ fileId: "file-a", fileName: "file-a.csv" }]);
		assert.deepEqual(input.legendLabels, { "series-a": "Device A" });
		assert.equal((legendInput as PlotMainRenderModelInput | null)?.fileId, "file-a");

		input.createPlotDisplayModel?.({ hiddenLegendKeys: ["series-b"] });

		assert.equal((displayInput as PlotDisplayModelInput | null)?.fileId, "file-a");
		assert.deepEqual((displayInput as PlotDisplayModelInput | null)?.axisSettings, {
			xUnitByFileId: { "file-a": "mV" },
		});
		assert.deepEqual((displayInput as PlotDisplayModelInput | null)?.hiddenLegendKeys, ["series-b"]);
	});
});
