/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter, Event } from "src/cs/base/common/event";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type { DataResourceStructuredContentSnapshot } from "src/cs/workbench/services/dataResource/common/dataResource";
import { createSearchPointLookupModelFromPlotDisplay } from "src/cs/workbench/services/search/browser/searchModel";
import { SearchService } from "src/cs/workbench/services/search/browser/searchService";
import type { SearchPointLookupModel, SearchState } from "src/cs/workbench/services/search/common/search";
import type { IChartService } from "src/cs/workbench/services/chart/common/chart";
import type { IPlotService, PlotDisplayModel, PlotDisplayModelInput, PlotLegendModel, PlotTarget } from "src/cs/workbench/services/plot/common/plot";
import type { PlotMainRenderModel } from "src/cs/workbench/services/plot/common/plotModel";

suite("workbench/services/search/test/browser/searchService", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("owns search query state", () => {
		const service = store.add(createSearchServiceForTest());
		const states: SearchState[] = [];
		store.add(service.onDidChangeSearchState(state => {
			states.push(state);
		}));

		service.setQueryText("1.25");
		service.updateQuery({
			scope: "block",
			kinds: ["block", "column", "block"],
			caseSensitive: true,
		});
		service.setSelectedResultId(" result-a ");

		assert.deepEqual(service.getState(), {
			query: {
				text: "1.25",
				scope: "block",
				kinds: ["block", "column"],
				caseSensitive: true,
				interpolationMode: "linear",
			},
			selectedResultId: "result-a",
		});
		assert.equal(states.length, 3);
	});

	test("skips duplicate search state notifications", () => {
		const service = store.add(createSearchServiceForTest());
		let changeCount = 0;
		store.add(service.onDidChangeSearchState(() => {
			changeCount += 1;
		}));

		service.setQuery({
			text: "",
			scope: "all",
			kinds: ["rawCell", "rawTable", "column", "group", "block"],
			caseSensitive: false,
			interpolationMode: "linear",
		});
		service.setSelectedResultId(null);

		assert.equal(changeCount, 0);
	});

	test("owns current point lookup model input outside the view", () => {
		const service = store.add(createSearchServiceForTest());
		const models: Array<SearchPointLookupModel | null> = [];
		store.add(service.onDidChangeSearchPointLookupModel(model => {
			models.push(model);
		}));
		const model = createSearchPointLookupModel();

		service.setPointLookupModel(model);
		service.setPointLookupModel(model);
		service.setPointLookupModel(null);

		assert.equal(service.getPointLookupModel(), null);
		assert.deepEqual(models, [model, null]);
	});

	test("refreshes point lookup from plot legend visibility and labels", () => {
		const plotStateEmitter = store.add(new Emitter<ReturnType<IPlotService["getState"]>>());
		const plotDisplayInputs: PlotDisplayModelInput[] = [];
		let legendLabels: Readonly<Record<string, string>> = {
			"series-a": "Edited A",
			stale: "Stale",
		};
		const service = store.add(new SearchService(
			createChartServiceForPointLookupTest(),
			createPlotServiceForPointLookupTest({
				legendLabels: () => legendLabels,
				onDidChangePlotState: plotStateEmitter.event,
				plotDisplayInputs,
			}),
		));

		assert.deepEqual({
			input: {
				hiddenLegendKeys: plotDisplayInputs.at(-1)?.hiddenLegendKeys,
				legendLabels: plotDisplayInputs.at(-1)?.legendLabels,
				plotType: plotDisplayInputs.at(-1)?.plotType,
			},
			seriesNames: service.getPointLookupModel()?.panes[0]?.model.seriesList.map(series => series.name),
		}, {
			input: {
				hiddenLegendKeys: ["series-b"],
				legendLabels: {
					"series-a": "Edited A",
				},
				plotType: "iv",
			},
			seriesNames: ["Edited A"],
		});

		legendLabels = { "series-a": "Renamed A" };
		plotStateEmitter.fire({
			activePlotType: "iv",
			axisTitleOverridesByKey: {},
			hiddenLegendKeysByPlotKey: {},
			legendLabels: {
				"file-a": legendLabels,
			},
		});

		assert.deepEqual(
			service.getPointLookupModel()?.panes[0]?.model.seriesList.map(series => series.name),
			["Renamed A"],
		);
	});

	test("creates point lookup model from plot display", () => {
		const model = createSearchPointLookupModelFromPlotDisplay(createPlotDisplayModelForTest("file-a"));
		assert.deepEqual(model?.panes.map(pane => pane.id), ["main"]);
	});

	test("includes inspector point lookup pane only when requested", () => {
		const plotDisplayModel = createPlotDisplayModelForTest("file-a", { includeInspector: true });
		assert.deepEqual(createSearchPointLookupModelFromPlotDisplay(plotDisplayModel)?.panes.map(pane => pane.id), ["main"]);
		assert.deepEqual(createSearchPointLookupModelFromPlotDisplay(plotDisplayModel, {
			includeInspector: true,
		})?.panes.map(pane => pane.id), ["main", "inspector"]);
	});

	test("searches pane model points from query text", () => {
		const service = store.add(createSearchServiceForTest());
		const model = createPlotModel();

		const results = service.searchPointsAtText(model, "1");
		const interpolated = service.searchPointsAtText(model, "0.5");
		service.setInterpolationMode("none");
		const exactOnly = service.searchPointsAtText(model, "0.5");

		assert.equal(results?.[0]?.seriesId, "series-a");
		assert.equal(results?.[0]?.status, "ready");
		assert.equal(results?.[0]?.y, 10);
		assert.equal(interpolated?.[0]?.status, "ready");
		assert.equal(interpolated?.[0]?.y, 5);
		assert.equal(exactOnly?.[0]?.status, "noExactMatch");
		assert.equal(exactOnly?.[0]?.y, null);
		assert.equal(service.searchPointsAtText(model, "not-a-number"), null);
	});

	test("indexes URI structured content records and resolves resource navigation targets", () => {
		const service = store.add(createSearchServiceForTest());
		const resource = URI.file("/workspace/data/data.csv");
		const results = service.searchStructuredContent(createStructuredContentSnapshot(resource), {
			kinds: ["rawCell", "column", "group", "block"],
			scope: "all",
			text: "Alpha",
		});

		assert.deepEqual(
			results.map(result => result.kind),
			["block", "group", "column", "rawCell"],
		);
		const rawCell = results.find(result => result.kind === "rawCell");
		const target = service.resolveResultTarget(rawCell!);
		assert.equal(target?.kind, "tableResourceRange");
		assert.equal(target?.kind === "tableResourceRange" ? target.range.resource.toString() : "", "file:///workspace/data/data.csv");
		assert.deepEqual(target?.kind === "tableResourceRange" ? {
			columnEnd: target.range.columnEnd,
			columnStart: target.range.columnStart,
			rowEnd: target.range.rowEnd,
			rowStart: target.range.rowStart,
			sheetId: target.range.sheetId,
		} : null, {
			columnEnd: 0,
			columnStart: 0,
			rowEnd: 0,
			rowStart: 0,
			sheetId: "Sheet 1",
		});
	});
});

