/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { SearchService } from "src/cs/workbench/services/search/browser/searchService";
import type { SearchState } from "src/cs/workbench/services/search/common/search";
import type { PlotMainRenderModel } from "src/cs/workbench/services/plot/common/plotModel";
import type { SessionSnapshot } from "src/cs/workbench/services/session/common/session";
import type { FileRecord } from "src/cs/workbench/services/session/common/sessionModel";

suite("workbench/services/search/test/browser/searchService", () => {
	test("owns search query state outside session", () => {
		const service = new SearchService();
		const states: SearchState[] = [];
		const disposable = service.onDidChangeSearchState(state => {
			states.push(state);
		});

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
			},
			selectedResultId: "result-a",
		});
		assert.equal(states.length, 3);

		disposable.dispose();
		service.dispose();
	});

	test("skips duplicate search state notifications", () => {
		const service = new SearchService();
		let changeCount = 0;
		const disposable = service.onDidChangeSearchState(() => {
			changeCount += 1;
		});

		service.setQuery({
			text: "",
			scope: "curve",
			kinds: ["curve"],
			caseSensitive: false,
		});
		service.setSelectedResultId(null);

		assert.equal(changeCount, 0);

		disposable.dispose();
		service.dispose();
	});

	test("owns current plot model input outside the view", () => {
		const service = new SearchService();
		const models: Array<PlotMainRenderModel | null> = [];
		const disposable = service.onDidChangeSearchPlotModel(model => {
			models.push(model);
		});
		const model = createPlotModel();

		service.setPlotModel(model);
		service.setPlotModel(model);
		service.setPlotModel(null);

		assert.equal(service.getPlotModel(), null);
		assert.deepEqual(models, [model, null]);

		disposable.dispose();
		service.dispose();
	});

	test("searches plot model points from query text", () => {
		const service = new SearchService();
		const model = createPlotModel();

		const results = service.searchPlotModelAtText(model, "1");

		assert.equal(results?.[0]?.seriesId, "series-a");
		assert.equal(results?.[0]?.status, "ready");
		assert.equal(results?.[0]?.y, 10);
		assert.equal(service.searchPlotModelAtText(model, "not-a-number"), null);
		service.dispose();
	});

	test("indexes session snapshot records and resolves navigation targets", () => {
		const service = new SearchService();
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
		service.dispose();
	});
});

const createPlotModel = (): PlotMainRenderModel => ({
	axisLabels: null,
	pointsCount: 2,
	seriesList: [{
		data: [
			{ x: 0, y: 0 },
			{ x: 2, y: 20 },
		],
		id: "series-a",
		kind: "iv",
		name: "A",
	}],
	xDomain: [0, 2],
	xUnitLabel: "V",
	yDomain: [0, 20],
	yUnitLabel: "A",
});

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
	assessmentsByRawTableId: {},
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
	templateRunsById: {},
});
