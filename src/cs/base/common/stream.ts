/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from "./cancellation.js";
import { DisposableStore, toDisposable } from "./lifecycle.js";

export interface Readable<T> {
	read(): T | null;
}

export interface ReadableStreamEvents<T> {
	on(event: "data", callback: (data: T) => void): void;
	on(event: "error", callback: (error: Error) => void): void;
	on(event: "end", callback: () => void): void;
}

export interface ReadableStream<T> extends ReadableStreamEvents<T> {
	pause(): void;
	resume(): void;
	destroy(): void;
	removeListener(event: string, callback: StreamListener<T>): void;
}

export interface WriteableStream<T> extends ReadableStream<T> {
	write(data: T): void | Promise<void>;
	error(error: Error): void;
	end(result?: T): void;
}

export interface ReadableBufferedStream<T> {
	readonly stream: ReadableStream<T>;
	readonly buffer: T[];
	readonly ended: boolean;
}

export interface WriteableStreamOptions {
	readonly highWaterMark?: number;
}

export interface IReducer<T, R = T> {
	(data: T[]): R;
}

export interface ITransformer<Original, Transformed> {
	readonly data: (data: Original) => Transformed;
	readonly error?: (error: Error) => Error;
}

type StreamListener<T> = ((data: T) => void) | ((error: Error) => void) | (() => void);

export function isReadable<T>(value: unknown): value is Readable<T> {
	return typeof value === "object" && value !== null && typeof (value as Readable<T>).read === "function";
}

export function isReadableStream<T>(value: unknown): value is ReadableStream<T> {
	const candidate = value as Partial<ReadableStream<T>> | undefined;
	return !!candidate &&
		typeof candidate.on === "function" &&
		typeof candidate.pause === "function" &&
		typeof candidate.resume === "function" &&
		typeof candidate.destroy === "function";
}

export function isReadableBufferedStream<T>(value: unknown): value is ReadableBufferedStream<T> {
	const candidate = value as Partial<ReadableBufferedStream<T>> | undefined;
	return !!candidate &&
		isReadableStream(candidate.stream) &&
		Array.isArray(candidate.buffer) &&
		typeof candidate.ended === "boolean";
}

export function newWriteableStream<T>(reducer: IReducer<T> | null, options?: WriteableStreamOptions): WriteableStream<T> {
	return new SimpleWriteableStream(reducer, options);
}

export function consumeReadable<T, R = T>(readable: Readable<T>, reducer: IReducer<T, R>): R {
	const chunks: T[] = [];

	let chunk: T | null;
	while ((chunk = readable.read()) !== null) {
		chunks.push(chunk);
	}

	return reducer(chunks);
}

export function peekReadable<T, R = T>(readable: Readable<T>, reducer: IReducer<T, R>, maxChunks: number): R | Readable<T> {
	const chunks: T[] = [];

	let lastChunk: T | null | undefined;
	while ((lastChunk = readable.read()) !== null && chunks.length < maxChunks) {
		chunks.push(lastChunk);
	}

	if (lastChunk === null) {
		return reducer(chunks);
	}

	return {
		read: () => {
			if (chunks.length) {
				return chunks.shift()!;
			}

			if (typeof lastChunk !== "undefined") {
				const result = lastChunk;
				lastChunk = undefined;
				return result;
			}

			return readable.read();
		},
	};
}

export function consumeStream<T, R = T>(stream: ReadableStreamEvents<T>, reducer: IReducer<T, R>): Promise<R>;
export function consumeStream(stream: ReadableStreamEvents<unknown>): Promise<undefined>;
export function consumeStream<T, R = T>(stream: ReadableStreamEvents<T>, reducer?: IReducer<T, R>): Promise<R | undefined> {
	return new Promise((resolve, reject) => {
		const chunks: T[] = [];
		listenStream(stream, {
			onData: data => {
				if (reducer) {
					chunks.push(data);
				}
			},
			onEnd: () => {
				resolve(reducer ? reducer(chunks) : undefined);
			},
			onError: error => {
				if (reducer) {
					reject(error);
				} else {
					resolve(undefined);
				}
			},
		});
	});
}