const createSearchServiceForTest = (): SearchService =>
	new SearchService(
		createIdleChartServiceForTest(),
		createIdlePlotServiceForTest(),
	);

const createIdleChartServiceForTest = (): IChartService => ({
	_serviceBrand: undefined,
	getState: () => ({
		legendPopoverContextKey: null,
		visibleDetailPanes: [],
	}),
	getViewInput: () => null,
	onDidChangeChartState: Event.None as IChartService["onDidChangeChartState"],
	onDidChangeChartViewInput: Event.None as Event<void>,
	setLegendPopoverContextKey: () => undefined,
	toggleDetailPane: () => undefined,
	updateViewInput: () => undefined,
});

const createIdlePlotServiceForTest = (): IPlotService => ({
	_serviceBrand: undefined,
	cancelQueuedPlotInspectorDisplayModelPrefetch: () => undefined,
	getCachedCalculatedData: () => null,
	getCachedPlotDisplayModel: () => null,
	getCachedPlotInspectorDisplayModel: () => null,
	getCachedPlotLegendModel: () => null,
	getCalculatedData: () => null,
	getAxisSettings: () => ({}),
	getHiddenLegendKeys: () => [],
	getLegendLabels: () => ({}),
	getPlotDisplayModel: () => null,
	getPlotLegendModel: () => null,
	getPlotMainRenderModel: () => null,
	getState: () => ({
		activePlotType: "iv",
		axisTitleOverridesByKey: {},
		hiddenLegendKeysByPlotKey: {},
		legendLabels: {},
	}),
	onDidChangeCalculatedDataCache: Event.None as IPlotService["onDidChangeCalculatedDataCache"],
	onDidChangePlotDisplayModelCache: Event.None as IPlotService["onDidChangePlotDisplayModelCache"],
	onDidChangePlotState: Event.None as IPlotService["onDidChangePlotState"],
	prefetchPlotDisplayModel: () => undefined,
	prefetchPlotDisplayModels: () => undefined,
	prefetchPlotInspectorDisplayModel: () => undefined,
	setActivePlotType: () => undefined,
	setAxisTitleOverride: () => undefined,
	setAxisUnit: async () => undefined,
	setLegendLabel: () => undefined,
	setYScale: async () => undefined,
	toggleHiddenLegendKey: () => undefined,
});

