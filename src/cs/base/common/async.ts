import { CancellationError } from "./errors.js";
import { Disposable, DisposableStore, type IDisposable, isDisposable, toDisposable } from "./lifecycle.js";

export function isThenable<T>(value: unknown): value is PromiseLike<T> {
    return !!value && typeof (value as PromiseLike<T>).then === "function";
}

export interface CancellationToken {
    readonly isCancellationRequested: boolean;
    readonly onCancellationRequested: (listener: () => void) => IDisposable;
}

class MutableCancellationToken implements CancellationToken {
    private readonly listeners = new Set<() => void>();
    private cancelled = false;

    public get isCancellationRequested(): boolean {
        return this.cancelled;
    }

    public readonly onCancellationRequested = (listener: () => void): IDisposable => {
        if (this.cancelled) {
            listener();
            return Disposable.None;
        }

        this.listeners.add(listener);
        return toDisposable(() => this.listeners.delete(listener));
    };

    public cancel(): void {
        if (this.cancelled) {
            return;
        }

        this.cancelled = true;
        const listeners = Array.from(this.listeners);
        this.listeners.clear();

        for (const listener of listeners) {
            listener();
        }
    }

    public dispose(): void {
        this.listeners.clear();
    }
}

export namespace CancellationToken {
    export const None: CancellationToken = Object.freeze({
        isCancellationRequested: false,
        onCancellationRequested: () => Disposable.None,
    });

    export const Cancelled: CancellationToken = Object.freeze({
        isCancellationRequested: true,
        onCancellationRequested: (listener: () => void) => {
            listener();
            return Disposable.None;
        },
    });
}

export class CancellationTokenSource implements IDisposable {
    private tokenValue: MutableCancellationToken | undefined;
    private disposed = false;

    public get token(): CancellationToken {
        if (!this.tokenValue) {
            this.tokenValue = new MutableCancellationToken();
        }

        return this.tokenValue;
    }

    public cancel(): void {
        if (this.disposed) {
            return;
        }

        if (!this.tokenValue) {
            this.tokenValue = new MutableCancellationToken();
        }

        this.tokenValue.cancel();
    }

    public dispose(): void {
        this.disposed = true;
        this.tokenValue?.dispose();
    }
}

export interface CancelablePromise<T> extends Promise<T> {
    cancel(): void;
}

export function createCancelablePromise<T>(callback: (token: CancellationToken) => Promise<T>): CancelablePromise<T> {
    const source = new CancellationTokenSource();
    const thenable = callback(source.token);
    let isCancelled = false;

    const promise = new Promise<T>((resolve, reject) => {
        const subscription = source.token.onCancellationRequested(() => {
            isCancelled = true;
            subscription.dispose();
            reject(new CancellationError());
        });

        Promise.resolve(thenable).then((value) => {
            subscription.dispose();
            source.dispose();

            if (!isCancelled) {
                resolve(value);
            }
            else if (isDisposable(value)) {
                value.dispose();
            }
        }, (error) => {
            subscription.dispose();
            source.dispose();
            reject(error);
        });
    }) as CancelablePromise<T>;

    promise.cancel = () => {
        source.cancel();
        source.dispose();
    };

    return promise;
}

export function asPromise<T>(callback: () => T | PromiseLike<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        try {
            const value = callback();
            if (isThenable<T>(value)) {
                value.then(resolve, reject);
            }
            else {
                resolve(value);
            }
        }
        catch (error) {
            reject(error);
        }
    });
}

export function timeout(millis: number): CancelablePromise<void>;
export function timeout(millis: number, token: CancellationToken): Promise<void>;
export function timeout(millis: number, token?: CancellationToken): CancelablePromise<void> | Promise<void> {
    if (token) {
        if (token.isCancellationRequested) {
            return Promise.reject(new CancellationError());
        }

        return new Promise<void>((resolve, reject) => {
            const handle = setTimeout(() => {
                disposable.dispose();
                resolve();
            }, millis);

            const disposable = token.onCancellationRequested(() => {
                clearTimeout(handle);
                disposable.dispose();
                reject(new CancellationError());
            });
        });
    }

    return createCancelablePromise<void>((cancelToken) => timeout(millis, cancelToken));
}

