/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Event as BaseEvent } from "src/cs/base/common/event";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
	createCalculationResourceId,
	type CalculationResourceResult,
	type ICalculationService,
} from "src/cs/workbench/services/calculation/common/calculation";
import type {
	ExportState,
	ExportViewState,
} from "src/cs/workbench/services/export/common/export";
import type { ISettingsService } from "src/cs/workbench/services/settings/common/settings";
import type {
	IPlotService,
	PlotAxisOverrides,
	PlotTarget,
} from "src/cs/workbench/services/plot/common/plot";

import { BrowserExportService } from "src/cs/workbench/services/export/browser/exportService";
import { NotificationService } from "src/cs/workbench/services/notification/common/notificationService";

let exportTestStore: ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>;

suite("workbench/services/export/browser/exportService", () => {
	exportTestStore = ensureNoDisposablesAreLeakedInTestSuite();

	test("owns export option state", () => {
		const service = createExportService();
		const states: ExportState[] = [];
		const disposable = exportTestStore.add(service.onDidChangeExportState(state => {
			states.push(state);
		}));

		assert.deepEqual(service.getState(), {
			originMode: "merged",
			canvasScope: "current",
			filteredKind: "output",
			curveMode: "all",
			selectedCurveKeys: [],
			selectedContentKeys: ["iv"],
		});

		service.setOriginMode("workbookSheets");
		service.setCanvasScope(previous => previous === "current" ? "filtered" : "current");
		service.setFilteredKind("transfer");
		service.setCurveMode("select");
		service.setSelectedCurveKeys(["curve-a"]);
		service.setContentKeys(["gm", "gm", "ss"]);

		assert.deepEqual(service.getState(), {
			originMode: "workbookSheets",
			canvasScope: "filtered",
			filteredKind: "transfer",
			curveMode: "select",
			selectedCurveKeys: ["curve-a"],
			selectedContentKeys: ["gm", "ss"],
		});
		assert.deepEqual(states, [
			{
				originMode: "workbookSheets",
				canvasScope: "current",
				filteredKind: "output",
				curveMode: "all",
				selectedCurveKeys: [],
				selectedContentKeys: ["iv"],
			},
			{
				originMode: "workbookSheets",
				canvasScope: "filtered",
				filteredKind: "output",
				curveMode: "all",
				selectedCurveKeys: [],
				selectedContentKeys: ["iv"],
			},
			{
				originMode: "workbookSheets",
				canvasScope: "filtered",
				filteredKind: "transfer",
				curveMode: "all",
				selectedCurveKeys: [],
				selectedContentKeys: ["iv"],
			},
			{
				originMode: "workbookSheets",
				canvasScope: "filtered",
				filteredKind: "transfer",
				curveMode: "select",
				selectedCurveKeys: [],
				selectedContentKeys: ["iv"],
			},
			{
				originMode: "workbookSheets",
				canvasScope: "filtered",
				filteredKind: "transfer",
				curveMode: "select",
				selectedCurveKeys: ["curve-a"],
				selectedContentKeys: ["iv"],
			},
			{
				originMode: "workbookSheets",
				canvasScope: "filtered",
				filteredKind: "transfer",
				curveMode: "select",
				selectedCurveKeys: ["curve-a"],
				selectedContentKeys: ["gm", "ss"],
			},
		]);

		disposable.dispose();
		service.dispose();
	});

	test("skips duplicate export option notifications", () => {
		const service = createExportService();
		let changeCount = 0;
		const disposable = exportTestStore.add(service.onDidChangeExportState(() => {
			changeCount += 1;
		}));

		service.setOriginMode("merged");
		service.setCanvasScope("current");
		service.setFilteredKind("output");
		service.setCurveMode("all");
		service.setSelectedCurveKeys([]);
		service.setContentKeys(["iv"]);

		assert.equal(changeCount, 0);

		disposable.dispose();
		service.dispose();
	});

	test("normalizes and syncs selected export curve keys", () => {
		const service = createExportService();

		service.syncSelectedCurveKeys(["a", "b", "a"]);
		assert.deepEqual(service.getState().selectedCurveKeys, ["a", "b"]);

		service.setSelectedCurveKeys([" b ", "", "c", "b"]);
		assert.deepEqual(service.getState().selectedCurveKeys, ["b", "c"]);

		service.syncSelectedCurveKeys(["a", "b"]);
		assert.deepEqual(service.getState().selectedCurveKeys, ["b"]);
	});

	test("publishes export view state from the service", () => {
		const service = createExportService();
		const viewStates: ExportViewState[] = [];
		const disposable = exportTestStore.add(service.onDidChangeExportViewState(state => {
			viewStates.push(state);
		}));

		const viewState = service.updateViewState({
			activeResource: null,
			resources: [],
		});

		assert.deepEqual(viewState, {
			curveOptions: [],
			hasMixedExportYScales: false,
			scopedFileIds: [],
			showFilteredCanvasKindSelect: false,
		});
		assert.deepEqual(service.getViewState(), viewState);
		assert.deepEqual(viewStates, [viewState]);

		service.setCanvasScope("filtered");
		assert.deepEqual(service.getViewState(), {
			...viewState,
			showFilteredCanvasKindSelect: true,
		});

		disposable.dispose();
		service.dispose();
	});

	test("resolves curve labels from plot owner state", () => {
		const result = createCalculationResult();
		const fileId = createCalculationResourceId(result.resource, result.sheetId);
		const service = createExportService([result], {
			[fileId]: {
				"series-a": "Plot Label",
			},
		});

		const viewState = service.updateViewState({
			activeResource: result.resource,
			resources: [{ resource: result.resource }],
		});

		assert.deepEqual(viewState.curveOptions.map(option => option.label), ["Plot Label"]);
		service.dispose();
	});

	test("uses Plot axis settings with calculation resource files", () => {
		const results = [
			createCalculationResult("file-a", "transfer"),
			createCalculationResult("file-b", "output"),
		];
		const fileBId = createCalculationResourceId(results[1].resource, results[1].sheetId);
		const service = createExportService(results, {}, {
			[fileBId]: { yScale: "log" },
		});

		service.setCanvasScope("all");
		const viewState = service.updateViewState({
			activeResource: results[0].resource,
			resources: results.map(result => ({ resource: result.resource })),
		});

		assert.deepEqual(viewState.scopedFileIds, results.map(result =>
			createCalculationResourceId(result.resource, result.sheetId)
		));
		assert.equal(viewState.hasMixedExportYScales, true);
		service.dispose();
	});
});

