/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Disposable } from "src/cs/base/common/lifecycle";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type {
	CalculationRecordsBackendInput,
	CalculationRecordsBackendOutput,
	ICalculationRecordsBackend,
} from "src/cs/workbench/services/calculation/common/calculationRecordsBackend";
import {
	createCalculatedRecords,
} from "src/cs/workbench/services/calculation/common/calculationRecordBuilder";
import type {
	CalculationRecordsInput,
} from "src/cs/workbench/services/calculation/common/calculationRecords";
import {
	ElectronCalculationRecordsBackend,
	type RustCalculationTransport,
} from "src/cs/workbench/services/calculation/electron-browser/calculationRecordsBackend";

suite("workbench/services/calculation/test/electron-browser/calculationRecordsBackend", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("builds canonical records from Rust calculation analysis", async () => {
		const records = createTransferRecordsInput();
		const fallback = new TestCalculationRecordsBackend();
		let receivedPayload: unknown;
		const rustTransport: RustCalculationTransport = {
			analyze: async (payload) => {
				receivedPayload = payload;
				return {
					durationMs: 3,
					ok: true,
					result: {
						fileId: "calculation-7",
						series: {
							"series-1": {
								baseCurrent: {
									candidateWindows: [],
									ioff: 2,
									ioffWindow: null,
									ion: 10,
									ionIoff: 5,
									ionWindow: null,
									method: "auto",
									xAtIoff: 0,
									xAtIon: 1,
								},
								gm: [{ x: 0.5, y: 42 }],
								ss: [{ x: 0.5, y: 84 }],
								ssFitAuto: {
									strict: {
										ok: true,
										ss: 84,
										x1: 0.25,
										x2: 0.75,
									},
								},
							},
						},
						version: 2,
					},
					source: "rust-pool",
				};
			},
			isSupported: () => true,
		};
		const backend = new ElectronCalculationRecordsBackend(
			fallback,
			rustTransport,
		);

		const output = await backend.calculateRecords({
			inputSignature: "input-11",
			records,
			requestId: 7,
		});
		const gm = output?.curves.find(
			(curve) => curve.curveGeneration === "derived" &&
				curve.curveFamily === "gm",
		);
		const current = output?.metrics.find(
			(metric) => metric.metricFamily === "current",
		);
		const subthreshold = output?.metrics.find(
			(metric) => metric.metricFamily === "subthreshold",
		);

		assert.deepEqual(receivedPayload, {
			fileId: "calculation-7",
			series: [{
				id: "series-1",
				x: [0, 0.5, 1],
				y: [1e-9, 1e-7, 1e-5],
			}],
			sourceFile: {
				curveType: "transfer",
				supportsSs: true,
				xAxisRole: "vg",
				xLabel: "Gate Voltage",
			},
		});
		assert.equal(output?.requestId, 7);
		assert.equal(output?.inputSignature, "input-11");
		assert.deepEqual(gm?.points, [{ x: 0.5, y: 42 }]);
		assert.equal(
			current?.metricFamily === "current" ? current.value.ion : null,
			10,
		);
		assert.equal(
			subthreshold?.metricFamily === "subthreshold"
				? subthreshold.value.ss
				: null,
			84,
		);
		assert.equal(fallback.calculateCount, 1);
		assert.ok(fallback.lastInput?.analysisBySeriesId?.["series-1"]);

		backend.dispose();
	});

	test("falls back to the Web Worker backend for invalid Rust results", async () => {
		const fallback = new TestCalculationRecordsBackend();
		const backend = new ElectronCalculationRecordsBackend(
			fallback,
			{
				analyze: async () => ({
					ok: true,
					result: {
						fileId: "calculation-1",
						series: {},
						version: 99,
					},
					source: "rust-pool",
				}),
				isSupported: () => true,
			},
		);

		const output = await backend.calculateRecords({
			inputSignature: "input-2",
			records: createTransferRecordsInput(),
			requestId: 1,
		});

		assert.equal(output, null);
		assert.equal(fallback.calculateCount, 1);
		backend.dispose();
	});
});

class TestCalculationRecordsBackend
	extends Disposable
	implements ICalculationRecordsBackend {

	public calculateCount = 0;
	public lastInput: CalculationRecordsBackendInput | null = null;

	public isSupported(): boolean {
		return true;
	}

	public async calculateRecords(
		input: CalculationRecordsBackendInput,
	): Promise<CalculationRecordsBackendOutput | null> {
		this.calculateCount += 1;
		this.lastInput = input;
		if (!input.analysisBySeriesId) {
			return null;
		}
		const records = createCalculatedRecords(
			input.records,
			input.analysisBySeriesId,
		);
		return {
			curves: records.curves,
			inputSignature: input.inputSignature,
			metrics: records.metrics,
			requestId: input.requestId,
		};
	}
}

function createTransferRecordsInput(): CalculationRecordsInput {
	return {
		axis: {
			xAxisRole: "vg",
			xLabel: "Gate Voltage",
			xUnit: "V",
			yLabel: "Drain Current",
			yUnit: "A",
		},
		baseCurvesByKey: {
			"base:iv:transfer:series-1": {
				curveFamily: "iv",
				curveGeneration: "base",
				domain: {
					x: [0, 1],
					y: [1e-9, 1e-5],
				},
				ivMode: "transfer",
				lineage: {
					baseFamily: "iv",
					baseSeries: { seriesId: "series-1" },
					curveGeneration: "base",
					ivMode: "transfer",
				},
				points: [
					{ x: 0, y: 1e-9 },
					{ x: 0.5, y: 1e-7 },
					{ x: 1, y: 1e-5 },
				],
				seriesId: "series-1",
				signature: "series-1",
			},
		},
		seriesById: {
			"series-1": {
				groupIndex: 0,
				id: "series-1",
				y: [1e-9, 1e-7, 1e-5],
			},
		},
		seriesOrder: ["series-1"],
	};
}
