export interface IDisposable {
    dispose(): void;
}

export function isDisposable(value: unknown): value is IDisposable {
    return typeof value === "object"
        && value !== null
        && typeof (value as IDisposable).dispose === "function";
}

export function toDisposable(dispose: () => void): IDisposable {
    return { dispose };
}

export function combinedDisposable(...disposables: Array<IDisposable | undefined>): IDisposable {
    return toDisposable(() => {
        for (const disposable of disposables) {
            disposable?.dispose();
        }
    });
}

export class DisposableStore implements IDisposable {
    private readonly disposables = new Set<IDisposable>();
    private disposed = false;

    public get isDisposed(): boolean {
        return this.disposed;
    }

    public add<T extends IDisposable>(disposable: T): T {
        if (this.disposed) {
            disposable.dispose();
        }
        else {
            this.disposables.add(disposable);
        }

        return disposable;
    }

    public delete(disposable: IDisposable): void {
        this.disposables.delete(disposable);
    }

    public clear(): void {
        const items = Array.from(this.disposables);
        this.disposables.clear();

        for (const disposable of items) {
            disposable.dispose();
        }
    }

    public dispose(): void {
        if (this.disposed) {
            return;
        }

        this.disposed = true;
        this.clear();
    }
}

export abstract class Disposable implements IDisposable {
    public static readonly None = Object.freeze<IDisposable>({ dispose() {} });

    private readonly store = new DisposableStore();

    protected _register<T extends IDisposable>(disposable: T): T {
        return this.store.add(disposable);
    }

    public dispose(): void {
        this.store.dispose();
    }
}

export class MutableDisposable<T extends IDisposable = IDisposable> implements IDisposable {
    private value: T | undefined;
    private disposed = false;

    public get current(): T | undefined {
        return this.value;
    }

    public set current(next: T | undefined) {
        if (this.value === next) {
            return;
        }

        this.value?.dispose();
        this.value = undefined;

        if (this.disposed) {
            next?.dispose();
            return;
        }

        this.value = next;
    }

    public clear(): void {
        this.current = undefined;
    }

    public dispose(): void {
        if (this.disposed) {
            return;
        }

        this.disposed = true;
        this.value?.dispose();
        this.value = undefined;
    }
}