const createExportService = (
	results: readonly CalculationResourceResult[] = [],
	legendLabelsByFileId: Readonly<Record<string, Readonly<Record<string, string>>>> = {},
	axisSettings: Readonly<Record<string, PlotAxisOverrides>> = {},
): BrowserExportService => {
	const notificationService = exportTestStore.add(new NotificationService());
	const service = new BrowserExportService(
		createCalculationServiceStub(results),
		createSettingsServiceStub(),
		createPlotServiceStub(legendLabelsByFileId, axisSettings),
		notificationService,
	);
	exportTestStore.add(service);
	return service;
};

const createCalculationServiceStub = (
	results: readonly CalculationResourceResult[],
): ICalculationService => ({
	getResourceResult: (resource: URI, sheetId?: string | null) => results.find(result =>
		createCalculationResourceId(result.resource, result.sheetId) ===
		createCalculationResourceId(resource, sheetId)
	) ?? null,
	onDidChangeResourceCalculationResult: BaseEvent.None,
	prioritizeResource: () => undefined,
} as unknown as ICalculationService);

const createSettingsServiceStub = (): ISettingsService => ({
	getConductorSettings: () => null,
} as ISettingsService);

const createPlotServiceStub = (
	legendLabelsByFileId: Readonly<Record<string, Readonly<Record<string, string>>>>,
	axisSettings: Readonly<Record<string, PlotAxisOverrides>>,
): IPlotService => ({
	getCachedPlotRenderModel: () => null,
	getAxisOverrides: (target: PlotTarget) =>
		axisSettings[createCalculationResourceId(target.resource, target.sheetId)] ?? {},
	getLegendLabels: (target: PlotTarget) => {
		const fileId = createCalculationResourceId(target.resource, target.sheetId);
		return legendLabelsByFileId[fileId] ?? {};
	},
	onDidChangeCalculatedDataCache: BaseEvent.None,
} as unknown as IPlotService);

const createCalculationResult = (
	fileId = "file-a",
	ivMode: "transfer" | "output" = "transfer",
): CalculationResourceResult => ({
	axis: {
		xAxisRole: ivMode === "transfer" ? "vg" : "vd",
		xLabel: ivMode === "transfer" ? "Gate Voltage" : "Drain Voltage",
		xUnit: "V",
		yLabel: "Drain Current",
		yUnit: "A",
	},
	completedAt: 1,
	inputSignature: `input-${fileId}`,
	metricsByKey: {},
	requestSignature: `request-${fileId}`,
	resource: URI.parse(`test:/${fileId}.csv`),
	seriesById: {
		"series-a": {
			groupIndex: 0,
			id: "series-a",
			name: "Fallback Label",
			y: [1],
		},
	},
	seriesOrder: ["series-a"],
	curvesByKey: {
		[`base:iv:${ivMode}:series-a`]: {
			curveFamily: "iv",
			curveGeneration: "base",
			ivMode,
			lineage: {
				baseFamily: "iv",
				baseSeries: {
					seriesId: "series-a",
				},
				curveGeneration: "base",
				ivMode,
			},
			points: [{ x: 0, y: 1 }],
			seriesId: "series-a",
			signature: "series-a",
		},
	},
	sourceModelVersion: 1,
	sourceVersion: 1,
});
