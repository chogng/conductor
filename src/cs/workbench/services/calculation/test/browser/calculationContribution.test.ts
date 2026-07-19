/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { CancellationToken } from "src/cs/base/common/cancellation";
import { Emitter, Event } from "src/cs/base/common/event";
import { Disposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { CalculationService } from "src/cs/workbench/services/calculation/browser/calculationService";
import type {
	CalculationRecordsBackendInput,
	CalculationRecordsBackendOutput,
	ICalculationRecordsBackend,
} from "src/cs/workbench/services/calculation/common/calculationRecordsBackend";
import { createCalculatedRecords } from "src/cs/workbench/services/calculation/common/calculationRecordBuilder";
import type {
	ISliceService,
	SliceResourceResult,
} from "src/cs/workbench/services/slice/common/slice";

type ResourceSheetIdentity = {
	readonly resource: URI;
	readonly sheetId?: string | null;
};

suite("workbench/services/calculation/test/browser/calculationContribution", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("calculates and caches records by resource identity", async () => {
		const resource = URI.file("/data/transfer.csv");
		const sliceService = store.add(new TestSliceService(
			createSliceResourceResult(resource, "Sheet 1", 1),
		));
		const backend = new TestCalculationRecordsBackend(true);
		const service = store.add(new CalculationService(backend, sliceService));
		const changes: ResourceSheetIdentity[] = [];
		store.add(service.onDidChangeResourceCalculationResult(change => changes.push(change)));

		assert.equal(service.getResourceResult(resource, "Sheet 1"), null);
		service.prioritizeResource(resource, "Sheet 1");
		await waitForCalculation();

		const result = service.getResourceResult(resource, "Sheet 1");
		assert.ok(result);
		assert.equal(result.resource.toString(), resource.toString());
		assert.equal(result.sheetId, "Sheet 1");
		assert.equal(result.sourceVersion, 1);
		assert.ok(Object.values(result.curvesByKey).some(curve =>
			curve.curveGeneration === "base" &&
			curve.curveFamily === "iv"
		));
		assert.ok(Object.values(result.curvesByKey).some(curve =>
			curve.curveGeneration === "derived" &&
			curve.curveFamily === "gm"
		));
		assert.ok(Object.keys(result.metricsByKey).length > 0);
		assert.equal(
			Object.values(result.curvesByKey).some(curve =>
				Object.prototype.hasOwnProperty.call(curve, "fileId")
			),
			false,
		);
		assert.equal(backend.calculateCount, 1);
		assert.deepEqual(changes.map(change => ({
			resource: change.resource.toString(),
			sheetId: change.sheetId,
		})), [{
			resource: resource.toString(),
			sheetId: "Sheet 1",
		}]);
	});

	test("does not recalculate an unchanged resource result", async () => {
		const resource = URI.file("/data/transfer.csv");
		const sliceService = store.add(new TestSliceService(
			createSliceResourceResult(resource, null, 1),
		));
		const backend = new TestCalculationRecordsBackend(true);
		const service = store.add(new CalculationService(backend, sliceService));

		service.prioritizeResource(resource);
		await waitForCalculation();
		service.prioritizeResource(resource);
		service.prioritizeResource(resource);
		await waitForCalculation();

		assert.equal(backend.calculateCount, 1);
	});

	test("drops stale backend output and recalculates the changed Slice result", async () => {
		const resource = URI.file("/data/transfer.csv");
		const sliceService = store.add(new TestSliceService(
			createSliceResourceResult(resource, null, 1),
		));
		const backend = new TestCalculationRecordsBackend(false);
		const service = store.add(new CalculationService(backend, sliceService));

		service.prioritizeResource(resource);
		assert.equal(backend.calculateCount, 1);

		sliceService.setResult(createSliceResourceResult(resource, null, 2));
		backend.complete(0);
		await waitForCalculation();

		assert.equal(service.getResourceResult(resource), null);
		assert.equal(backend.calculateCount, 2);

		backend.complete(1);
		await waitForCalculation();

		const result = service.getResourceResult(resource);
		assert.ok(result);
		assert.equal(result.sourceVersion, 2);
		assert.equal(result.requestSignature, "request-2");
	});

	test("cancels an active backend calculation when its Slice result is removed", async () => {
		const resource = URI.file("/data/released.csv");
		const sliceService = store.add(new TestSliceService(
			createSliceResourceResult(resource, "Sheet 1", 1),
		));
		const backend = new TestCalculationRecordsBackend(false);
		const service = store.add(new CalculationService(backend, sliceService));

		service.prioritizeResource(resource, "Sheet 1");
		assert.equal(backend.calculateCount, 1);
		sliceService.clearResult(resource, "Sheet 1");
		await waitForCalculation();

		assert.equal(backend.cancellationCount, 1);
		assert.equal(service.getResourceResult(resource, "Sheet 1"), null);
	});
});