export interface IStreamListener<T> {
	onData(data: T): void;
	onError(error: Error): void;
	onEnd(): void;
}

export function listenStream<T>(stream: ReadableStreamEvents<T>, listener: IStreamListener<T>, token?: CancellationToken): void {
	stream.on("error", error => {
		if (!token?.isCancellationRequested) {
			listener.onError(error);
		}
	});

	stream.on("end", () => {
		if (!token?.isCancellationRequested) {
			listener.onEnd();
		}
	});

	stream.on("data", data => {
		if (!token?.isCancellationRequested) {
			listener.onData(data);
		}
	});
}

export function peekStream<T>(stream: ReadableStream<T>, maxChunks: number): Promise<ReadableBufferedStream<T>> {
	return new Promise((resolve, reject) => {
		const disposables = new DisposableStore();
		const buffer: T[] = [];

		const onData = (chunk: T): void => {
			buffer.push(chunk);
			if (buffer.length > maxChunks) {
				disposables.dispose();
				stream.pause();
				resolve({ buffer, ended: false, stream });
			}
		};
		const onError = (error: Error): void => {
			disposables.dispose();
			reject(error);
		};
		const onEnd = (): void => {
			disposables.dispose();
			resolve({ buffer, ended: true, stream });
		};

		disposables.add(toDisposable(() => stream.removeListener("error", onError)));
		stream.on("error", onError);
		disposables.add(toDisposable(() => stream.removeListener("end", onEnd)));
		stream.on("end", onEnd);
		disposables.add(toDisposable(() => stream.removeListener("data", onData)));
		stream.on("data", onData);
	});
}

export function toReadable<T>(value: T): Readable<T> {
	let consumed = false;
	return {
		read: () => {
			if (consumed) {
				return null;
			}

			consumed = true;
			return value;
		},
	};
}

export function toStream<T>(value: T, reducer: IReducer<T>): ReadableStream<T> {
	const stream = newWriteableStream(reducer);
	stream.end(value);
	return stream;
}

export function emptyStream(): ReadableStream<never> {
	const stream = newWriteableStream<never>(() => {
		throw new Error("Empty streams cannot reduce data.");
	});
	stream.end();
	return stream;
}

export function transform<Original, Transformed>(
	stream: ReadableStreamEvents<Original>,
	transformer: ITransformer<Original, Transformed>,
	reducer: IReducer<Transformed>,
): ReadableStream<Transformed> {
	const target = newWriteableStream(reducer);
	listenStream(stream, {
		onData: data => target.write(transformer.data(data)),
		onEnd: () => target.end(),
		onError: error => target.error(transformer.error ? transformer.error(error) : error),
	});

	return target;
}

export function prefixedReadable<T>(prefix: T, readable: Readable<T>, reducer: IReducer<T>): Readable<T> {
	let handledPrefix = false;
	return {
		read: () => {
			const chunk = readable.read();
			if (handledPrefix) {
				return chunk;
			}

			handledPrefix = true;
			return chunk === null ? prefix : reducer([prefix, chunk]);
		},
	};
}

export function prefixedStream<T>(prefix: T, stream: ReadableStream<T>, reducer: IReducer<T>): ReadableStream<T> {
	const target = newWriteableStream(reducer);
	let handledPrefix = false;

	listenStream(stream, {
		onData: data => {
			if (!handledPrefix) {
				handledPrefix = true;
				return target.write(reducer([prefix, data]));
			}

			return target.write(data);
		},
		onEnd: () => {
			if (!handledPrefix) {
				target.write(prefix);
			}

			target.end();
		},
		onError: error => target.error(error),
	});

	return target;
}

class SimpleWriteableStream<T> implements WriteableStream<T> {
	private readonly bufferedData: T[] = [];
	private readonly bufferedErrors: Error[] = [];
	private readonly dataListeners: Array<(data: T) => void> = [];
	private readonly errorListeners: Array<(error: Error) => void> = [];
	private readonly endListeners: Array<() => void> = [];
	private readonly pendingWriters: Array<() => void> = [];
	private flowing = false;
	private ended = false;
	private destroyed = false;

