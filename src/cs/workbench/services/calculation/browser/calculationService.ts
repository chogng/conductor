/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import { startPerf } from "src/cs/workbench/common/perf";
import type {
	CalculationRecordsBackendOutput,
	ICalculationRecordsBackend,
} from "src/cs/workbench/services/calculation/common/calculationRecordsBackend";
import {
	ICalculationService,
	type CalculationResourceIdentity,
	type CalculationResourceResult,
} from "src/cs/workbench/services/calculation/common/calculation";
import {
	type CalculationFileRecord,
	type FileRecordAxisProjection,
} from "src/cs/workbench/services/calculation/common/canonicalFileProjection";
import {
	createCalculatedRecordsByFile,
	createCalculatedRecordsInputSignature,
} from "src/cs/workbench/services/calculation/common/calculationRecordBuilder";
import {
	ISliceService,
	type SliceResourceResult,
} from "src/cs/workbench/services/slice/common/slice";
import type { TemplateBlock } from "src/cs/workbench/services/template/common/templateSpec";
import type {
	BaseCurveKey,
	BaseCurveRecord,
	CurveKey,
	CurveRecord,
	MetricRecord,
	SeriesRecord,
} from "src/cs/workbench/services/session/common/sessionModel";

type PendingCalculation = CalculationResourceIdentity & {
	readonly cacheKey: string;
	readonly file: CalculationFileRecord;
	readonly inputSignature: string;
	readonly requestSignature: string;
	readonly sourceModelVersion: number;
	readonly sourceVersion: number;
};

export class CalculationService extends Disposable implements ICalculationService {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeResourceCalculationResultEmitter = this._register(
		new Emitter<CalculationResourceIdentity>(),
	);
	public readonly onDidChangeResourceCalculationResult =
		this.onDidChangeResourceCalculationResultEmitter.event;

	private readonly resultsByCacheKey = new Map<string, CalculationResourceResult>();
	private readonly pendingByCacheKey = new Map<string, PendingCalculation>();
	private readonly queue: string[] = [];
	private activeCacheKey: string | null = null;
	private nextRequestId = 1;
	private disposed = false;

	public constructor(
		private readonly calculationRecordsBackend: ICalculationRecordsBackend,
		@ISliceService private readonly sliceService: ISliceService,
	) {
		super();
		this._register(this.calculationRecordsBackend);
		this._register(this.sliceService.onDidChangeResourceSliceResult(target => {
			this.handleSliceResultChange(target.resource, target.sheetId);
		}));
	}

	public getResourceResult(
		resource: URI,
		sheetId?: string | null,
	): CalculationResourceResult | null {
		const cacheKey = createCalculationResourceCacheKey(resource, sheetId);
		const result = this.resultsByCacheKey.get(cacheKey);
		if (!result) {
			return null;
		}

		const current = this.createPendingCalculation(resource, sheetId);
		if (current?.inputSignature === result.inputSignature) {
			return result;
		}

		this.resultsByCacheKey.delete(cacheKey);
		return null;
	}

	public prioritizeResource(resource: URI, sheetId?: string | null): void {
		if (this.disposed) {
			return;
		}

		const pending = this.createPendingCalculation(resource, sheetId);
		if (!pending) {
			this.invalidateResource(resource, sheetId);
			return;
		}

		if (this.resultsByCacheKey.get(pending.cacheKey)?.inputSignature === pending.inputSignature) {
			return;
		}

		const existing = this.pendingByCacheKey.get(pending.cacheKey);
		if (existing?.inputSignature === pending.inputSignature) {
			this.promoteQueuedCalculation(pending.cacheKey);
			return;
		}

		this.pendingByCacheKey.set(pending.cacheKey, pending);
		this.queue.splice(
			0,
			this.queue.length,
			pending.cacheKey,
			...this.queue.filter(cacheKey => cacheKey !== pending.cacheKey),
		);
		void this.drainQueue();
	}

