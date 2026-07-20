/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter, Event } from "src/cs/base/common/event";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type {
	CalculationResourceResult,
	ICalculationService,
} from "src/cs/workbench/services/calculation/common/calculation";
import { createCalculatedMetricRecords } from "src/cs/workbench/services/calculation/common/calculationMetricRecordBuilder";
import type { CalculationRecordsInput } from "src/cs/workbench/services/calculation/common/calculationRecords";
import { ParametersService } from "src/cs/workbench/services/parameters/browser/parametersService";
import type { ParametersViewState } from "src/cs/workbench/services/parameters/common/parameterModel";

suite("workbench/services/parameters/test/browser/parametersService", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("publishes the empty state without a resource", () => {
		const service = store.add(new ParametersService(createCalculationService()));
		const viewStates: ParametersViewState[] = [];
		store.add(service.onDidChangeParametersViewState(state => viewStates.push(state)));

		const viewState = service.updateViewState({});

		assert.deepEqual(viewState, {
			kind: "empty",
			message: "parameters.empty.noData",
		});
		assert.deepEqual(service.getViewState(), viewState);
		assert.deepEqual(viewStates, [viewState]);
	});

	test("requests a missing Calculation result and publishes it when ready", () => {
		const resource = URI.file("/data/Transfer.csv");
		const changes = store.add(new Emitter<{ readonly resource: URI; readonly sheetId?: string | null }>());
		const priorities: string[] = [];
		let result: CalculationResourceResult | null = null;
		const service = store.add(new ParametersService(createCalculationService(
			() => result,
			changes.event,
			(target) => priorities.push(target.toString()),
		)));
		const viewStates: ParametersViewState[] = [];
		store.add(service.onDidChangeParametersViewState(state => viewStates.push(state)));

		const pending = service.updateViewState({
			resource,
			sheetId: "sheet-a",
		});

		assert.equal(pending.kind, "empty");
		assert.deepEqual(priorities, [resource.toString()]);

		result = createCalculationResourceResult(resource, "sheet-a", 1);
		changes.fire({
			resource: URI.parse(resource.toString()),
			sheetId: "sheet-b",
		});
		assert.equal(service.getViewState().kind, "empty");

		changes.fire({
			resource: URI.parse(resource.toString()),
			sheetId: "sheet-a",
		});

		assert.equal(service.getViewState().kind, "table");
		assert.deepEqual(viewStates.map(state => state.kind), ["empty", "table"]);
	});

	test("reads parameter records from the Calculation resource result", () => {
		const resource = URI.file("/data/Transfer.csv");
		const result = createCalculationResourceResult(resource, "sheet-a", 1);
		const service = store.add(new ParametersService(createCalculationService(() => result)));

		const viewState = service.updateViewState({
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

		const first = service.updateViewState({ resource });
		const second = service.updateViewState({ resource });

		assert.equal(second, first);
		assert.deepEqual(viewStates, [first]);
	});

	test("publishes again when the Calculation input signature changes", () => {
		const resource = URI.file("/data/Transfer.csv");
		let result = createCalculationResourceResult(resource, null, 1);
		const service = store.add(new ParametersService(createCalculationService(() => result)));
		const viewStates: ParametersViewState[] = [];
		store.add(service.onDidChangeParametersViewState(state => viewStates.push(state)));

		const first = service.updateViewState({ resource });
		result = createCalculationResourceResult(resource, null, 2);
		const second = service.updateViewState({ resource });

		assert.notEqual(second, first);
		assert.deepEqual(viewStates, [first, second]);
	});
});

function createCalculationService(
	getResult: () => CalculationResourceResult | null = () => null,
	onDidChangeResourceCalculationResult: ICalculationService["onDidChangeResourceCalculationResult"] =
		Event.None as ICalculationService["onDidChangeResourceCalculationResult"],
	onPrioritize: (resource: URI, sheetId?: string | null) => void = () => undefined,
): ICalculationService {
	return {
		_serviceBrand: undefined,
		getResourceResult: () => getResult(),
		onDidChangeResourceCalculationResult,
		prioritizeResource: onPrioritize,
	};
}

function createCalculationResourceResult(
	resource: URI,
	sheetId: string | null,
	version: number,
): CalculationResourceResult {
	const input = createProcessedRecordsInput();
	const metricRecords = createCalculatedMetricRecords(input);
	const metricsByKey = Object.fromEntries(
		metricRecords.map(metric => [metric.key, metric]),
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
		curvesByKey: input.baseCurvesByKey,
		inputSignature: `calculation-${version}`,
		metricsByKey,
		requestSignature: `request-${version}`,
		resource,
		seriesById: input.seriesById,
		seriesOrder: input.seriesOrder,
		sheetId,
		sourceModelVersion: version,
		sourceVersion: version,
	};
}

function createProcessedRecordsInput(): CalculationRecordsInput {
	return {
		axis: {
			xAxisRole: "vg",
			xLabel: "Voltage",
			xUnit: "V",
			yLabel: "Current",
			yUnit: "A",
		},
		seriesById: {
			"series-a": {
				groupIndex: 0,
				id: "series-a",
				name: "A",
				y: [1e-12, 1e-9, 1e-6],
				yCol: 2,
			},
		},
		seriesOrder: ["series-a"],
		baseCurvesByKey: {
			"base:iv:transfer:series-a": {
				curveFamily: "iv",
				curveGeneration: "base",
				domain: {
					x: [0, 2],
					y: [1e-12, 1e-6],
				},
				ivMode: "transfer",
				lineage: {
					baseFamily: "iv",
					baseSeries: {
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
	};
}
