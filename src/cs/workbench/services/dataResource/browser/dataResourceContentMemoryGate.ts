/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from "src/cs/base/common/async";
import { Disposable, type IDisposable } from "src/cs/base/common/lifecycle";
import type { TableFormatId } from "src/cs/workbench/services/table/common/tableFormatService";

const Mebibyte = 1024 * 1024;
const MinimumSystemReserveBytes = 512 * Mebibyte;
const HardMinimumSystemReserveBytes = 256 * Mebibyte;
const DefaultRetryDelayMs = 100;
const RecoverySampleCount = 2;
const EstimatorLearningRate = 0.2;
const MinimumCalibrationFileSizeBytes = Mebibyte;

export type DataResourceContentMemoryPressure = "green" | "yellow" | "red";

export type DataResourceContentMemorySample = {
	readonly heapLimitBytes?: number;
	readonly heapUsedBytes?: number;
	readonly processPrivateBytes?: number;
	readonly processResidentSetBytes?: number;
	readonly systemFreeBytes?: number;
	readonly systemTotalBytes?: number;
};

export type DataResourceContentMemoryGateSnapshot = {
	readonly activeEstimatedBytes: number;
	readonly activeLeaseCount: number;
	readonly pressure: DataResourceContentMemoryPressure;
	readonly queuedCount: number;
};

export type DataResourceContentMemoryGateOptions = {
	readonly retryDelayMs?: number;
	readonly sample?: () =>
		DataResourceContentMemorySample |
		Promise<DataResourceContentMemorySample>;
};

type PendingAdmission = {
	readonly estimatedBytes: number;
	readonly reject: (error: Error) => void;
	readonly resolve: (lease: IDisposable) => void;
};

export class DataResourceContentMemoryEstimator {
	private readonly factors = new Map<TableFormatId, number>();

	public canObserve(fileSizeBytes: number): boolean {
		return fileSizeBytes >= MinimumCalibrationFileSizeBytes;
	}

	public estimate(fileSizeBytes: number, format: TableFormatId | null): number {
		const factor = format
			? this.factors.get(format) ?? getInitialMemoryFactor(format)
			: getInitialMemoryFactor(format);
		return estimateDataResourceContentMemoryBytes(fileSizeBytes, format, factor);
	}

	public observe(
		format: TableFormatId | null,
		fileSizeBytes: number,
		before: DataResourceContentMemorySample,
		after: DataResourceContentMemorySample,
	): void {
		if (!format || !this.canObserve(fileSizeBytes)) {
			return;
		}
		const observedBytes = Math.max(
			getPositiveDelta(before.heapUsedBytes, after.heapUsedBytes),
			getPositiveDelta(before.processPrivateBytes, after.processPrivateBytes),
			getPositiveDelta(before.processResidentSetBytes, after.processResidentSetBytes),
		);
		if (!observedBytes) {
			return;
		}

		const initialFactor = getInitialMemoryFactor(format);
		const currentFactor = this.factors.get(format) ?? initialFactor;
		const observedFactor = clamp(
			observedBytes / fileSizeBytes,
			initialFactor * 0.5,
			initialFactor * 2,
		);
		this.factors.set(
			format,
			currentFactor * (1 - EstimatorLearningRate) +
				observedFactor * EstimatorLearningRate,
		);
	}
}

/**
 * Applies memory-pressure backpressure to heavy physical-content work.
 *
 * This is intentionally not a concurrency limiter: when memory metrics are
 * unavailable or capacity is healthy, every request is admitted immediately.
 */
export class DataResourceContentMemoryGate extends Disposable {
	private readonly pendingAdmissions: PendingAdmission[] = [];
	private activeEstimatedBytes = 0;
	private activeLeaseCount = 0;
	private drainPromise: Promise<void> | null = null;
	private disposed = false;
	private pressure: DataResourceContentMemoryPressure = "green";
	private recoverySamples = 0;
	private retry: IDisposable | null = null;

	private readonly retryDelayMs: number;
	private readonly sample: () => Promise<DataResourceContentMemorySample>;

	public constructor(options: DataResourceContentMemoryGateOptions = {}) {
		super();
		this.retryDelayMs = normalizeRetryDelay(options.retryDelayMs);
		const sample = options.sample ?? sampleDataResourceContentMemory;
		this.sample = async () => {
			try {
				return normalizeMemorySample(await sample());
			} catch {
				return {};
			}
		};
	}