	public override dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.queue.length = 0;
		this.pendingByCacheKey.clear();
		this.resultsByCacheKey.clear();
		super.dispose();
	}

	private handleSliceResultChange(resource: URI, sheetId?: string | null): void {
		const cacheKey = createCalculationResourceCacheKey(resource, sheetId);
		const shouldRecalculate =
			this.resultsByCacheKey.has(cacheKey) ||
			this.pendingByCacheKey.has(cacheKey) ||
			this.activeCacheKey === cacheKey;
		this.resultsByCacheKey.delete(cacheKey);
		this.pendingByCacheKey.delete(cacheKey);
		removeArrayValue(this.queue, cacheKey);
		this.onDidChangeResourceCalculationResultEmitter.fire(
			normalizeCalculationResource(resource, sheetId),
		);
		if (shouldRecalculate) {
			this.prioritizeResource(resource, sheetId);
		}
	}

	private invalidateResource(resource: URI, sheetId?: string | null): void {
		const cacheKey = createCalculationResourceCacheKey(resource, sheetId);
		const deletedResult = this.resultsByCacheKey.delete(cacheKey);
		const deletedPending = this.pendingByCacheKey.delete(cacheKey);
		removeArrayValue(this.queue, cacheKey);
		if (deletedResult || deletedPending) {
			this.onDidChangeResourceCalculationResultEmitter.fire(
				normalizeCalculationResource(resource, sheetId),
			);
		}
	}

	private promoteQueuedCalculation(cacheKey: string): void {
		const index = this.queue.indexOf(cacheKey);
		if (index <= 0) {
			return;
		}
		this.queue.splice(index, 1);
		this.queue.unshift(cacheKey);
	}

	private async drainQueue(): Promise<void> {
		if (this.disposed || this.activeCacheKey !== null) {
			return;
		}

		const cacheKey = this.queue.shift();
		const pending = cacheKey ? this.pendingByCacheKey.get(cacheKey) : undefined;
		if (!cacheKey || !pending) {
			if (cacheKey) {
				this.pendingByCacheKey.delete(cacheKey);
			}
			if (!this.disposed && this.queue.length) {
				void this.drainQueue();
			}
			return;
		}

		this.activeCacheKey = cacheKey;
		this.pendingByCacheKey.delete(cacheKey);
		const requestId = this.nextRequestId++;
		const endPerf = startPerf("calculationService.calculateResource", {
			requestId,
			resource: pending.resource.toString(),
			sheetId: pending.sheetId ?? null,
		});
		try {
			const backendResult = this.calculationRecordsBackend.isSupported()
				? await this.calculationRecordsBackend.calculateRecords({
					file: pending.file,
					inputSignature: pending.inputSignature,
					requestId,
				})
				: null;
			if (this.disposed || !this.isCurrentPendingCalculation(pending)) {
				endPerf({ result: "stale" });
				return;
			}

			const records = isCurrentBackendResult(backendResult, pending.inputSignature, requestId)
				? backendResult
				: createCalculatedRecordsOnMainThread(pending.file, pending.inputSignature, requestId);
			const result = createCalculationResourceResult(pending, records);
			this.resultsByCacheKey.set(cacheKey, result);
			this.onDidChangeResourceCalculationResultEmitter.fire({
				resource: result.resource,
				sheetId: result.sheetId ?? null,
			});
			endPerf({
				curveCount: Object.keys(result.curvesByKey).length,
				metricCount: Object.keys(result.metricsByKey).length,
				result: backendResult ? "backend" : "mainThread",
			});
		} finally {
			this.activeCacheKey = null;
			if (!this.disposed && this.queue.length) {
				void this.drainQueue();
			}
		}
	}

	private isCurrentPendingCalculation(pending: PendingCalculation): boolean {
		return this.createPendingCalculation(pending.resource, pending.sheetId)?.inputSignature ===
			pending.inputSignature;
	}

	private createPendingCalculation(
		resource: URI,
		sheetId?: string | null,
	): PendingCalculation | null {
		const sliceResult = this.sliceService.getResourceResult(resource, sheetId);
		if (!sliceResult || sliceResult.run.errors.length || !sliceResult.curves.length) {
			return null;
		}

		const normalized = normalizeCalculationResource(
			sliceResult.resource,
			sliceResult.sheetId,
		);
		const cacheKey = createCalculationResourceCacheKey(
			normalized.resource,
			normalized.sheetId,
		);
		const file = createCalculationFileRecord(sliceResult);
		const inputSignature = [
			sliceResult.requestSignature,
			String(sliceResult.sourceModelVersion),
			String(sliceResult.sourceVersion),
			createCalculatedRecordsInputSignature({ [file.id]: file }, [file.id]),
		].join("\u001e");
		return {
			...normalized,
			cacheKey,
			file,
			inputSignature,
			requestSignature: sliceResult.requestSignature,
			sourceModelVersion: sliceResult.sourceModelVersion,
			sourceVersion: sliceResult.sourceVersion,
		};
	}
}

function createCalculatedRecordsOnMainThread(
	file: CalculationFileRecord,
	inputSignature: string,
	requestId: number,
): CalculationRecordsBackendOutput {
	const records = createCalculatedRecordsByFile({ [file.id]: file }, [file.id]);
	return {
		curves: records.curvesByFileId[file.id] ?? [],
		inputSignature,
		metrics: records.metricsByFileId[file.id] ?? [],
		requestId,
	};
}

function isCurrentBackendResult(
	result: CalculationRecordsBackendOutput | null,
	inputSignature: string,
	requestId: number,
): result is CalculationRecordsBackendOutput {
	return Boolean(
		result &&
		result.inputSignature === inputSignature &&
		result.requestId === requestId,
	);
}

