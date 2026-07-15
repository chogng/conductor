/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	isSerializedError,
	transformErrorForSerialization,
	transformErrorFromSerialization,
	type SerializedError,
} from 'src/cs/base/common/errors';
import type { Event } from 'src/cs/base/common/event';
import { Disposable, type IDisposable } from 'src/cs/base/common/lifecycle';

export type WebWorkerRequestMessage = {
	readonly args: readonly unknown[];
	readonly method: string;
	readonly requestId: number;
	readonly type: 'request';
	readonly workerId: number;
};

export type WebWorkerReplyMessage = {
	readonly error?: SerializedError;
	readonly requestId: number;
	readonly result?: unknown;
	readonly type: 'reply';
	readonly workerId: number;
};

export type WebWorkerMessage = WebWorkerReplyMessage | WebWorkerRequestMessage;

export interface IWebWorker extends IDisposable {
	readonly onError: Event<Error>;
	readonly onMessage: Event<WebWorkerMessage>;

	getId(): number;
	postMessage(message: WebWorkerMessage, transfer: readonly Transferable[]): void;
}

type WebWorkerMethodName<T extends object> = Extract<keyof T, `$${string}`> & string;
type WebWorkerMethodArguments<T> = T extends (...args: infer TArgs) => unknown ? TArgs : never;
type WebWorkerMethodResult<T> = T extends (...args: infer _TArgs) => infer TResult
	? Awaited<TResult>
	: never;

export type Proxied<T extends object> = {
	[K in WebWorkerMethodName<T>]: T[K] extends (...args: infer TArgs) => infer TResult
		? (...args: TArgs) => Promise<Awaited<TResult>>
		: never;
};

export interface IWebWorkerClient<TProxy extends object> extends IDisposable {
	readonly proxy: Proxied<TProxy>;

	isClosed(): boolean;
	request<K extends WebWorkerMethodName<TProxy>>(
		method: K,
		args: WebWorkerMethodArguments<TProxy[K]>,
		transfer?: readonly Transferable[],
	): Promise<WebWorkerMethodResult<TProxy[K]>>;
}

type PendingReply = {
	readonly reject: (error: unknown) => void;
	readonly resolve: (result: unknown) => void;
};

export class WebWorkerClient<TProxy extends object> extends Disposable implements IWebWorkerClient<TProxy> {
	private closedError: Error | null = null;
	private readonly pendingReplies = new Map<number, PendingReply>();
	private requestIdPool = 0;

	public readonly proxy: Proxied<TProxy>;

	public constructor(private readonly worker: IWebWorker) {
		super();
		this._register(worker);
		this._register(worker.onMessage(message => this.handleMessage(message)));
		this._register(worker.onError(error => this.close(error, true)));
		this.proxy = this.createProxy();
	}

	public request<K extends WebWorkerMethodName<TProxy>>(
		method: K,
		args: WebWorkerMethodArguments<TProxy[K]>,
		transfer: readonly Transferable[] = [],
	): Promise<WebWorkerMethodResult<TProxy[K]>> {
		if (this.closedError) {
			return Promise.reject(this.closedError);
		}

		const requestId = ++this.requestIdPool;
		return new Promise<WebWorkerMethodResult<TProxy[K]>>((resolve, reject) => {
			this.pendingReplies.set(requestId, {
				reject,
				resolve: result => resolve(result as WebWorkerMethodResult<TProxy[K]>),
			});
			try {
				this.worker.postMessage({
					args,
					method,
					requestId,
					type: 'request',
					workerId: this.worker.getId(),
				}, transfer);
			} catch (error) {
				this.pendingReplies.delete(requestId);
				reject(toError(error, 'Failed to post a message to the web worker.'));
			}
		});
	}

	public isClosed(): boolean {
		return this.closedError !== null;
	}

	public override dispose(): void {
		this.close(new Error('The web worker client was disposed.'), false);
		super.dispose();
	}