const createSearchPointLookupModel = (): SearchPointLookupModel => ({
	panes: [
		{
			id: "main",
			model: createPlotModel(),
		},
		{
			id: "inspector",
			model: {
				...createPlotModel(),
				yDomain: [0, 10],
			},
		},
	],
});

const createPlotModel = (
	seriesName = "A",
): PlotMainRenderModel => ({
	axisLabels: null,
	pointsCount: 2,
	seriesList: [{
		data: [
			{ x: 0, y: 0 },
			{ x: 2, y: 20 },
		],
		id: "series-a",
		kind: "iv",
		name: seriesName,
	}],
	xDomain: [0, 2],
	xUnitLabel: "V",
	yDomain: [0, 20],
	yUnitLabel: "A",
});

const createPlotDisplayModelForTest = (
	fileId: string,
	options: {
		readonly includeInspector?: boolean;
		readonly seriesName?: string;
	} = {},
): PlotDisplayModel => {
	const resource = URI.parse(`file:///${fileId}.csv`);
	const chart: PlotDisplayModel["chart"] = {
		defaultXAxisTitle: "X",
		defaultYAxisTitle: "Y",
		model: createPlotModel(options.seriesName),
		plotXFactor: 1,
		plotYFactor: 1,
		xAxisTitle: "X",
		xAxisTitleContext: {
			axis: "x",
			pane: "chart",
			plotType: "iv",
			resource,
		},
		yAxisTitle: "Y",
		yAxisTitleContext: {
			axis: "y",
			pane: "chart",
			plotType: "iv",
			resource,
		},
		yScaleMode: "linear",
	};
	return {
		chart,
		inspector: options.includeInspector
			? {
					...chart,
					model: {
						...chart.model,
						yDomain: [0, 10],
					},
					xAxisTitleContext: {
						...chart.xAxisTitleContext,
						pane: "inspector",
					},
					yAxisTitleContext: {
						...chart.yAxisTitleContext,
						pane: "inspector",
					},
				}
			: null,
		plotType: "iv",
		resource,
		unitControl: null,
	};
};

const createChartServiceForPointLookupTest = (): IChartService => ({
	_serviceBrand: undefined,
	getState: () => ({
		legendPopoverContextKey: null,
		visibleDetailPanes: [],
	}),
	getViewInput: () => ({
		activeFileId: "file-a",
		activeResource: URI.parse("file:///file-a.csv"),
		activePlotType: "iv",
		chartFileOptions: [{ fileId: "file-a", fileName: "file-a.csv" }],
		hasChartData: true,
		shouldMountCharts: true,
	}),
	onDidChangeChartState: Event.None as IChartService["onDidChangeChartState"],
	onDidChangeChartViewInput: Event.None as Event<void>,
	setLegendPopoverContextKey: () => undefined,
	toggleDetailPane: () => undefined,
	updateViewInput: () => undefined,
});