class TestCalculationRecordsBackend
	extends Disposable
	implements ICalculationRecordsBackend {

	public calculateCount = 0;
	public cancellationCount = 0;
	private readonly pending: Array<{
		readonly input: CalculationRecordsBackendInput;
		readonly resolve: (result: CalculationRecordsBackendOutput | null) => void;
	}> = [];

	public constructor(private readonly autoComplete: boolean) {
		super();
	}

	public isSupported(): boolean {
		return true;
	}

	public calculateRecords(
		input: CalculationRecordsBackendInput,
		token: CancellationToken = CancellationToken.None,
	): Promise<CalculationRecordsBackendOutput | null> {
		this.calculateCount += 1;
		if (this.autoComplete) {
			return Promise.resolve(createBackendOutput(input));
		}
		return new Promise(resolve => {
			let cancellationListener: IDisposable | undefined;
			const complete = (result: CalculationRecordsBackendOutput | null): void => {
				cancellationListener?.dispose();
				resolve(result);
			};
			this.pending.push({ input, resolve: complete });
			cancellationListener = token.onCancellationRequested(() => {
				this.cancellationCount += 1;
				complete(null);
			});
		});
	}

	public complete(index: number): void {
		const pending = this.pending[index];
		assert.ok(pending, `Missing pending calculation ${index}.`);
		pending.resolve(createBackendOutput(pending.input));
	}
}

class TestSliceService extends Disposable implements ISliceService {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeResourceSliceResultEmitter = this._register(
		new Emitter<ResourceSheetIdentity>(),
	);
	public readonly onDidChangeResourceSliceResult =
		this.onDidChangeResourceSliceResultEmitter.event;
	public readonly onDidChangeSliceState = Event.None as Event<void>;
	public readonly onDidChangeTemplateSelection =
		Event.None as Event<ResourceSheetIdentity>;

	public constructor(private result: SliceResourceResult | null) {
		super();
	}

	public getResourceResult(resource: URI, sheetId?: string | null): SliceResourceResult | null {
		return this.result &&
			this.result.resource.toString() === resource.toString() &&
			String(this.result.sheetId ?? "") === String(sheetId ?? "")
			? this.result
			: null;
	}

	public setResult(result: SliceResourceResult): void {
		this.result = result;
		this.onDidChangeResourceSliceResultEmitter.fire({
			resource: result.resource,
			sheetId: result.sheetId ?? null,
		});
	}

	public clearResult(resource: URI, sheetId?: string | null): void {
		this.result = null;
		this.onDidChangeResourceSliceResultEmitter.fire({ resource, sheetId });
	}

	public getState(): ReturnType<ISliceService["getState"]> {
		return { isRunning: false, queueLength: 0, templateSelections: [] };
	}

	public getTemplateSelection(): ReturnType<ISliceService["getTemplateSelection"]> {
		return { kind: "auto" };
	}

	public getResourceState(): ReturnType<ISliceService["getResourceState"]> {
		return undefined;
	}

	public submitResource(): void {}
	public markResourceSkipped(): void {}
	public prioritizeResource(): void {}
	public cancelResource(): void {}
	public setTemplateSelection(): void {}
}

function createBackendOutput(
	input: CalculationRecordsBackendInput,
): CalculationRecordsBackendOutput {
	const records = createCalculatedRecords(input.records);
	return {
		curves: records.curves,
		inputSignature: input.inputSignature,
		metrics: records.metrics,
		requestId: input.requestId,
	};
}

function createSliceResourceResult(
	resource: URI,
	sheetId: string | null,
	sourceVersion: number,
): SliceResourceResult {
	return {
		completedAt: sourceVersion,
		curves: [{
			curveFamily: "iv",
			curveGeneration: "base",
			ivMode: "transfer",
			lineage: {
				baseFamily: "iv",
				baseSeries: {
					resource,
					sheetId,
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
			resource,
			seriesId: "series-a",
			sheetId,
			signature: `curve-${sourceVersion}`,
		}],
		requestSignature: `request-${sourceVersion}`,
		resource,
		run: {
			errors: [],
			id: `run-${sourceVersion}`,
			inputRanges: [],
			mode: "auto",
			outputCurveKeys: [],
			outputSeriesIds: ["series-a"],
			resource,
			selection: { kind: "auto" },
			sheetId,
			sourceContentSignature: `source-${sourceVersion}`,
			template: {
				blocks: [{
					legend: { target: "auto" },
					rowRange: { startRow: 0, endRow: 2 },
					segmentation: { kind: "auto" },
					titles: {
						bottom: "Gate Voltage",
						left: "Drain Current",
					},
					x: { columns: [0], unit: "V" },
					y: { columns: [1], unit: "A" },
				}],
				name: "Transfer",
				schemaVersion: 1,
				stopOnError: false,
				version: 1,
			},
			templateFingerprint: "template",
			warnings: [],
		},
		series: [{
			groupIndex: 0,
			id: "series-a",
			name: "A",
			resource,
			sheetId,
			y: [1e-12, 1e-9, 1e-6],
		}],
		sheetId,
		sourceModelVersion: sourceVersion,
		sourceVersion,
	};
}

async function waitForCalculation(): Promise<void> {
	for (let index = 0; index < 8; index += 1) {
		await Promise.resolve();
	}
}
