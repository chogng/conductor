/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'src/cs/base/common/lifecycle';
import type { IWebWorkerClient } from 'src/cs/base/common/worker/webWorker';
import type { WebWorkerDescriptor } from 'src/cs/platform/webWorker/browser/webWorkerDescriptor';
import type { IWebWorkerService } from 'src/cs/platform/webWorker/browser/webWorkerService';
import { getPerfNow, logPerf } from 'src/cs/workbench/common/perf';
import type { CalculatedData } from 'src/cs/workbench/services/calculation/common/calculationReadModel';
import type {
	IPlotCalculatedDataWorker,
	PlotDisplayModelWorkerOutput,
	PlotDisplayModelWorkerRequest,
} from 'src/cs/workbench/services/plot/browser/plotCalculatedDataWorker';
import type {
	PlotAxisSettings,
	PlotCalculatedDataPrefetchPriority,
	PlotType,
} from 'src/cs/workbench/services/plot/common/plot';
const PLOT_CALCULATED_DATA_WORKER_TIMEOUT_MS = 15_000;

type PlotWorkerLane = 'background' | 'detail' | 'interactive';
type PlotWorkerRequestKind = 'calculateDisplayModel';
type PlotWorkerResult = PlotDisplayModelWorkerOutput;

export type PlotDisplayModelWorkerLane = PlotWorkerLane;

export type PlotDisplayModelWorkerInput = {
	readonly axisSettings?: PlotAxisSettings;
	readonly axisTitleOverridesByKey?: Readonly<Record<string, string>>;
	readonly calculatedData: CalculatedData;
	readonly hiddenLegendKeys?: readonly string[];
	readonly includeInspector?: boolean;
	readonly legendLabels?: Readonly<Record<string, string>>;
	readonly plotType: PlotType;
	readonly priority?: PlotCalculatedDataPrefetchPriority;
	readonly requestId: number;
	readonly dataVersion: number;
	readonly workerLane?: PlotDisplayModelWorkerLane;
};

export type {
	PlotDisplayModelWorkerOutput,
};

export class PlotCalculatedDataWorkerClient extends Disposable {
	private readonly lanes: Record<PlotWorkerLane, ReusablePlotWorkerLane>;

	public constructor(
		webWorkerService: IWebWorkerService,
		workerDescriptor: WebWorkerDescriptor,
	) {
		super();
		this.lanes = {
			background: this._register(new ReusablePlotWorkerLane(
				'background',
				webWorkerService,
				workerDescriptor,
			)),
			detail: this._register(new ReusablePlotWorkerLane(
				'detail',
				webWorkerService,
				workerDescriptor,
			)),
			interactive: this._register(new ReusablePlotWorkerLane(
				'interactive',
				webWorkerService,
				workerDescriptor,
			)),
		};
	}

	public calculateDisplayModel(
		input: PlotDisplayModelWorkerInput,
	): Promise<PlotDisplayModelWorkerOutput | null> {
		const payload: PlotDisplayModelWorkerRequest = {
			axisSettings: input.axisSettings,
			axisTitleOverridesByKey: input.axisTitleOverridesByKey,
			calculatedData: input.calculatedData,
			hiddenLegendKeys: input.hiddenLegendKeys,
			includeInspector: input.includeInspector,
			legendLabels: input.legendLabels,
			plotType: input.plotType,
			requestId: input.requestId,
			dataVersion: input.dataVersion,
		};
		return this.request<PlotDisplayModelWorkerOutput>({
			execute: worker => worker.proxy.$calculateDisplayModel(payload),
			kind: 'calculateDisplayModel',
			lane: input.workerLane ?? getPlotWorkerLane(input.priority),
			requestId: input.requestId,
			dataVersion: input.dataVersion,
		});
	}

	private request<T extends PlotWorkerResult>(input: {
		readonly execute: (worker: IWebWorkerClient<IPlotCalculatedDataWorker>) => Promise<T>;
		readonly kind: PlotWorkerRequestKind;
		readonly lane: PlotWorkerLane;
		readonly requestId: number;
		readonly dataVersion: number;
	}): Promise<T | null> {
		return new Promise<T | null>(resolve => {
			this.lanes[input.lane].request({
				execute: input.execute as ReusablePlotWorkerRequest['execute'],
				kind: input.kind,
				requestId: input.requestId,
				resolve: result => resolve(result as T | null),
				dataVersion: input.dataVersion,
			});
		});
	}
}