export function disposableTimeout(handler: () => void, timeoutMs = 0): IDisposable {
    const handle = setTimeout(handler, timeoutMs);
    return toDisposable(() => clearTimeout(handle));
}

export class TimeoutTimer implements IDisposable {
    private timeout: ReturnType<typeof setTimeout> | undefined;
    private disposed = false;

    public cancel(): void {
        if (this.timeout !== undefined) {
            clearTimeout(this.timeout);
            this.timeout = undefined;
        }
    }

    public cancelAndSet(runner: () => void, timeoutMs: number): void {
        if (this.disposed) {
            throw new Error("Calling 'cancelAndSet' on a disposed TimeoutTimer");
        }

        this.cancel();
        this.timeout = setTimeout(() => {
            this.timeout = undefined;
            runner();
        }, timeoutMs);
    }

    public setIfNotSet(runner: () => void, timeoutMs: number): void {
        if (this.disposed) {
            throw new Error("Calling 'setIfNotSet' on a disposed TimeoutTimer");
        }

        if (this.timeout !== undefined) {
            return;
        }

        this.timeout = setTimeout(() => {
            this.timeout = undefined;
            runner();
        }, timeoutMs);
    }

    public isScheduled(): boolean {
        return this.timeout !== undefined;
    }

    public dispose(): void {
        this.disposed = true;
        this.cancel();
    }
}

export function raceTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout?: () => void): Promise<T | undefined> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<undefined>((resolve) => {
        timer = setTimeout(() => {
            onTimeout?.();
            resolve(undefined);
        }, timeoutMs);
    });

    return Promise.race([
        promise.finally(() => {
            if (timer) {
                clearTimeout(timer);
            }
        }),
        timeoutPromise,
    ]);
}

export class DeferredPromise<T> {
    public readonly promise: Promise<T>;
    public readonly p: Promise<T>;

    private completeCallback!: (value: T | PromiseLike<T>) => void;
    private errorCallback!: (error: unknown) => void;
    private settled = false;

    constructor() {
        this.promise = new Promise<T>((resolve, reject) => {
            this.completeCallback = resolve;
            this.errorCallback = reject;
        });
        this.p = this.promise;
    }

    public get isSettled(): boolean {
        return this.settled;
    }

    public complete(value: T | PromiseLike<T>): void {
        if (this.settled) {
            return;
        }

        this.settled = true;
        this.completeCallback(value);
    }

    public error(error: unknown): void {
        if (this.settled) {
            return;
        }

        this.settled = true;
        this.errorCallback(error);
    }

    public cancel(): void {
        this.error(new CancellationError());
    }
}

export type ITask<T> = () => T;

export class Delayer<T> implements IDisposable {
    private timeout: ReturnType<typeof setTimeout> | undefined;
    private completionPromise: Promise<T> | undefined;
    private doResolve: ((value: T | PromiseLike<T>) => void) | undefined;
    private task: ITask<T | PromiseLike<T>> | undefined;

    constructor(public readonly defaultDelay: number) {}

    public trigger(task: ITask<T | PromiseLike<T>>, delay = this.defaultDelay): Promise<T> {
        this.task = task;
        this.cancelTimeout();

        if (!this.completionPromise) {
            this.completionPromise = new Promise<T>((resolve) => {
                this.doResolve = resolve;
            }).then(() => {
                this.completionPromise = undefined;
                this.doResolve = undefined;

                const currentTask = this.task;
                this.task = undefined;

                return currentTask?.() as T | PromiseLike<T>;
            });
        }

        this.timeout = setTimeout(() => {
            this.timeout = undefined;
            this.doResolve?.(undefined as T);
        }, delay);

        return this.completionPromise;
    }

    public isTriggered(): boolean {
        return this.timeout !== undefined;
    }

    public cancel(): void {
        this.cancelTimeout();
        this.completionPromise = undefined;
        this.doResolve = undefined;
        this.task = undefined;
    }

    public dispose(): void {
        this.cancel();
    }

    private cancelTimeout(): void {
        if (this.timeout !== undefined) {
            clearTimeout(this.timeout);
            this.timeout = undefined;
        }
    }
}

export class Throttler implements IDisposable {
    private activePromise: Promise<unknown> | undefined;
    private queuedPromise: Promise<unknown> | undefined;
    private queuedPromiseFactory: (() => Promise<unknown>) | undefined;
    private disposed = false;