const createPlotServiceForPointLookupTest = ({
	legendLabels,
	onDidChangePlotState,
	plotDisplayInputs,
}: {
	readonly legendLabels: () => Readonly<Record<string, string>>;
	readonly onDidChangePlotState: IPlotService["onDidChangePlotState"];
	readonly plotDisplayInputs: PlotDisplayModelInput[];
}): IPlotService => ({
	_serviceBrand: undefined,
	getCachedPlotDisplayModel: (input: PlotDisplayModelInput) => {
		plotDisplayInputs.push(input);
		return createPlotDisplayModelForTest("file-a", {
			seriesName: input.legendLabels?.["series-a"] ?? "Series A",
		});
	},
	getCachedPlotLegendModel: (): PlotLegendModel => ({
		plotType: "iv",
		resource: URI.parse("file:///file-a.csv"),
		seriesList: [
			{ data: [], id: "series-a", name: "Series A" },
			{ data: [], id: "series-b", name: "Series B" },
		],
	}),
	getHiddenLegendKeys: (
		target: PlotTarget,
		plotType: NonNullable<PlotDisplayModelInput["plotType"]>,
		liveLegendKeys: readonly string[],
	) =>
		target.resource.path.endsWith("/file-a.csv") && plotType === "iv"
			? liveLegendKeys.filter(legendKey => legendKey === "series-b")
			: [],
	getLegendLabels: () => legendLabels(),
	getState: () => ({
		activePlotType: "iv",
		axisTitleOverridesByKey: {},
		hiddenLegendKeysByPlotKey: {},
		legendLabels: {
			"file-a": legendLabels(),
		},
	}),
	onDidChangeCalculatedDataCache: Event.None,
	onDidChangePlotDisplayModelCache: Event.None,
	onDidChangePlotState,
	prefetchPlotDisplayModel: () => undefined,
} as unknown as IPlotService);

const createStructuredContentSnapshot = (
	resource: URI,
): DataResourceStructuredContentSnapshot => ({
	columnCount: 2,
	content: {
		columnCount: 2,
		maxCellLengths: [10, 4],
		rowCount: 2,
		rows: [
			["Alpha cell", "1"],
			["Beta", "2"],
		],
	},
	contentHash: "content-alpha",
	fileName: "alpha.csv",
	resource,
	rowCount: 2,
	sheetId: "Sheet 1",
	sourceModelVersion: 3,
	sourceUri: resource.toString(),
	sourceVersion: 2,
	structuredContent: {
		blocks: [{
			columnCount: 2,
			columns: {
				columns: [],
			},
			confidence: 0.9,
			diagnosticCodes: [],
			family: "iv",
			fileId: resource.toString(),
			groupId: "group-a",
			id: "block-a",
			ivMode: "transfer",
			label: "Alpha block",
			rawTableId: "Sheet 1",
			rowCount: 2,
			source: {
				dataRange: {
					endCol: 1,
					endRow: 1,
					startCol: 0,
					startRow: 0,
				},
				fullRange: {
					endCol: 1,
					endRow: 1,
					startCol: 0,
					startRow: 0,
				},
			},
		}],
		columnProfiles: [{
			headerText: "Alpha voltage",
			kind: "numeric",
			normalizedHeader: "alpha voltage",
			rawCol: 0,
		}],
		diagnostics: [],
		xRangeCandidates: [],
		xGroupCandidates: [],
		dataBlockCandidates: [],
		dependentValueCandidates: [],
		columnTitleSpans: [],
		infoCellNeighborhoods: [],
		bindingCandidates: [],
		semanticRulesFingerprint: "semantic:test",
		groups: [{
			blockIds: ["block-a"],
			fileId: resource.toString(),
			id: "group-a",
			label: "Alpha group",
			rawTableId: "Sheet 1",
		}],
		semanticCandidates: [],
		structure: {
			blockRegions: [],
			dataRegions: [],
			fingerprint: "structured-alpha",
			headerRows: [],
			unitRows: [],
		},
	},
});
