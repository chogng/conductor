/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type {
	ExportState,
	ExportViewState,
} from "src/cs/workbench/services/export/common/export";
import type {
	ISessionService,
	SessionSnapshot,
} from "src/cs/workbench/services/session/common/session";
import type { ISettingsService } from "src/cs/workbench/services/settings/common/settings";
import type { IPlotService } from "src/cs/workbench/services/plot/common/plot";
import type { ProcessedEntry } from "src/cs/workbench/services/session/common/sessionTypes";

import { BrowserExportService } from "src/cs/workbench/services/export/browser/exportService";
import { NotificationService } from "src/cs/workbench/services/notification/common/notificationService";

let exportTestStore: ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite> | undefined;

suite("workbench/services/export/browser/exportService", () => {
	exportTestStore = ensureNoDisposablesAreLeakedInTestSuite();

	test("owns export option state outside session", () => {
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
			activeFileId: null,
			snapshot: createEmptySnapshot(),
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
		const snapshot = createEmptySnapshot();
		const service = createExportService(snapshot, {
			"file-a": {
				"series-a": "Plot Label",
			},
		});

		const viewState = service.updateViewState({
			activeFile: {
				fileId: "file-a",
				fileName: "file-a.csv",
				series: [{
					groupIndex: 0,
					id: "series-a",
					name: "Fallback Label",
					y: [1],
				}],
				xGroups: [[0]],
			} as ProcessedEntry,
			activeFileId: "file-a",
			snapshot,
		});

		assert.deepEqual(viewState.curveOptions.map(option => option.label), ["Plot Label"]);
		service.dispose();
	});
});

const createExportService = (
	snapshot: SessionSnapshot = createEmptySnapshot(),
	legendLabelsByFileId: Readonly<Record<string, Readonly<Record<string, string>>>> = {},
): BrowserExportService => {
	const notificationService = exportTestStore?.add(new NotificationService()) ?? new NotificationService();
	const service = new BrowserExportService(
		createSessionServiceStub(snapshot),
		createSettingsServiceStub(),
		createPlotServiceStub(legendLabelsByFileId),
		notificationService,
	);
	exportTestStore?.add(service);
	return service;
};

const createSessionServiceStub = (snapshot: SessionSnapshot): ISessionService => ({
	getSnapshot: () => snapshot,
} as ISessionService);

const createSettingsServiceStub = (): ISettingsService => ({
	getConductorSettings: () => null,
} as ISettingsService);

const createPlotServiceStub = (
	legendLabelsByFileId: Readonly<Record<string, Readonly<Record<string, string>>>>,
): IPlotService => ({
	getFileAxisSettings: () => ({
		xUnitByFileId: {},
		yScaleByFileId: {},
		yUnitByFileId: {},
	}),
	getLegendLabels: (fileId: string) => legendLabelsByFileId[fileId] ?? {},
} as unknown as IPlotService);

const createEmptySnapshot = (): SessionSnapshot => ({
	fileOrder: [],
	filesById: {},
	schemaVersion: 1,
	sessionVersion: 1,
});