	public acquire(estimatedBytes: number): Promise<IDisposable> {
		if (this.disposed) {
			return Promise.reject(new Error("The data-resource memory gate is disposed."));
		}

		return new Promise<IDisposable>((resolve, reject) => {
			this.pendingAdmissions.push({
				estimatedBytes: normalizeEstimatedBytes(estimatedBytes),
				reject,
				resolve,
			});
			this.startDrain();
		});
	}

	public getSnapshot(): DataResourceContentMemoryGateSnapshot {
		return {
			activeEstimatedBytes: this.activeEstimatedBytes,
			activeLeaseCount: this.activeLeaseCount,
			pressure: this.pressure,
			queuedCount: this.pendingAdmissions.length,
		};
	}

	public sampleMemory(): Promise<DataResourceContentMemorySample> {
		return this.sample();
	}

	public override dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.retry?.dispose();
		this.retry = null;
		const error = new Error("The data-resource memory gate was disposed.");
		for (const admission of this.pendingAdmissions.splice(0)) {
			admission.reject(error);
		}
		super.dispose();
	}

	private startDrain(): void {
		if (this.disposed || this.drainPromise || !this.pendingAdmissions.length) {
			return;
		}

		this.retry?.dispose();
		this.retry = null;
		const drainPromise = this.drain().finally(() => {
			if (this.drainPromise === drainPromise) {
				this.drainPromise = null;
			}
			if (this.pendingAdmissions.length) {
				this.scheduleRetry();
			}
		});
		this.drainPromise = drainPromise;
	}

	private async drain(): Promise<void> {
		const sample = await this.sample();
		this.updatePressure(sample);
		this.rejectImpossibleAdmissions(sample);

		while (!this.disposed && this.pendingAdmissions.length) {
			const admissionIndex = this.findAdmissibleIndex(sample);
			if (admissionIndex < 0) {
				return;
			}

			const [admission] = this.pendingAdmissions.splice(admissionIndex, 1);
			if (!admission) {
				return;
			}
			this.activeEstimatedBytes += admission.estimatedBytes;
			this.activeLeaseCount += 1;
			let released = false;
			admission.resolve({
				dispose: () => {
					if (released) {
						return;
					}
					released = true;
					this.activeEstimatedBytes = Math.max(
						0,
						this.activeEstimatedBytes - admission.estimatedBytes,
					);
					this.activeLeaseCount = Math.max(0, this.activeLeaseCount - 1);
					this.startDrain();
				},
			});
		}
	}

	private findAdmissibleIndex(sample: DataResourceContentMemorySample): number {
		if (!hasUsableMemoryMetrics(sample)) {
			return 0;
		}

		const hardCritical = isHardCriticalMemoryPressure(sample);
		if (this.pressure === "red") {
			return !hardCritical && this.activeLeaseCount === 0 ? 0 : -1;
		}

		const availableBytes = getAvailableAdmissionBytes(sample);
		if (!Number.isFinite(availableBytes)) {
			return 0;
		}

		const oldestAdmission = this.pendingAdmissions[0];
		if (
			oldestAdmission &&
			this.activeLeaseCount === 0 &&
			oldestAdmission.estimatedBytes > availableBytes &&
			!hardCritical
		) {
			return 0;
		}

		for (let index = 0; index < this.pendingAdmissions.length; index += 1) {
			const admission = this.pendingAdmissions[index]!;
			if (
				this.activeEstimatedBytes + admission.estimatedBytes <= availableBytes
			) {
				return index;
			}
		}

		// A single large request must still make progress when the process is not
		// in a hard-critical state. It runs alone and all later work waits.
		return !hardCritical && this.activeLeaseCount === 0 ? 0 : -1;
	}

	private rejectImpossibleAdmissions(sample: DataResourceContentMemorySample): void {
		const capacity = getAbsoluteAdmissionCapacity(sample);
		if (!Number.isFinite(capacity)) {
			return;
		}

		for (let index = this.pendingAdmissions.length - 1; index >= 0; index -= 1) {
			const admission = this.pendingAdmissions[index]!;
			if (admission.estimatedBytes <= capacity) {
				continue;
			}
			this.pendingAdmissions.splice(index, 1);
			admission.reject(new Error(
				`The data resource requires an estimated ${formatMebibytes(admission.estimatedBytes)} ` +
				`of working memory, exceeding the current safe capacity of ${formatMebibytes(capacity)}.`,
			));
		}
	}

	private updatePressure(sample: DataResourceContentMemorySample): void {
		const nextPressure = classifyMemoryPressure(sample);
		if (nextPressure === "red") {
			this.pressure = "red";
			this.recoverySamples = 0;
			return;
		}
		if (this.pressure === "red") {
			if (nextPressure !== "green") {
				this.recoverySamples = 0;
				return;
			}
			this.recoverySamples += 1;
			if (this.recoverySamples < RecoverySampleCount) {
				return;
			}
		}
		if (this.pressure === "yellow" && nextPressure === "green") {
			this.recoverySamples += 1;
			if (this.recoverySamples < RecoverySampleCount) {
				return;
			}
		}

		this.pressure = nextPressure;
		this.recoverySamples = 0;
	}

	private scheduleRetry(): void {
		if (this.disposed || this.retry || !this.pendingAdmissions.length) {
			return;
		}
		this.retry = disposableTimeout(() => {
			this.retry?.dispose();
			this.retry = null;
			this.startDrain();
		}, this.retryDelayMs);
	}
}

