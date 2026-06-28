import { Disposable, DisposableStore, type IDisposable, toDisposable } from "./lifecycle.js";

export interface Event<T> {
    (listener: (event: T) => unknown, thisArgs?: unknown, disposables?: IDisposable[] | DisposableStore): IDisposable;
}

export namespace Event {
    export const None: Event<unknown> = () => Disposable.None;

    export function once<T>(event: Event<T>): Event<T> {
        return (listener, thisArgs, disposables) => {
            let didFire = false;
            let disposable: IDisposable | undefined;

            disposable = event((value) => {
                if (didFire) {
                    return;
                }

                didFire = true;
                disposable?.dispose();
                listener.call(thisArgs, value);
            });

            if (didFire) {
                disposable.dispose();
            }

            addToDisposables(disposable, disposables);
            return disposable;
        };
    }

    export function map<I, O>(event: Event<I>, mapFn: (event: I) => O): Event<O> {
        return (listener, thisArgs, disposables) => event(
            value => listener.call(thisArgs, mapFn(value)),
            undefined,
            disposables,
        );
    }

    export function filter<T, U extends T>(event: Event<T>, filterFn: (event: T) => event is U): Event<U>;
    export function filter<T>(event: Event<T>, filterFn: (event: T) => boolean): Event<T>;
    export function filter<T>(event: Event<T>, filterFn: (event: T) => boolean): Event<T> {
        return (listener, thisArgs, disposables) => event((value) => {
            if (filterFn(value)) {
                listener.call(thisArgs, value);
            }
        }, undefined, disposables);
    }

    export function any<T>(...events: Event<T>[]): Event<T> {
        return (listener, thisArgs, disposables) => {
            const store = new DisposableStore();

            for (const event of events) {
                store.add(event(listener, thisArgs));
            }

            addToDisposables(store, disposables);
            return store;
        };
    }
}

export type EmitterOptions = {
    onWillAddFirstListener?: () => void;
    onDidAddFirstListener?: () => void;
    onDidAddListener?: () => void;
    onWillRemoveListener?: () => void;
    onDidRemoveLastListener?: () => void;
};

export class Emitter<T> implements IDisposable {
    private readonly listeners = new Set<(event: T) => unknown>();
    private disposed = false;

    public readonly event: Event<T> = (listener, thisArgs, disposables) => {
        if (this.disposed) {
            return Disposable.None;
        }

        const firstListener = this.listeners.size === 0;
        if (firstListener) {
            this.options?.onWillAddFirstListener?.();
        }

        const boundListener = typeof thisArgs === "undefined"
            ? listener
            : (event: T) => listener.call(thisArgs, event);

        this.listeners.add(boundListener);

        if (firstListener) {
            this.options?.onDidAddFirstListener?.();
        }
        this.options?.onDidAddListener?.();

        const result = toDisposable(() => {
            if (!this.listeners.delete(boundListener)) {
                return;
            }

            this.options?.onWillRemoveListener?.();
            if (this.listeners.size === 0) {
                this.options?.onDidRemoveLastListener?.();
            }
        });

        addToDisposables(result, disposables);
        return result;
    };

    constructor(private readonly options?: EmitterOptions) {}

    public fire(event: T): void {
        if (this.disposed) {
            return;
        }

        for (const listener of Array.from(this.listeners)) {
            listener(event);
        }
    }

    public dispose(): void {
        if (this.disposed) {
            return;
        }

        this.disposed = true;
        this.listeners.clear();
    }
}

export class EventBufferer {
    private readonly data: Array<{ buffers: Array<() => void> }> = [];

    public wrapEvent<T>(event: Event<T>): Event<T>;
    public wrapEvent<T>(event: Event<T>, reduce: (last: T | undefined, event: T) => T): Event<T>;
    public wrapEvent<T, O>(event: Event<T>, reduce: (last: O | undefined, event: T) => O, initial: O): Event<O>;
    public wrapEvent<T, O>(
        event: Event<T>,
        reduce?: (last: T | O | undefined, event: T) => T | O,
        initial?: O,
    ): Event<T | O> {
        const hasInitial = arguments.length >= 3;

        return (listener, thisArgs, disposables) => {
            let items: T[] | undefined;

            return event(value => {
                const data = this.data[this.data.length - 1];

                if (!data) {
                    if (reduce) {
                        listener.call(thisArgs, reduce(hasInitial ? initial : undefined, value));
                    } else {
                        listener.call(thisArgs, value);
                    }
                    return;
                }

                if (!reduce) {
                    data.buffers.push(() => listener.call(thisArgs, value));
                    return;
                }

                if (!items) {
                    items = [];
                    data.buffers.push(() => {
                        const bufferedItems = items ?? [];
                        items = undefined;

                        if (!bufferedItems.length) {
                            return;
                        }

                        const reduced = hasInitial
                            ? bufferedItems.reduce(
                                (last, item) => reduce(last, item) as O,
                                initial as O,
                            )
                            : bufferedItems.reduce(
                                (last, item) => reduce(last, item) as T,
                                undefined as T | undefined,
                            );

                        listener.call(thisArgs, reduced);
                    });
                }

                items.push(value);
            }, undefined, disposables);
        };
    }

    public bufferEvents<R = void>(callback: () => R): R {
        const data = { buffers: [] as Array<() => void> };
        this.data.push(data);

        try {
            return callback();
        } finally {
            this.data.pop();
            for (const flush of data.buffers) {
                flush();
            }
        }
    }
}

function addToDisposables(disposable: IDisposable, disposables?: IDisposable[] | DisposableStore): void {
    if (!disposables) {
        return;
    }

    if (Array.isArray(disposables)) {
        disposables.push(disposable);
        return;
    }

    disposables.add(disposable);
}