function createCalculationResourceResult(
	pending: PendingCalculation,
	records: CalculationRecordsBackendOutput,
): CalculationResourceResult {
	const curvesByKey: Record<string, CurveRecord> = { ...pending.file.curvesByKey };
	for (const curve of records.curves) {
		curvesByKey[createCurveKey(curve)] = curve;
	}
	const metricsByKey = Object.fromEntries(
		records.metrics.map(metric => [metric.key, metric]),
	) as Record<string, MetricRecord>;
	return {
		axis: pending.file.axis ?? { xAxisRole: null },
		completedAt: Date.now(),
		curvesByKey,
		inputSignature: pending.inputSignature,
		metricsByKey,
		requestSignature: pending.requestSignature,
		resource: pending.resource,
		seriesById: pending.file.seriesById,
		seriesOrder: pending.file.seriesOrder,
		sheetId: pending.sheetId ?? null,
		sourceModelVersion: pending.sourceModelVersion,
		sourceVersion: pending.sourceVersion,
	};
}

function createCalculationFileRecord(result: SliceResourceResult): CalculationFileRecord {
	const fileId = createCalculationResourceCacheKey(result.resource, result.sheetId);
	const seriesById = Object.fromEntries(
		result.series.map(series => [
			series.id,
			{
				fileId,
				groupIndex: series.groupIndex,
				id: series.id,
				labelOverride: series.labelOverride,
				legendValue: series.legendValue,
				name: series.name,
				sheetId: result.sheetId ?? undefined,
				y: series.y,
				yCol: series.yCol,
			} satisfies SeriesRecord,
		]),
	);
	const curvesByKey = Object.fromEntries(
		result.curves.map(curve => {
			const curveKey = createBaseCurveKey(curve);
			const record: BaseCurveRecord = {
				channels: curve.channels,
				curveFamily: curve.curveFamily,
				curveGeneration: "base",
				domain: curve.domain,
				fileId,
				itMode: curve.itMode ?? null,
				ivMode: curve.ivMode ?? null,
				lineage: {
					baseFamily: curve.curveFamily,
					baseSeries: { fileId, seriesId: curve.seriesId },
					curveGeneration: "base",
					itMode: curve.itMode ?? null,
					ivMode: curve.ivMode ?? null,
				},
				points: curve.points,
				seriesId: curve.seriesId,
				signature: curve.signature,
			};
			return [curveKey, record];
		}),
	);
	return {
		axis: createAxisProjection(result),
		curvesByKey,
		id: fileId,
		seriesById,
		seriesOrder: result.series.map(series => series.id),
	};
}

function createAxisProjection(result: SliceResourceResult): FileRecordAxisProjection {
	const ivMode = result.curves.find(curve =>
		curve.curveFamily === "iv" && curve.ivMode
	)?.ivMode ?? null;
	return {
		xAxisRole: ivMode === "transfer" ? "vg" : ivMode === "output" ? "vd" : null,
		xLabel: getTemplateBlockText(result, block => block.titles?.bottom),
		xUnit: getTemplateBlockText(result, block => block.x.unit),
		yLabel: getTemplateBlockText(result, block => block.titles?.left),
		yUnit: getTemplateBlockText(result, block => block.y.unit),
	};
}

function getTemplateBlockText(
	result: SliceResourceResult,
	readValue: (block: TemplateBlock) => string | undefined,
): string | undefined {
	for (const block of result.run.template.blocks) {
		const value = String(readValue(block) ?? "").trim();
		if (value) {
			return value;
		}
	}
	return undefined;
}

function createBaseCurveKey(
	curve: SliceResourceResult["curves"][number],
): BaseCurveKey {
	const mode = curve.curveFamily === "iv"
		? curve.ivMode ?? "default"
		: curve.curveFamily === "it"
			? curve.itMode ?? "default"
			: "default";
	return `base:${curve.curveFamily}:${mode}:${curve.seriesId}` as BaseCurveKey;
}

function createCurveKey(curve: CurveRecord): CurveKey {
	if (curve.curveGeneration === "base") {
		const mode = curve.curveFamily === "iv"
			? curve.ivMode ?? "default"
			: curve.curveFamily === "it"
				? curve.itMode ?? "default"
				: "default";
		return `base:${curve.curveFamily}:${mode}:${curve.seriesId}` as CurveKey;
	}
	return curve.curveGeneration === "derived"
		? `derived:${curve.curveFamily}:default:${curve.seriesId}` as CurveKey
		: `secondDerived:${curve.curveFamily}:default:${curve.seriesId}` as CurveKey;
}

function normalizeCalculationResource(
	resource: URI,
	sheetId?: string | null,
): CalculationResourceIdentity {
	const normalizedSheetId = String(sheetId ?? "").trim();
	return {
		resource,
		...(normalizedSheetId ? { sheetId: normalizedSheetId } : {}),
	};
}

function createCalculationResourceCacheKey(
	resource: URI,
	sheetId?: string | null,
): string {
	const resourceId = resource.toString().replace(/\\/g, "/");
	const normalizedSheetId = String(sheetId ?? "").trim();
	return normalizedSheetId ? `${resourceId}\u0000${normalizedSheetId}` : resourceId;
}

function removeArrayValue(values: string[], value: string): void {
	const index = values.indexOf(value);
	if (index >= 0) {
		values.splice(index, 1);
	}
}
