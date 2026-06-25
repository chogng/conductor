/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter, Event } from "src/cs/base/common/event";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { createSearchPointLookupModelFromPlotDisplay } from "src/cs/workbench/services/search/browser/searchModel";
import { SearchService } from "src/cs/workbench/services/search/browser/searchService";
import type { SearchPointLookupModel, SearchState } from "src/cs/workbench/services/search/common/search";
import type { IChartService } from "src/cs/workbench/services/chart/common/chart";
import type { IPlotService, PlotDisplayModel, PlotDisplayModelInput, PlotLegendModel } from "src/cs/workbench/services/plot/common/plot";
import type { PlotMainRenderModel } from "src/cs/workbench/services/plot/common/plotModel";
import type { ISessionService, SessionSnapshot } from "src/cs/workbench/services/session/common/session";
import type { FileRecord } from "src/cs/workbench/services/session/common/sessionModel";

suite("workbench/services/search/test/browser/searchService", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("owns search query state outside session", () => {
		const service = store.add(createSearchServiceForTest());
		const states: SearchState[] = [];
		store.add(service.onDidChangeSearchState(state => {
			states.push(state);
		}));

		service.setQueryText("1.25");
		service.updateQuery({
			scope: "metric",
			kinds: ["metric", "curve", "metric"],
			caseSensitive: true,
		});
		service.setSelectedResultId(" result-a ");

		assert.deepEqual(service.getState(), {
			query: {
				text: "1.25",
				scope: "metric",
				kinds: ["metric", "curve"],
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
			scope: "curve",
			kinds: ["curve"],
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
			createSessionServiceForPointLookupTest(),
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
			legendLabelsByFileId: {
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

	test("indexes session snapshot records and resolves navigation targets", () => {
		const service = store.add(createSearchServiceForTest());
		const results = service.searchSnapshot(createSnapshot(), {
			kinds: ["rawCell", "curve", "metric", "block"],
			scope: "all",
			text: "Alpha",
		});

		assert.deepEqual(
			results.map(result => result.kind),
			["curve", "metric", "block", "rawCell"],
		);
		const rawCell = results.find(result => result.kind === "rawCell");
		assert.deepEqual(service.resolveResultTarget(rawCell!), {
			kind: "rawTableRange",
			range: {
				columnEnd: 0,
				columnStart: 0,
				fileId: "file-a",
				rawTableId: "sheet-a",
				rowEnd: 0,
				rowStart: 0,
			},
		});
		assert.deepEqual(service.resolveResultTarget(results[0]), {
			curveKey: "base:iv:transfer:series-a",
			fileId: "file-a",
			kind: "curve",
		});
	});
});

const createSearchServiceForTest = (): SearchService =>
	new SearchService(
		createIdleChartServiceForTest(),
		createIdlePlotServiceForTest(),
		createIdleSessionServiceForTest(),
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
	getFileAxisSettings: () => ({
		xUnitByFileId: {},
		yScaleByFileId: {},
		yUnitByFileId: {},
	}),
	getHiddenLegendKeys: () => [],
	getLegendLabels: () => ({}),
	getPlotDisplayModel: () => null,
	getPlotLegendModel: () => null,
	getPlotMainRenderModel: () => null,
	getState: () => ({
		activePlotType: "iv",
		axisTitleOverridesByKey: {},
		hiddenLegendKeysByPlotKey: {},
		legendLabelsByFileId: {},
	}),
	onDidChangeCalculatedDataCache: Event.None as IPlotService["onDidChangeCalculatedDataCache"],
	onDidChangePlotDisplayModelCache: Event.None as IPlotService["onDidChangePlotDisplayModelCache"],
	onDidChangePlotState: Event.None as IPlotService["onDidChangePlotState"],
	prefetchCalculatedData: () => undefined,
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

const createIdleSessionServiceForTest = (): ISessionService => ({
	_serviceBrand: undefined,
	getSnapshot: () => createSnapshot(),
	onDidChangeSession: Event.None,
} as unknown as ISessionService);

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
	const chart: PlotDisplayModel["chart"] = {
		defaultXAxisTitle: "X",
		defaultYAxisTitle: "Y",
		model: createPlotModel(options.seriesName),
		plotXFactor: 1,
		plotYFactor: 1,
		xAxisTitle: "X",
		xAxisTitleContext: {
			axis: "x",
			fileId,
			pane: "chart",
			plotType: "iv",
		},
		yAxisTitle: "Y",
		yAxisTitleContext: {
			axis: "y",
			fileId,
			pane: "chart",
			plotType: "iv",
		},
		yScaleMode: "linear",
	};
	return {
		chart,
		fileId,
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
		return createPlotDisplayModelForTest(String(input.fileId ?? ""), {
			seriesName: input.legendLabels?.["series-a"] ?? "Series A",
		});
	},
	getCachedPlotLegendModel: (): PlotLegendModel => ({
		fileId: "file-a",
		plotType: "iv",
		seriesList: [
			{ data: [], id: "series-a", name: "Series A" },
			{ data: [], id: "series-b", name: "Series B" },
		],
	}),
	getHiddenLegendKeys: (
		fileId: string,
		plotType: NonNullable<PlotDisplayModelInput["plotType"]>,
		liveLegendKeys: readonly string[],
	) =>
		fileId === "file-a" && plotType === "iv"
			? liveLegendKeys.filter(legendKey => legendKey === "series-b")
			: [],
	getLegendLabels: () => legendLabels(),
	getState: () => ({
		activePlotType: "iv",
		axisTitleOverridesByKey: {},
		hiddenLegendKeysByPlotKey: {},
		legendLabelsByFileId: {
			"file-a": legendLabels(),
		},
	}),
	onDidChangeCalculatedDataCache: Event.None,
	onDidChangePlotDisplayModelCache: Event.None,
	onDidChangePlotState,
	prefetchPlotDisplayModel: () => undefined,
} as unknown as IPlotService);

const createSessionServiceForPointLookupTest = (): ISessionService => ({
	getSnapshot: () => createSnapshot(),
	onDidChangeSession: Event.None,
} as unknown as ISessionService);

const createSnapshot = (): SessionSnapshot => ({
	fileOrder: ["file-a"],
	filesById: {
		"file-a": createFileRecord(),
	},
	schemaVersion: 1,
	sessionVersion: 1,
});

const createFileRecord = (): FileRecord => ({
	curvesByKey: {
		"base:iv:transfer:series-a": {
			curveFamily: "iv",
			curveGeneration: "base",
			fileId: "file-a",
			ivMode: "transfer",
			lineage: {
				baseFamily: "iv",
				baseSeries: {
					fileId: "file-a",
					seriesId: "series-a",
				},
				curveGeneration: "base",
				ivMode: "transfer",
			},
			points: [{ x: 0, y: 1 }],
			seriesId: "series-a",
			signature: "curve-a",
		},
	},
	id: "file-a",
	kind: "unknown",
	measurementBlockOrder: ["block-a"],
	measurementBlocksById: {
		"block-a": {
			columnCount: 2,
			columns: { columns: [] },
			confidence: 0.9,
			diagnosticCodes: [],
			family: "iv",
			fileId: "file-a",
			id: "block-a",
			ivMode: "transfer",
			label: "Alpha block",
			rawTableId: "sheet-a",
			rowCount: 1,
			source: {
				fullRange: {
					endCol: 1,
					endRow: 0,
					startCol: 0,
					startRow: 0,
				},
			},
		},
	},
	metricsByKey: {
		"current:series-a:auto": {
			algorithm: { id: "test" },
			contextKey: "auto",
			fileId: "file-a",
			inputCurves: [],
			inputSignatures: [],
			key: "current:series-a:auto",
			metricFamily: "current",
			seriesId: "series-a",
			value: {
				candidateWindows: [],
				ioff: null,
				ioffWindow: null,
				ion: 1,
				ionIoff: null,
				ionWindow: null,
				method: "auto",
				xAtIoff: null,
				xAtIon: 0,
			},
		},
	},
	name: "alpha.csv",
	raw: {
		fileId: "file-a",
		fileName: "alpha.csv",
		tableOrder: ["sheet-a"],
		tablesById: {
			"sheet-a": {
				columnCount: 2,
				fileId: "file-a",
				maxCellLengths: [5, 1],
				rowCount: 1,
				rowStore: {
					kind: "memory",
					rows: [["Alpha cell", 1]],
				},
				sheetId: "sheet-a",
				sheetName: "Data",
				tableKey: "sheet-a",
			},
		},
	},
	rawTableVersionsById: {},
	tableModelByRawTableId: {},
	seriesById: {
		"series-a": {
			fileId: "file-a",
			groupIndex: 0,
			id: "series-a",
			name: "Alpha series",
			y: [1],
		},
	},
	seriesOrder: ["series-a"],
});