	private createProxy(): Proxied<TProxy> {
		return new Proxy(Object.create(null) as Proxied<TProxy>, {
			get: (_target, property) => {
				if (typeof property !== 'string' || !property.startsWith('$')) {
					return undefined;
				}
				return (...args: unknown[]) => this.request(
					property as WebWorkerMethodName<TProxy>,
					args as WebWorkerMethodArguments<TProxy[WebWorkerMethodName<TProxy>]>,
				);
			},
		});
	}

	private handleMessage(message: WebWorkerMessage): void {
		if (
			message.type !== 'reply' ||
			message.workerId !== this.worker.getId()
		) {
			return;
		}

		const pending = this.pendingReplies.get(message.requestId);
		if (!pending) {
			return;
		}
		this.pendingReplies.delete(message.requestId);
		if (message.error !== undefined) {
			pending.reject(isSerializedError(message.error)
				? transformErrorFromSerialization(message.error)
				: new Error('The web worker returned an invalid error response.'));
			return;
		}
		pending.resolve(message.result);
	}

	private close(error: Error, disposeWorker: boolean): void {
		if (this.closedError) {
			return;
		}
		this.closedError = error;
		for (const pending of this.pendingReplies.values()) {
			pending.reject(error);
		}
		this.pendingReplies.clear();
		if (disposeWorker) {
			this.worker.dispose();
		}
	}
}

export type WebWorkerServerOptions<THandler extends object> = {
	readonly getTransferables?: (
		method: WebWorkerMethodName<THandler>,
		result: unknown,
	) => readonly Transferable[];
};

export class WebWorkerServer<THandler extends object> {
	private workerId: number | null = null;

	public constructor(
		private readonly postMessage: (
			message: WebWorkerReplyMessage,
			transfer: readonly Transferable[],
		) => void,
		private readonly handler: THandler,
		private readonly options: WebWorkerServerOptions<THandler> = {},
	) { }

	public async onmessage(message: unknown): Promise<void> {
		if (!isRequestMessage(message)) {
			return;
		}
		if (this.workerId === null) {
			this.workerId = message.workerId;
		} else if (message.workerId !== this.workerId) {
			return;
		}

		try {
			const method = message.method as WebWorkerMethodName<THandler>;
			const candidate = (this.handler as Record<string, unknown>)[method];
			if (typeof candidate !== 'function') {
				throw new Error(`Missing web worker method ${method}.`);
			}
			const result = await candidate.apply(this.handler, message.args);
			const transfer = this.options.getTransferables?.(method, result) ?? [];
			this.postMessage({
				requestId: message.requestId,
				result,
				type: 'reply',
				workerId: message.workerId,
			}, transfer);
		} catch (error) {
			this.postMessage({
				error: transformErrorForSerialization(error),
				requestId: message.requestId,
				type: 'reply',
				workerId: message.workerId,
			}, []);
		}
	}
}

export function bootstrapWebWorker<THandler extends object>(
	createHandler: () => THandler,
	options: WebWorkerServerOptions<THandler> = {},
): void {
	const workerGlobal = self as unknown as {
		onmessage: ((event: MessageEvent<WebWorkerMessage>) => void) | null;
		postMessage(message: WebWorkerReplyMessage, transfer: Transferable[]): void;
	};
	const server = new WebWorkerServer<THandler>(
		(message, transfer) => workerGlobal.postMessage(message, [...transfer]),
		createHandler(),
		options,
	);
	workerGlobal.onmessage = event => {
		void server.onmessage(event.data);
	};
}

function isRequestMessage(message: unknown): message is WebWorkerRequestMessage {
	if (!message || typeof message !== 'object') {
		return false;
	}
	const candidate = message as Partial<WebWorkerRequestMessage>;
	return candidate.type === 'request' &&
		typeof candidate.workerId === 'number' &&
		typeof candidate.requestId === 'number' &&
		typeof candidate.method === 'string' &&
		Array.isArray(candidate.args);
}

function toError(error: unknown, fallbackMessage: string): Error {
	return error instanceof Error ? error : new Error(fallbackMessage);
}