type ReusablePlotWorkerRequest = {
	readonly execute: (
		worker: IWebWorkerClient<IPlotCalculatedDataWorker>,
	) => Promise<PlotWorkerResult>;
	readonly kind: PlotWorkerRequestKind;
	readonly requestId: number;
	readonly resolve: (result: PlotWorkerResult | null) => void;
	readonly dataVersion: number;
};

class ReusablePlotWorkerLane extends Disposable {
	private activeRequest: ReusablePlotWorkerRequest | null = null;
	private activeTimeout: ReturnType<typeof globalThis.setTimeout> | null = null;
	private readonly queuedRequests: ReusablePlotWorkerRequest[] = [];
	private worker: IWebWorkerClient<IPlotCalculatedDataWorker> | null = null;

	public constructor(
		private readonly lane: PlotWorkerLane,
		private readonly webWorkerService: IWebWorkerService,
		private readonly workerDescriptor: WebWorkerDescriptor,
	) {
		super();
	}

	public request(request: ReusablePlotWorkerRequest): void {
		const queueLengthBefore = this.queuedRequests.length;
		this.queuedRequests.push(request);
		logPerf('plotWorkerClient.enqueue', {
			kind: request.kind,
			lane: this.lane,
			queueLengthAfter: this.queuedRequests.length,
			queueLengthBefore,
		}, { silent: true });
		this.flush();
	}

	public override dispose(): void {
		if (this.activeTimeout !== null) {
			globalThis.clearTimeout(this.activeTimeout);
			this.activeTimeout = null;
		}
		const requests = [
			...(this.activeRequest ? [this.activeRequest] : []),
			...this.queuedRequests,
		];
		this.activeRequest = null;
		this.queuedRequests.length = 0;
		this.terminateWorker();
		for (const request of requests) {
			request.resolve(null);
		}
		super.dispose();
	}

	private flush(): void {
		if (this.activeRequest || !this.queuedRequests.length) {
			return;
		}

		const request = this.queuedRequests.shift()!;
		const worker = this.getOrCreateWorker();
		if (!worker) {
			request.resolve(null);
			this.flush();
			return;
		}

		const startedAt = getPerfNow();
		this.activeRequest = request;
		this.activeTimeout = globalThis.setTimeout(() => {
			this.finish(request, null, startedAt, 'timeout');
			this.terminateWorker();
			this.flush();
		}, PLOT_CALCULATED_DATA_WORKER_TIMEOUT_MS);

		logPerf('plotWorkerClient.dispatch', {
			kind: request.kind,
			lane: this.lane,
			queueLength: this.queuedRequests.length,
		}, { silent: true });
		request.execute(worker).then(result => {
			if (
				this.activeRequest !== request ||
				result.requestId !== request.requestId ||
				result.dataVersion !== request.dataVersion
			) {
				return;
			}
			this.finish(request, result, startedAt, 'completed');
			this.flush();
		}, () => {
			if (this.activeRequest !== request) {
				return;
			}
			this.finish(request, null, startedAt, 'workerError');
			this.terminateWorker();
			this.flush();
		});
	}

	private getOrCreateWorker(): IWebWorkerClient<IPlotCalculatedDataWorker> | null {
		if (this.worker?.isClosed()) {
			this.terminateWorker();
		}
		if (this.worker) {
			return this.worker;
		}
		if (!this.webWorkerService.isSupported()) {
			return null;
		}

		try {
			this.worker = this.webWorkerService.createWorkerClient<IPlotCalculatedDataWorker>(
				this.workerDescriptor,
			);
			logPerf('plotWorkerClient.createWorker', {
				lane: this.lane,
			}, { silent: true });
			return this.worker;
		} catch {
			this.worker = null;
			return null;
		}
	}

	private finish(
		request: ReusablePlotWorkerRequest,
		result: PlotWorkerResult | null,
		startedAt: number,
		resultKind: string,
	): void {
		if (this.activeRequest !== request) {
			return;
		}
		if (this.activeTimeout !== null) {
			globalThis.clearTimeout(this.activeTimeout);
			this.activeTimeout = null;
		}
		this.activeRequest = null;
		logPerf('plotWorkerClient.complete', {
			durationMs: getPerfNow() - startedAt,
			kind: request.kind,
			lane: this.lane,
			queueLength: this.queuedRequests.length,
			result: resultKind,
		}, { silent: true });
		request.resolve(result);
	}

	private terminateWorker(): void {
		this.worker?.dispose();
		this.worker = null;
	}
}

function getPlotWorkerLane(
	priority: PlotCalculatedDataPrefetchPriority | undefined,
): PlotWorkerLane {
	return priority === 'active' || priority === 'hover'
		? 'interactive'
		: 'background';
}
