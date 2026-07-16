/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Event } from "src/cs/base/common/event";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type {
	CalculationResourceResult,
	ICalculationService,
} from "src/cs/workbench/services/calculation/common/calculation";
import { createCalculatedMetricRecordsByFile } from "src/cs/workbench/services/calculation/common/calculationMetricRecordBuilder";
import { ParametersService } from "src/cs/workbench/services/parameters/browser/parametersService";
import type { ParametersViewState } from "src/cs/workbench/services/parameters/common/parameterModel";
import type {
	FileRecord,
	MetricKey,
} from "src/cs/workbench/services/session/common/sessionModel";

suite("workbench/services/parameters/test/browser/parametersService", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("publishes the empty state without a resource", () => {
		const service = store.add(new ParametersService(createCalculationService()));
		const viewStates: ParametersViewState[] = [];
		store.add(service.onDidChangeParametersViewState(state => viewStates.push(state)));

		const viewState = service.updateViewState({ fileId: null });

		assert.deepEqual(viewState, {
			kind: "empty",
			message: "parameters.empty.noData",
		});
		assert.deepEqual(service.getViewState(), viewState);
		assert.deepEqual(viewStates, [viewState]);
	});

	test("reads parameter records from the Calculation resource result", () => {
		const resource = URI.file("/data/Transfer.csv");
		const result = createCalculationResourceResult(resource, "sheet-a", 1);
		const service = store.add(new ParametersService(createCalculationService(() => result)));

		const viewState = service.createViewState({
			fileId: "ignored-file-id",
			resource,
			sheetId: "sheet-a",
		});

		assert.equal(viewState.kind, "table");
		if (viewState.kind === "table") {
			assert.equal(viewState.gmMetricHeader, "gm");
			assert.equal(viewState.showTransferMetrics, true);
			assert.equal(viewState.rows[0]?.id, "series-a");
			assert.equal(viewState.rows[0]?.name, "A");
			assert.notEqual(viewState.rows[0]?.gmMaxAbs, null);
			assert.notEqual(viewState.rows[0]?.ion, null);
		}
	});

	test("does not publish an unchanged Calculation input signature", () => {
		const resource = URI.file("/data/Transfer.csv");
		const result = createCalculationResourceResult(resource, null, 1);
		const service = store.add(new ParametersService(createCalculationService(() => result)));
		const viewStates: ParametersViewState[] = [];
		store.add(service.onDidChangeParametersViewState(state => viewStates.push(state)));

		const first = service.updateViewState({ fileId: null, resource });
		const second = service.updateViewState({ fileId: null, resource });

		assert.equal(second, first);
		assert.deepEqual(viewStates, [first]);
	});

	test("publishes again when the Calculation input signature changes", () => {
		const resource = URI.file("/data/Transfer.csv");
		let result = createCalculationResourceResult(resource, null, 1);
		const service = store.add(new ParametersService(createCalculationService(() => result)));
		const viewStates: ParametersViewState[] = [];
		store.add(service.onDidChangeParametersViewState(state => viewStates.push(state)));

		const first = service.updateViewState({ fileId: null, resource });
		result = createCalculationResourceResult(resource, null, 2);
		const second = service.updateViewState({ fileId: null, resource });

		assert.notEqual(second, first);
		assert.deepEqual(viewStates, [first, second]);
	});
});

function createCalculationService(
	getResult: () => CalculationResourceResult | null = () => null,
): ICalculationService {
	return {
		_serviceBrand: undefined,
		getResourceResult: () => getResult(),
		onDidChangeResourceCalculationResult:
			Event.None as ICalculationService["onDidChangeResourceCalculationResult"],
		prioritizeResource: () => undefined,
	};
}

function createCalculationResourceResult(
	resource: URI,
	sheetId: string | null,
	version: number,
): CalculationResourceResult {
	const file = createProcessedFileRecord();
	const metricRecords = createCalculatedMetricRecordsByFile(
		{ [file.id]: file },
		[file.id],
	);
	const metricsByKey = Object.fromEntries(
		(metricRecords[file.id] ?? []).map(metric => [metric.key, metric]),
	);
	const metricsBySeriesId = Object.values(metricsByKey).reduce<Record<string, MetricKey[]>>(
		(result, metric) => {
			result[metric.seriesId] = [...(result[metric.seriesId] ?? []), metric.key];
			return result;
		},
		{},
	);
	return {
		axis: {
			xAxisRole: "vg",
			xLabel: "Voltage",
			xUnit: "V",
			yLabel: "Current",
			yUnit: "A",
		},
		completedAt: version,
		curvesByKey: file.curvesByKey,
		inputSignature: `calculation-${version}`,
		metricsByKey,
		requestSignature: `request-${version}`,
		resource,
		seriesById: file.seriesById,
		seriesOrder: file.seriesOrder,
		sheetId,
		sourceModelVersion: version,
		sourceVersion: version,
	};
}

function createProcessedFileRecord(): FileRecord {
	return {
		id: "resource-file",
		kind: "unknown",
		name: "Transfer.csv",
		raw: {
			fileId: "resource-file",
			fileName: "Transfer.csv",
			tableOrder: [],
			tablesById: {},
		},
		rawTableVersionsById: {},
		seriesById: {
			"series-a": {
				fileId: "resource-file",
				groupIndex: 0,
				id: "series-a",
				name: "A",
				y: [1e-12, 1e-9, 1e-6],
				yCol: 2,
			},
		},
		seriesOrder: ["series-a"],
		curvesByKey: {
			"base:iv:transfer:series-a": {
				curveFamily: "iv",
				curveGeneration: "base",
				domain: {
					x: [0, 2],
					y: [1e-12, 1e-6],
				},
				fileId: "resource-file",
				ivMode: "transfer",
				lineage: {
					baseFamily: "iv",
					baseSeries: {
						fileId: "resource-file",
						seriesId: "series-a",
					},
					curveGeneration: "base",
					ivMode: "transfer",
				},
				points: [
					{ x: 0, y: 1e-12 },
					{ x: 1, y: 1e-9 },
					{ x: 2, y: 1e-6 },
				],
				seriesId: "series-a",
				signature: "series-a",
			},
		},
		metricsByKey: {},
		metricsBySeriesId: {},
	};
}
