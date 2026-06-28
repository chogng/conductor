/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource, type CancellationToken } from "./cancellation.js";
import { Disposable, type IDisposable } from "./lifecycle.js";

type DecoratedFunction = (...args: any[]) => unknown;
type DecoratedFunctionKey = "value" | "get";

function createDecorator(mapFn: (fn: DecoratedFunction, key: string) => DecoratedFunction): MethodDecorator {
	return (_target: object, key: string | symbol, descriptor: PropertyDescriptor): void => {
		const fnKey = getDecoratedFunctionKey(descriptor);
		if (!fnKey || typeof key === "symbol") {
			throw new Error("not supported");
		}

		const fn = descriptor[fnKey] as DecoratedFunction | undefined;
		if (!fn) {
			throw new Error("not supported");
		}

		descriptor[fnKey] = mapFn(fn, key);
	};
}

function getDecoratedFunctionKey(descriptor: PropertyDescriptor): DecoratedFunctionKey | null {
	if (typeof descriptor.value === "function") {
		return "value";
	}

	if (typeof descriptor.get === "function") {
		return "get";
	}

	return null;
}

export function memoize(
	_target: object,
	key: string | symbol,
	descriptor: PropertyDescriptor,
): void {
	const fnKey = getDecoratedFunctionKey(descriptor);
	if (!fnKey) {
		throw new Error("not supported");
	}

	const fn = descriptor[fnKey] as DecoratedFunction | undefined;
	if (!fn) {
		throw new Error("not supported");
	}

	if (fnKey === "value" && fn.length !== 0) {
		console.warn("Memoize should only be used in functions with zero parameters");
	}

	const memoizeKey = `$memoize$${String(key)}`;
	descriptor[fnKey] = function (this: Record<string, unknown>, ...args: unknown[]) {
		if (!Object.prototype.hasOwnProperty.call(this, memoizeKey)) {
			Object.defineProperty(this, memoizeKey, {
				configurable: false,
				enumerable: false,
				writable: false,
				value: fn.apply(this, args),
			});
		}

		return this[memoizeKey];
	};
}

export interface IDebounceReducer<T> {
	(previousValue: T, ...args: any[]): T;
}

export function debounce<T>(
	delay: number,
	reducer?: IDebounceReducer<T>,
	initialValueProvider?: () => T,
): MethodDecorator {
	return createDecorator((fn, key) => {
		const timerKey = `$debounce$${key}`;
		const resultKey = `$debounce$result$${key}`;

		return function (this: Record<string, any>, ...args: any[]) {
			if (!Object.prototype.hasOwnProperty.call(this, resultKey)) {
				this[resultKey] = initialValueProvider ? initialValueProvider() : undefined;
			}

			clearTimeout(this[timerKey]);

			if (reducer) {
				this[resultKey] = reducer(this[resultKey], ...args);
				args = [this[resultKey]];
			}

			this[timerKey] = setTimeout(() => {
				fn.apply(this, args);
				this[resultKey] = initialValueProvider ? initialValueProvider() : undefined;
			}, delay);
		};
	});
}

export function throttle<T>(
	delay: number,
	reducer?: IDebounceReducer<T>,
	initialValueProvider?: () => T,
): MethodDecorator {
	return createDecorator((fn, key) => {
		const timerKey = `$throttle$timer$${key}`;
		const resultKey = `$throttle$result$${key}`;
		const lastRunKey = `$throttle$lastRun$${key}`;
		const pendingKey = `$throttle$pending$${key}`;

		return function (this: Record<string, any>, ...args: any[]) {
			if (!Object.prototype.hasOwnProperty.call(this, resultKey)) {
				this[resultKey] = initialValueProvider ? initialValueProvider() : undefined;
			}
			if (this[lastRunKey] === null || this[lastRunKey] === undefined) {
				this[lastRunKey] = -Number.MAX_VALUE;
			}

			if (reducer) {
				this[resultKey] = reducer(this[resultKey], ...args);
			}

			if (this[pendingKey]) {
				return;
			}

			const nextTime = this[lastRunKey] + delay;
			if (nextTime <= Date.now()) {
				this[lastRunKey] = Date.now();
				fn.apply(this, [this[resultKey]]);
				this[resultKey] = initialValueProvider ? initialValueProvider() : undefined;
			} else {
				this[pendingKey] = true;
				this[timerKey] = setTimeout(() => {
					this[pendingKey] = false;
					this[lastRunKey] = Date.now();
					fn.apply(this, [this[resultKey]]);
					this[resultKey] = initialValueProvider ? initialValueProvider() : undefined;
				}, nextTime - Date.now());
			}
		};
	});
}

type FunctionWithOptionalCancellationToken<TArgs extends unknown[], TReturn> =
	(...args: [...TArgs, cancellationToken?: CancellationToken]) => TReturn;

class CancelPreviousCallRecord implements IDisposable {
	public constructor(
		private readonly source: CancellationTokenSource,
		private readonly parentListener: IDisposable | undefined,
	) {}

	public dispose(cancel = false): void {
		if (cancel) {
			this.source.cancel();
		}

		this.parentListener?.dispose();
		this.source.dispose();
	}
}

export function cancelPreviousCalls<
	TObject extends Disposable,
	TArgs extends unknown[],
	TReturn,
>(
	_proto: TObject,
	methodName: string | symbol,
	descriptor: TypedPropertyDescriptor<FunctionWithOptionalCancellationToken<TArgs, TReturn>>,
): TypedPropertyDescriptor<FunctionWithOptionalCancellationToken<TArgs, TReturn>> {
	const originalMethod = descriptor.value;
	if (!originalMethod) {
		throw new Error(`Method '${String(methodName)}' is not defined.`);
	}
	if (typeof methodName === "symbol") {
		throw new Error("not supported");
	}

	const objectRecords = new WeakMap<TObject, Map<string, CancelPreviousCallRecord>>();
	descriptor.value = function (
		this: TObject,
		...args: Parameters<typeof originalMethod>
	): TReturn {
		let record = objectRecords.get(this);
		if (!record) {
			record = new Map();
			objectRecords.set(this, record);
			(this as unknown as { _register(disposable: IDisposable): IDisposable })._register({
				dispose: () => {
					for (const cancellationRecord of record!.values()) {
						cancellationRecord.dispose();
					}
					objectRecords.delete(this);
				},
			});
		}

		record.get(methodName)?.dispose(true);
		record.delete(methodName);

		const lastArgument = args.length > 0 ? args[args.length - 1] : undefined;
		const parentToken = isCancellationToken(lastArgument) ? lastArgument : undefined;
		const cancellationSource = new CancellationTokenSource();
		if (parentToken?.isCancellationRequested) {
			cancellationSource.cancel();
		}
		const parentListener = parentToken?.onCancellationRequested(() => cancellationSource.cancel());
		record.set(methodName, new CancelPreviousCallRecord(cancellationSource, parentListener));

		if (parentToken) {
			args[args.length - 1] = cancellationSource.token as Parameters<typeof originalMethod>[number];
		} else {
			args.push(cancellationSource.token as Parameters<typeof originalMethod>[number]);
		}

		return originalMethod.call(this, ...args);
	};

	return descriptor;
}

function isCancellationToken(value: unknown): value is CancellationToken {
	return typeof value === "object" &&
		value !== null &&
		typeof (value as CancellationToken).isCancellationRequested === "boolean" &&
		typeof (value as CancellationToken).onCancellationRequested === "function";
}
