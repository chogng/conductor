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
	createCalculatedRecordsByFile,
} from "src/cs/workbench/services/calculation/common/calculationRecordBuilder";
import {
	ElectronCalculationRecordsBackend,
	type RustCalculationTransport,
} from "src/cs/workbench/services/calculation/electron-browser/calculationRecordsBackend";
import {
	addSliceOutputToRecordsForTest,
	createFileRecordsForTest,
} from "src/cs/workbench/services/session/test/common/sessionTestRecords";

suite("workbench/services/calculation/test/electron-browser/calculationRecordsBackend", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("builds canonical records from Rust calculation analysis", async () => {
		const records = addSliceOutputToRecordsForTest(
			createFileRecordsForTest([{
				fileId: "file-a",
				fileName: "Transfer.csv",
			}]),
			{
				curveType: "transfer",
				fileId: "file-a",
				fileName: "Transfer.csv",
				series: [{
					groupIndex: 0,
					id: "series-1",
					y: [1e-9, 1e-7, 1e-5],
				}],
				xAxisRole: "vg",
				xGroups: [[0, 0.5, 1]],
			},
		);
		const file = records.filesById["file-a"];
		const fallback = new TestCalculationRecordsBackend();
		let receivedPayload: unknown;
		const rustTransport: RustCalculationTransport = {
			analyze: async (payload) => {
				receivedPayload = payload;
				return {
					durationMs: 3,
					ok: true,
					result: {
						fileId: "file-a",
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
			file,
			inputSignature: "input-11",
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
			fileId: "file-a",
			series: [{
				id: "series-1",
				x: [0, 0.5, 1],
				y: [1e-9, 1e-7, 1e-5],
			}],
			sourceFile: {
				curveType: "transfer",
				supportsSs: true,
				xAxisRole: "vg",
				xLabel: undefined,
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
		const records = addSliceOutputToRecordsForTest(
			createFileRecordsForTest([{
				fileId: "file-a",
				fileName: "Transfer.csv",
			}]),
			{
				curveType: "transfer",
				fileId: "file-a",
				fileName: "Transfer.csv",
				series: [{
					groupIndex: 0,
					id: "series-1",
					y: [1e-9, 1e-7, 1e-5],
				}],
				xAxisRole: "vg",
				xGroups: [[0, 0.5, 1]],
			},
		);
		const fallback = new TestCalculationRecordsBackend();
		const backend = new ElectronCalculationRecordsBackend(
			fallback,
			{
				analyze: async () => ({
					ok: true,
					result: {
						fileId: "file-a",
						series: {},
						version: 99,
					},
					source: "rust-pool",
				}),
				isSupported: () => true,
			},
		);

		const output = await backend.calculateRecords({
			file: records.filesById["file-a"],
			inputSignature: "input-2",
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
		const records = createCalculatedRecordsByFile(
			{ [input.file.id]: input.file },
			[input.file.id],
			{ [input.file.id]: input.analysisBySeriesId },
		);
		return {
			curves: records.curvesByFileId[input.file.id] ?? [],
			inputSignature: input.inputSignature,
			metrics: records.metricsByFileId[input.file.id] ?? [],
			requestId: input.requestId,
		};
	}
}
