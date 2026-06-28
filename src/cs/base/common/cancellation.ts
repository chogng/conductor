/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from './event.js';
import { DisposableStore, type IDisposable } from './lifecycle.js';

export interface CancellationToken {
	/**
	 * A flag signalling if cancellation has been requested.
	 */
	readonly isCancellationRequested: boolean;

	/**
	 * An event which fires when cancellation is requested. This event
	 * only ever fires once as cancellation can only happen once. Listeners
	 * that are registered after cancellation will be called on the next event loop run,
	 * but also only once.
	 */
	readonly onCancellationRequested: Event<void>;
}

const shortcutEvent: Event<void> = Object.freeze((callback, context): IDisposable => {
	const handle = setTimeout(() => callback.call(context, undefined), 0);
	return {
		dispose(): void {
			clearTimeout(handle);
		},
	};
});

export namespace CancellationToken {
	export function isCancellationToken(value: unknown): value is CancellationToken {
		if (value === CancellationToken.None || value === CancellationToken.Cancelled) {
			return true;
		}

		if (value instanceof MutableToken) {
			return true;
		}

		if (!value || typeof value !== 'object') {
			return false;
		}

		return typeof (value as CancellationToken).isCancellationRequested === 'boolean'
			&& typeof (value as CancellationToken).onCancellationRequested === 'function';
	}

	export const None = Object.freeze<CancellationToken>({
		isCancellationRequested: false,
		onCancellationRequested: Event.None as Event<void>,
	});

	export const Cancelled = Object.freeze<CancellationToken>({
		isCancellationRequested: true,
		onCancellationRequested: shortcutEvent,
	});
}

class MutableToken implements CancellationToken {
	private isCancelled = false;
	private emitter: Emitter<void> | null = null;

	public cancel(): void {
		if (this.isCancelled) {
			return;
		}

		this.isCancelled = true;
		if (this.emitter) {
			this.emitter.fire(undefined);
			this.dispose();
		}
	}

	public get isCancellationRequested(): boolean {
		return this.isCancelled;
	}

	public get onCancellationRequested(): Event<void> {
		if (this.isCancelled) {
			return shortcutEvent;
		}

		if (!this.emitter) {
			this.emitter = new Emitter<void>();
		}

		return this.emitter.event;
	}

	public dispose(): void {
		if (this.emitter) {
			this.emitter.dispose();
			this.emitter = null;
		}
	}
}

export class CancellationTokenSource implements IDisposable {
	private tokenValue: CancellationToken | undefined = undefined;
	private parentListener: IDisposable | undefined = undefined;

	public constructor(parent?: CancellationToken) {
		this.parentListener = parent?.onCancellationRequested(this.cancel, this);
	}

	public get token(): CancellationToken {
		if (!this.tokenValue) {
			this.tokenValue = new MutableToken();
		}

		return this.tokenValue;
	}

	public cancel(): void {
		if (!this.tokenValue) {
			this.tokenValue = CancellationToken.Cancelled;
		}
		else if (this.tokenValue instanceof MutableToken) {
			this.tokenValue.cancel();
		}
	}

	public dispose(cancel = false): void {
		if (cancel) {
			this.cancel();
		}

		this.parentListener?.dispose();
		this.parentListener = undefined;

		if (!this.tokenValue) {
			this.tokenValue = CancellationToken.None;
		}
		else if (this.tokenValue instanceof MutableToken) {
			this.tokenValue.dispose();
		}
	}
}

export function cancelOnDispose(store: DisposableStore): CancellationToken {
	const source = new CancellationTokenSource();
	store.add({
		dispose(): void {
			source.cancel();
		},
	});
	return source.token;
}

/**
 * A pool that aggregates multiple cancellation tokens. The pool's own token is
 * cancelled only after every token added to the pool has been cancelled.
 */
export class CancellationTokenPool implements IDisposable {
	private readonly source = new CancellationTokenSource();
	private readonly listeners = new DisposableStore();

	private total = 0;
	private cancelled = 0;
	private isDone = false;

	public get token(): CancellationToken {
		return this.source.token;
	}

	public add(token: CancellationToken): void {
		if (this.isDone) {
			return;
		}

		this.total++;

		if (token.isCancellationRequested) {
			this.cancelled++;
			this.check();
			return;
		}

		const disposable = token.onCancellationRequested(() => {
			disposable.dispose();
			this.cancelled++;
			this.check();
		});
		this.listeners.add(disposable);
	}

	private check(): void {
		if (!this.isDone && this.total > 0 && this.total === this.cancelled) {
			this.isDone = true;
			this.listeners.dispose();
			this.source.cancel();
		}
	}

	public dispose(): void {
		this.listeners.dispose();
		this.source.dispose();
	}
}