export const estimateDataResourceContentMemoryBytes = (
	fileSizeBytes: number,
	format: TableFormatId | null,
	factor = getInitialMemoryFactor(format),
): number => {
	const fileSize = Math.max(0, Math.floor(Number(fileSizeBytes) || 0));
	return Math.max(getMinimumMemoryBytes(format), fileSize * factor);
};

export const sampleDataResourceContentMemory =
	async (): Promise<DataResourceContentMemorySample> => {
		const host = globalThis as typeof globalThis & {
			conductor?: {
				process?: {
					memoryInfo?: () => Promise<DataResourceContentMemorySample>;
				};
			};
			performance?: Performance & {
				memory?: {
					readonly jsHeapSizeLimit?: number;
					readonly usedJSHeapSize?: number;
				};
			};
		};
		const sandboxMemory = await host.conductor?.process?.memoryInfo?.()
			.catch(() => undefined);
		const browserMemory = host.performance?.memory;
		return normalizeMemorySample({
			...sandboxMemory,
			heapLimitBytes: sandboxMemory?.heapLimitBytes ?? browserMemory?.jsHeapSizeLimit,
			heapUsedBytes: sandboxMemory?.heapUsedBytes ?? browserMemory?.usedJSHeapSize,
		});
	};

const classifyMemoryPressure = (
	sample: DataResourceContentMemorySample,
): DataResourceContentMemoryPressure => {
	const heapRatio = getRatio(sample.heapUsedBytes, sample.heapLimitBytes);
	const freeRatio = getRatio(sample.systemFreeBytes, sample.systemTotalBytes);
	const privateRatio = getRatio(sample.processPrivateBytes, sample.systemTotalBytes);
	if (
		heapRatio >= 0.8 ||
		(sample.systemFreeBytes !== undefined && sample.systemFreeBytes < MinimumSystemReserveBytes) ||
		(freeRatio >= 0 && freeRatio < 0.08) ||
		privateRatio >= 0.45
	) {
		return "red";
	}
	if (
		heapRatio >= 0.65 ||
		(sample.systemFreeBytes !== undefined && sample.systemFreeBytes < 1024 * Mebibyte) ||
		(freeRatio >= 0 && freeRatio < 0.15) ||
		privateRatio >= 0.3
	) {
		return "yellow";
	}
	return "green";
};

const isHardCriticalMemoryPressure = (
	sample: DataResourceContentMemorySample,
): boolean => {
	const heapRatio = getRatio(sample.heapUsedBytes, sample.heapLimitBytes);
	const freeRatio = getRatio(sample.systemFreeBytes, sample.systemTotalBytes);
	return (
		heapRatio >= 0.9 ||
		(
			sample.systemFreeBytes !== undefined &&
			sample.systemFreeBytes < HardMinimumSystemReserveBytes
		) ||
		(freeRatio >= 0 && freeRatio < 0.04)
	);
};

