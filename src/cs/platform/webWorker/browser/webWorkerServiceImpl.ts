/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'src/cs/base/common/event';
import { Disposable } from 'src/cs/base/common/lifecycle';
import {
	WebWorkerClient,
	type IWebWorker,
	type IWebWorkerClient,
	type WebWorkerMessage,
} from 'src/cs/base/common/worker/webWorker';
import { InstantiationType, registerSingleton } from 'src/cs/platform/instantiation/common/extensions';
import type { WebWorkerDescriptor } from 'src/cs/platform/webWorker/browser/webWorkerDescriptor';
import { IWebWorkerService } from 'src/cs/platform/webWorker/browser/webWorkerService';

export type WebWorkerFactory = (
	url: string | URL,
	options: WorkerOptions,
) => Worker;

export class WebWorkerService implements IWebWorkerService {
	private static workerIdPool = 0;
	private readonly workerFactory: WebWorkerFactory;
	private readonly supportsCustomWorkerFactory: boolean;

	public declare readonly _serviceBrand: undefined;

	public constructor(workerFactory?: WebWorkerFactory) {
		this.supportsCustomWorkerFactory = workerFactory !== undefined;
		this.workerFactory = workerFactory ?? ((url, options) => new Worker(url, options));
	}

	public createWorkerClient<TProxy extends object>(
		descriptor: WebWorkerDescriptor,
	): IWebWorkerClient<TProxy> {
		if (!this.isSupported()) {
			throw new Error(`Web workers are unavailable for ${descriptor.label}.`);
		}
		const worker = this.workerFactory(this.getWorkerUrl(descriptor), {
			name: descriptor.label,
			type: 'module',
		});
		return new WebWorkerClient<TProxy>(
			new WebWorker(worker, ++WebWorkerService.workerIdPool),
		);
	}

	public isSupported(): boolean {
		return this.supportsCustomWorkerFactory || typeof globalThis.Worker === 'function';
	}

	private getWorkerUrl(descriptor: WebWorkerDescriptor): string | URL {
		return typeof descriptor.esmModuleLocationBundler === 'function'
			? descriptor.esmModuleLocationBundler()
			: descriptor.esmModuleLocationBundler;
	}
}

class WebWorker extends Disposable implements IWebWorker {
	private disposed = false;
	private readonly onErrorEmitter = this._register(new Emitter<Error>());
	private readonly onMessageEmitter = this._register(new Emitter<WebWorkerMessage>());

	public readonly onError = this.onErrorEmitter.event;
	public readonly onMessage = this.onMessageEmitter.event;

	public constructor(
		private readonly worker: Worker,
		private readonly id: number,
	) {
		super();
		worker.onmessage = event => this.onMessageEmitter.fire(event.data as WebWorkerMessage);
		worker.onerror = event => this.onErrorEmitter.fire(
			new Error(event.message || 'The web worker failed.'),
		);
		worker.onmessageerror = () => this.onErrorEmitter.fire(
			new Error('The web worker returned an unreadable message.'),
		);
	}

	public getId(): number {
		return this.id;
	}

	public postMessage(message: WebWorkerMessage, transfer: readonly Transferable[]): void {
		if (this.disposed) {
			throw new Error('The web worker is disposed.');
		}
		this.worker.postMessage(message, [...transfer]);
	}

	public override dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.worker.onmessage = null;
		this.worker.onerror = null;
		this.worker.onmessageerror = null;
		this.worker.terminate();
		super.dispose();
	}
}

class BrowserWebWorkerService extends WebWorkerService {
	public constructor() {
		super();
	}
}

registerSingleton(IWebWorkerService, BrowserWebWorkerService, InstantiationType.Delayed);