	public constructor(
		private readonly reducer: IReducer<T> | null,
		private readonly options?: WriteableStreamOptions,
	) { }

	public pause(): void {
		if (!this.destroyed) {
			this.flowing = false;
		}
	}

	public resume(): void {
		if (this.destroyed || this.flowing) {
			return;
		}

		this.flowing = true;
		this.flushData();
		this.flushErrors();
		this.flushEnd();
	}

	public write(data: T): void | Promise<void> {
		if (this.destroyed) {
			return;
		}

		if (this.flowing) {
			this.emitData(data);
			return;
		}

		this.bufferedData.push(data);
		if (typeof this.options?.highWaterMark === "number" && this.bufferedData.length > this.options.highWaterMark) {
			return new Promise(resolve => this.pendingWriters.push(resolve));
		}
	}

	public error(error: Error): void {
		if (this.destroyed) {
			return;
		}

		if (this.flowing) {
			this.emitError(error);
			return;
		}

		this.bufferedErrors.push(error);
	}

	public end(result?: T): void {
		if (this.destroyed) {
			return;
		}

		if (typeof result !== "undefined") {
			this.write(result);
		}

		this.ended = true;
		if (this.flowing) {
			this.flushEnd();
		}
	}

	public on(event: "data", callback: (data: T) => void): void;
	public on(event: "error", callback: (error: Error) => void): void;
	public on(event: "end", callback: () => void): void;
	public on(event: "data" | "error" | "end", callback: StreamListener<T>): void {
		if (this.destroyed) {
			return;
		}

		if (event === "data") {
			this.dataListeners.push(callback as (data: T) => void);
			this.resume();
		} else if (event === "error") {
			this.errorListeners.push(callback as (error: Error) => void);
			if (this.flowing) {
				this.flushErrors();
			}
		} else {
			this.endListeners.push(callback as () => void);
			if (this.flowing) {
				this.flushEnd();
			}
		}
	}

	public removeListener(event: string, callback: StreamListener<T>): void {
		if (event === "data") {
			remove(this.dataListeners, callback);
		} else if (event === "error") {
			remove(this.errorListeners, callback);
		} else if (event === "end") {
			remove(this.endListeners, callback);
		}
	}

	public destroy(): void {
		if (this.destroyed) {
			return;
		}

		this.destroyed = true;
		this.bufferedData.length = 0;
		this.bufferedErrors.length = 0;
		this.dataListeners.length = 0;
		this.errorListeners.length = 0;
		this.endListeners.length = 0;
		this.pendingWriters.length = 0;
	}

	private emitData(data: T): void {
		for (const listener of [...this.dataListeners]) {
			listener(data);
		}
	}

	private emitError(error: Error): void {
		if (!this.errorListeners.length) {
			queueMicrotask(() => {
				throw error;
			});
			return;
		}

		for (const listener of [...this.errorListeners]) {
			listener(error);
		}
	}

	private emitEnd(): void {
		for (const listener of [...this.endListeners]) {
			listener();
		}
	}

	private flushData(): void {
		if (!this.bufferedData.length) {
			return;
		}

		if (this.reducer) {
			this.emitData(this.reducer(this.bufferedData));
		} else {
			for (const data of this.bufferedData) {
				this.emitData(data);
			}
		}

		this.bufferedData.length = 0;
		for (const resolve of this.pendingWriters.splice(0)) {
			resolve();
		}
	}

	private flushErrors(): void {
		if (!this.errorListeners.length) {
			return;
		}

		for (const error of this.bufferedErrors.splice(0)) {
			this.emitError(error);
		}
	}

	private flushEnd(): void {
		if (!this.ended) {
			return;
		}

		this.emitEnd();
		this.destroy();
	}
}

function remove<T>(array: T[], value: T): void {
	const index = array.indexOf(value);
	if (index >= 0) {
		array.splice(index, 1);
	}
}