const getAvailableAdmissionBytes = (
	sample: DataResourceContentMemorySample,
): number => {
	const budgets: number[] = [];
	if (sample.heapLimitBytes !== undefined && sample.heapUsedBytes !== undefined) {
		budgets.push(sample.heapLimitBytes * 0.85 - sample.heapUsedBytes);
	}
	if (sample.systemFreeBytes !== undefined) {
		budgets.push(sample.systemFreeBytes - MinimumSystemReserveBytes);
	}
	if (
		sample.systemTotalBytes !== undefined &&
		sample.processPrivateBytes !== undefined
	) {
		budgets.push(sample.systemTotalBytes * 0.5 - sample.processPrivateBytes);
	}
	return budgets.length
		? Math.max(0, Math.min(...budgets))
		: Number.POSITIVE_INFINITY;
};

const getAbsoluteAdmissionCapacity = (
	sample: DataResourceContentMemorySample,
): number => {
	const capacities: number[] = [];
	if (sample.heapLimitBytes !== undefined) {
		capacities.push(sample.heapLimitBytes * 0.85);
	}
	if (sample.systemTotalBytes !== undefined) {
		capacities.push(sample.systemTotalBytes * 0.6);
	}
	return capacities.length
		? Math.max(0, Math.min(...capacities))
		: Number.POSITIVE_INFINITY;
};

const hasUsableMemoryMetrics = (
	sample: DataResourceContentMemorySample,
): boolean =>
	(
		sample.heapLimitBytes !== undefined &&
		sample.heapUsedBytes !== undefined
	) ||
	sample.systemFreeBytes !== undefined ||
	(
		sample.systemTotalBytes !== undefined &&
		sample.processPrivateBytes !== undefined
	);

const normalizeMemorySample = (
	sample: DataResourceContentMemorySample,
): DataResourceContentMemorySample => ({
	...normalizeOptionalBytes("heapLimitBytes", sample.heapLimitBytes),
	...normalizeOptionalBytes("heapUsedBytes", sample.heapUsedBytes),
	...normalizeOptionalBytes("processPrivateBytes", sample.processPrivateBytes),
	...normalizeOptionalBytes("processResidentSetBytes", sample.processResidentSetBytes),
	...normalizeOptionalBytes("systemFreeBytes", sample.systemFreeBytes),
	...normalizeOptionalBytes("systemTotalBytes", sample.systemTotalBytes),
});

const normalizeOptionalBytes = <K extends keyof DataResourceContentMemorySample>(
	key: K,
	value: number | undefined,
): Pick<DataResourceContentMemorySample, K> | Record<never, never> =>
	Number.isFinite(value) && Number(value) >= 0
		? { [key]: Math.floor(Number(value)) } as Pick<DataResourceContentMemorySample, K>
		: {};

const normalizeEstimatedBytes = (value: number): number =>
	Math.max(1, Math.floor(Number(value) || 0));

const getInitialMemoryFactor = (format: TableFormatId | null): number => {
	switch (format) {
		case "xls":
			return 10;
		case "xlsx":
			return 20;
		case "csv":
		case "tsv":
		default:
			return 6;
	}
};

const getMinimumMemoryBytes = (format: TableFormatId | null): number => {
	switch (format) {
		case "xls":
			return 32 * Mebibyte;
		case "xlsx":
			return 64 * Mebibyte;
		case "csv":
		case "tsv":
		default:
			return 16 * Mebibyte;
	}
};

const getPositiveDelta = (
	before: number | undefined,
	after: number | undefined,
): number =>
	before !== undefined && after !== undefined
		? Math.max(0, after - before)
		: 0;

const clamp = (value: number, minimum: number, maximum: number): number =>
	Math.min(maximum, Math.max(minimum, value));

const normalizeRetryDelay = (value: number | undefined): number => {
	const delay = Math.floor(Number(value));
	return Number.isFinite(delay) && delay >= 0 ? delay : DefaultRetryDelayMs;
};

const getRatio = (
	value: number | undefined,
	total: number | undefined,
): number =>
	value !== undefined && total !== undefined && total > 0
		? value / total
		: -1;

const formatMebibytes = (bytes: number): string =>
	`${Math.max(1, Math.ceil(bytes / Mebibyte))} MiB`;
