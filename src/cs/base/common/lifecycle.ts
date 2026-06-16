export interface IDisposable {
    dispose(): void;
}

export interface IDisposableTracker {
    trackDisposable(disposable: IDisposable): void;
    setParent(child: IDisposable, parent: IDisposable | null): void;
    markAsDisposed(disposable: IDisposable): void;
    markAsSingleton(disposable: IDisposable): void;
}

export interface DisposableInfo {
    readonly value: IDisposable;
    readonly source: string | null;
    readonly parent: IDisposable | null;
    readonly isSingleton: boolean;
    readonly idx: number;
}

let disposableTracker: IDisposableTracker | null = null;

export class DisposableTracker implements IDisposableTracker {
    private static idx = 0;

    private readonly livingDisposables = new Map<IDisposable, DisposableInfo>();

    private getDisposableData(disposable: IDisposable): DisposableInfo {
        let data = this.livingDisposables.get(disposable);
        if (!data) {
            data = {
                idx: DisposableTracker.idx++,
                isSingleton: false,
                parent: null,
                source: null,
                value: disposable,
            };
            this.livingDisposables.set(disposable, data);
        }

        return data;
    }

    public trackDisposable(disposable: IDisposable): void {
        const data = this.getDisposableData(disposable);
        if (!data.source) {
            this.livingDisposables.set(disposable, {
                ...data,
                source: new Error().stack ?? null,
            });
        }
    }

    public setParent(child: IDisposable, parent: IDisposable | null): void {
        const data = this.getDisposableData(child);
        this.livingDisposables.set(child, {
            ...data,
            parent,
        });
    }

    public markAsDisposed(disposable: IDisposable): void {
        this.livingDisposables.delete(disposable);
    }

    public markAsSingleton(disposable: IDisposable): void {
        const data = this.getDisposableData(disposable);
        this.livingDisposables.set(disposable, {
            ...data,
            isSingleton: true,
        });
    }

    public getTrackedDisposables(): IDisposable[] {
        return this.getLeakingDisposables().map(leak => leak.value);
    }

    public computeLeakingDisposables(maxReported = 10): { leaks: DisposableInfo[]; details: string } | undefined {
        const leaks = this.getUncoveredLeakingDisposables();
        if (!leaks.length) {
            return undefined;
        }

        const reportedLeaks = leaks.slice(0, maxReported);
        const details = reportedLeaks.map((leak, index) => {
            const source = leak.source ? `\n${this.formatStack(leak.source)}` : "";
            return [
                "",
                `==================== Leaking disposable ${index + 1}/${leaks.length}: ${leak.value.constructor.name} ====================`,
                source,
                "============================================================",
            ].join("\n");
        }).join("\n");

        const remaining = leaks.length - reportedLeaks.length;
        return {
            leaks,
            details: remaining > 0
                ? `${details}\n\n... and ${remaining} more leaking disposables`
                : details,
        };
    }

    private getLeakingDisposables(): DisposableInfo[] {
        const rootParentCache = new Map<DisposableInfo, DisposableInfo>();
        return [...this.livingDisposables.values()]
            .filter(info => info.source !== null && !this.getRootParent(info, rootParentCache).isSingleton)
            .sort((a, b) => a.idx - b.idx);
    }

    private getUncoveredLeakingDisposables(): DisposableInfo[] {
        const leaks = this.getLeakingDisposables();
        const leakingValues = new Set(leaks.map(leak => leak.value));
        return leaks.filter(leak => !leak.parent || !leakingValues.has(leak.parent));
    }

    private getRootParent(info: DisposableInfo, cache: Map<DisposableInfo, DisposableInfo>): DisposableInfo {
        const cached = cache.get(info);
        if (cached) {
            return cached;
        }

        const parent = info.parent ? this.livingDisposables.get(info.parent) : undefined;
        const root = parent ? this.getRootParent(parent, cache) : info;
        cache.set(info, root);
        return root;
    }