    public queue<T>(promiseFactory: () => Promise<T>): Promise<T> {
        if (this.disposed) {
            return Promise.reject(new Error("Throttler is disposed"));
        }

        if (this.activePromise) {
            this.queuedPromiseFactory = promiseFactory;

            if (!this.queuedPromise) {
                const onComplete = () => {
                    this.queuedPromise = undefined;

                    if (!this.queuedPromiseFactory) {
                        return Promise.resolve(undefined);
                    }

                    const nextFactory = this.queuedPromiseFactory;
                    this.queuedPromiseFactory = undefined;
                    return this.queue(nextFactory);
                };

                this.queuedPromise = this.activePromise.then(onComplete, onComplete);
            }

            return new Promise<T>((resolve, reject) => {
                this.queuedPromise?.then(resolve as (value: unknown) => void, reject);
            });
        }

        this.activePromise = promiseFactory();

        return new Promise<T>((resolve, reject) => {
            this.activePromise?.then(resolve as (value: unknown) => void, reject).finally(() => {
                this.activePromise = undefined;
            });
        });
    }

    public dispose(): void {
        this.disposed = true;
        this.activePromise = undefined;
        this.queuedPromise = undefined;
        this.queuedPromiseFactory = undefined;
    }
}

export class RunOnceScheduler<Runner extends (...args: never[]) => unknown = () => unknown> implements IDisposable {
    private timeout: ReturnType<typeof setTimeout> | undefined;

    constructor(
        private readonly runner: Runner,
        private readonly delay: number,
    ) {}

    public schedule(delay = this.delay): void {
        this.cancel();
        this.timeout = setTimeout(() => {
            this.timeout = undefined;
            this.runner();
        }, delay);
    }

    public cancel(): void {
        if (this.timeout !== undefined) {
            clearTimeout(this.timeout);
            this.timeout = undefined;
        }
    }

    public isScheduled(): boolean {
        return this.timeout !== undefined;
    }

    public dispose(): void {
        this.cancel();
    }
}

export interface IdleDeadline {
    readonly didTimeout: boolean;
    timeRemaining(): number;
}

type IdleApi = {
    readonly requestIdleCallback?: (
        callback: (deadline: IdleDeadline) => void,
        options?: { readonly timeout?: number },
    ) => number;
    readonly cancelIdleCallback?: (handle: number) => void;
};

export let _runWhenIdle: (
    targetWindow: IdleApi,
    callback: (idle: IdleDeadline) => void,
    timeout?: number,
) => IDisposable;

export let runWhenGlobalIdle: (
    callback: (idle: IdleDeadline) => void,
    timeout?: number,
) => IDisposable;

(() => {
    _runWhenIdle = (targetWindow, runner, timeoutMs) => {
        if (
            typeof targetWindow.requestIdleCallback === "function" &&
            typeof targetWindow.cancelIdleCallback === "function"
        ) {
            const handle = targetWindow.requestIdleCallback(
                runner,
                typeof timeoutMs === "number" ? { timeout: timeoutMs } : undefined,
            );
            return toDisposable(() => targetWindow.cancelIdleCallback?.(handle));
        }

        const handle = setTimeout(() => {
            const end = Date.now() + 15;
            runner(Object.freeze({
                didTimeout: true,
                timeRemaining: () => Math.max(0, end - Date.now()),
            }));
        }, 0);

        return toDisposable(() => clearTimeout(handle));
    };

    runWhenGlobalIdle = (runner, timeoutMs) =>
        _runWhenIdle(globalThis as IdleApi, runner, timeoutMs);
})();

export class TaskSequentializer implements IDisposable {
    private readonly pending = new DisposableStore();
    private current: Promise<unknown> | undefined;

    public setPending(task: Promise<unknown>, disposable?: IDisposable): void {
        this.pending.clear();
        if (disposable) {
            this.pending.add(disposable);
        }
        const current = task.finally(() => {
            if (this.current === current) {
                this.current = undefined;
                this.pending.clear();
            }
        });
        this.current = current;
    }

    public hasPending(): boolean {
        return !!this.current;
    }

    public join(): Promise<unknown> | undefined {
        return this.current;
    }

    public dispose(): void {
        this.pending.dispose();
        this.current = undefined;
    }
}
