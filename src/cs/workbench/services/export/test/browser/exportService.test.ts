/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import type {
	ExportState,
	ExportViewState,
} from "src/cs/workbench/services/export/common/export";
import type { SessionSnapshot } from "src/cs/workbench/services/session/common/session";

import { BrowserExportService } from "src/cs/workbench/services/export/browser/exportService";

suite("workbench/services/export/browser/exportService", () => {
	test("owns export option state outside session", () => {
		const service = new BrowserExportService();
		const states: ExportState[] = [];
		const disposable = service.onDidChangeExportState(state => {
			states.push(state);
		});

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
		const service = new BrowserExportService();
		let changeCount = 0;
		const disposable = service.onDidChangeExportState(() => {
			changeCount += 1;
		});

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
		const service = new BrowserExportService();

		service.syncSelectedCurveKeys(["a", "b", "a"]);
		assert.deepEqual(service.getState().selectedCurveKeys, ["a", "b"]);

		service.setSelectedCurveKeys([" b ", "", "c", "b"]);
		assert.deepEqual(service.getState().selectedCurveKeys, ["b", "c"]);

		service.syncSelectedCurveKeys(["a", "b"]);
		assert.deepEqual(service.getState().selectedCurveKeys, ["b"]);
	});

	test("publishes export view state from the service", () => {
		const service = new BrowserExportService();
		const viewStates: ExportViewState[] = [];
		const disposable = service.onDidChangeExportViewState(state => {
			viewStates.push(state);
		});

		const viewState = service.updateViewState({
			activeFileId: null,
			snapshot: createEmptySnapshot(),
		});

		assert.deepEqual(viewState, {
			curveOptions: [],
			hasMixedExportYScales: false,
			scopedFileIds: [],
			showFilteredCanvasKindSelect: true,
		});
		assert.deepEqual(service.getViewState(), viewState);
		assert.deepEqual(viewStates, [viewState]);

		disposable.dispose();
		service.dispose();
	});

	test("runs Origin ZIP export from stored execution context", async () => {
		const service = new BrowserExportService();
		let fallbackCount = 0;
		const toastMessages: string[] = [];

		service.updateOriginExportExecutionContext({
			buildCsvExportRequest: () => null,
			buildPayloads: () => {
				throw new Error("unused");
			},
			exportOriginZipFallback: async () => {
				fallbackCount += 1;
				return {
					canvasCount: 1,
					curveCount: 2,
					mode: "merged",
					zipName: "origin.zip",
				};
			},
			originAxisSettings: null,
			originChartXRangeRef: { current: null },
			originChartYRangeRef: { current: null },
			originOpenPlotOptions: null,
			showToast: (message) => {
				toastMessages.push(message);
			},
		});

		await service.exportOriginZip();

		assert.equal(fallbackCount, 1);
		assert.equal(toastMessages.length, 1);
		service.dispose();
	});
});

const createEmptySnapshot = (): SessionSnapshot => ({
	fileOrder: [],
	filesById: {},
	schemaVersion: 1,
	sessionVersion: 1,
});