    private formatStack(stack: string): string {
        return stack
            .split("\n")
            .map(line => line.trim())
            .filter(line => line && line !== "Error")
            .filter(line => !line.includes("DisposableTracker.trackDisposable"))
            .filter(line => !line.includes("trackDisposable"))
            .join("\n");
    }
}

export function setDisposableTracker(tracker: IDisposableTracker | null): void {
    disposableTracker = tracker;
}

export function trackDisposable<T extends IDisposable>(disposable: T): T {
    disposableTracker?.trackDisposable(disposable);
    return disposable;
}

export function markAsSingleton<T extends IDisposable>(disposable: T): T {
    disposableTracker?.markAsSingleton(disposable);
    return disposable;
}

function markAsDisposed(disposable: IDisposable): void {
    disposableTracker?.markAsDisposed(disposable);
}

function setParentOfDisposable(child: IDisposable, parent: IDisposable | null): void {
    disposableTracker?.setParent(child, parent);
}

function setParentOfDisposables(children: Array<IDisposable | undefined>, parent: IDisposable | null): void {
    if (!disposableTracker) {
        return;
    }

    for (const child of children) {
        if (child) {
            disposableTracker.setParent(child, parent);
        }
    }
}

export function isDisposable(value: unknown): value is IDisposable {
    return typeof value === "object"
        && value !== null
        && typeof (value as IDisposable).dispose === "function";
}

export function toDisposable(dispose: () => void): IDisposable {
    return new FunctionDisposable(dispose);
}

export function combinedDisposable(...disposables: Array<IDisposable | undefined>): IDisposable {
    const parent = toDisposable(() => {
        for (const disposable of disposables) {
            disposable?.dispose();
        }
    });
    setParentOfDisposables(disposables, parent);
    return parent;
}

class FunctionDisposable implements IDisposable {
    private disposed = false;

    public constructor(private readonly fn: () => void) {
        trackDisposable(this);
    }

    public dispose(): void {
        if (this.disposed) {
            return;
        }

        this.disposed = true;
        markAsDisposed(this);
        this.fn();
    }
}

export class DisposableStore implements IDisposable {
    private readonly disposables = new Set<IDisposable>();
    private disposed = false;

    public constructor() {
        trackDisposable(this);
    }

    public get isDisposed(): boolean {
        return this.disposed;
    }

    public add<T extends IDisposable>(disposable: T): T {
        if ((disposable as unknown as DisposableStore) === this) {
            throw new Error("Cannot register a disposable on itself.");
        }

        setParentOfDisposable(disposable, this);
        if (this.disposed) {
            disposable.dispose();
        }
        else {
            this.disposables.add(disposable);
        }

        return disposable;
    }

    public delete(disposable: IDisposable): void {
        if (this.disposables.delete(disposable)) {
            setParentOfDisposable(disposable, null);
        }
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

        markAsDisposed(this);
        this.disposed = true;
        this.clear();
    }
}

export abstract class Disposable implements IDisposable {
    public static readonly None = Object.freeze<IDisposable>({ dispose() {} });

    private readonly disposableStore = new DisposableStore();

    public constructor() {
        trackDisposable(this);
        setParentOfDisposable(this.disposableStore, this);
    }

    protected _register<T extends IDisposable>(disposable: T): T {
        if ((disposable as unknown as Disposable) === this) {
            throw new Error("Cannot register a disposable on itself.");
        }

        return this.disposableStore.add(disposable);
    }

    public dispose(): void {
        markAsDisposed(this);
        this.disposableStore.dispose();
    }
}

export class MutableDisposable<T extends IDisposable = IDisposable> implements IDisposable {
    private value: T | undefined;
    private disposed = false;

    public constructor() {
        trackDisposable(this);
    }

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

        if (next) {
            setParentOfDisposable(next, this);
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
        markAsDisposed(this);
        this.value?.dispose();
        this.value = undefined;
    }
}
