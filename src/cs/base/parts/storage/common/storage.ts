import { Delayer } from "../../../common/async.js";
import { Emitter, Event } from "../../../common/event.js";
import { Disposable, type IDisposable } from "../../../common/lifecycle.js";

export const enum StorageHint {
    STORAGE_DOES_NOT_EXIST,
    STORAGE_IN_MEMORY,
}

export interface IStorageOptions {
    readonly hint?: StorageHint;
}

export interface IUpdateRequest {
    readonly insert?: Map<string, string>;
    readonly delete?: Set<string>;
}

export interface IStorageItemsChangeEvent {
    readonly changed?: Map<string, string>;
    readonly deleted?: Set<string>;
}

export function isStorageItemsChangeEvent(value: unknown): value is IStorageItemsChangeEvent {
    const candidate = value as IStorageItemsChangeEvent | undefined;
    return candidate?.changed instanceof Map || candidate?.deleted instanceof Set;
}

export interface IStorageDatabase {
    readonly onDidChangeItemsExternal: Event<IStorageItemsChangeEvent>;
    getItems(): Promise<Map<string, string>>;
    updateItems(request: IUpdateRequest): Promise<void>;
    optimize(): Promise<void>;
    close(recovery?: () => Map<string, string>): Promise<void>;
}

export interface IStorageChangeEvent {
    readonly key: string;
    readonly external?: boolean;
}

export type StorageValue = string | boolean | number | undefined | null | object;

export interface IStorage extends IDisposable {
    readonly onDidChangeStorage: Event<IStorageChangeEvent>;
    readonly items: Map<string, string>;
    readonly size: number;

    init(): Promise<void>;

    get(key: string, fallbackValue: string): string;
    get(key: string, fallbackValue?: string): string | undefined;

    getBoolean(key: string, fallbackValue: boolean): boolean;
    getBoolean(key: string, fallbackValue?: boolean): boolean | undefined;

    getNumber(key: string, fallbackValue: number): number;
    getNumber(key: string, fallbackValue?: number): number | undefined;

    getObject<T extends object>(key: string, fallbackValue: T): T;
    getObject<T extends object>(key: string, fallbackValue?: T): T | undefined;

    set(key: string, value: StorageValue, external?: boolean): Promise<void>;
    delete(key: string, external?: boolean): Promise<void>;

    flush(delay?: number): Promise<void>;
    whenFlushed(): Promise<void>;
    optimize(): Promise<void>;
    close(): Promise<void>;
}

export const enum StorageState {
    None,
    Initialized,
    Closed,
}

class PauseableEmitter<T> extends Emitter<T> {
    private pauseCount = 0;
    private readonly queuedEvents: T[] = [];

    public pause(): void {
        this.pauseCount++;
    }

    public resume(): void {
        if (this.pauseCount === 0) {
            return;
        }

        this.pauseCount--;

        if (this.pauseCount > 0) {
            return;
        }

        const events = this.queuedEvents.splice(0);
        for (const event of events) {
            super.fire(event);
        }
    }

    public override fire(event: T): void {
        if (this.pauseCount > 0) {
            this.queuedEvents.push(event);
            return;
        }

        super.fire(event);
    }
}

export class Storage extends Disposable implements IStorage {
    private static readonly DEFAULT_FLUSH_DELAY = 100;

    private readonly onDidChangeStorageEmitter = this._register(new PauseableEmitter<IStorageChangeEvent>());
    public readonly onDidChangeStorage = this.onDidChangeStorageEmitter.event;

    private state = StorageState.None;
    private cache = new Map<string, string>();
    private readonly flushDelayer = this._register(new Delayer<void>(Storage.DEFAULT_FLUSH_DELAY));
    private flushQueue = Promise.resolve();
    private pendingDeletes = new Set<string>();
    private pendingInserts = new Map<string, string>();
    private pendingClose: Promise<void> | undefined;
    private readonly whenFlushedCallbacks: Array<() => void> = [];

    constructor(
        protected readonly database: IStorageDatabase,
        private readonly options: IStorageOptions = Object.create(null) as IStorageOptions,
    ) {
        super();
        this._register(this.database.onDidChangeItemsExternal(event => this.onDidChangeItemsExternal(event)));
    }

    public get items(): Map<string, string> {
        return this.cache;
    }

    public get size(): number {
        return this.cache.size;
    }

    public async init(): Promise<void> {
        if (this.state !== StorageState.None) {
            return;
        }

        this.state = StorageState.Initialized;

        if (this.options.hint === StorageHint.STORAGE_DOES_NOT_EXIST) {
            return;
        }

        this.cache = await this.database.getItems();
    }

    public get(key: string, fallbackValue: string): string;
    public get(key: string, fallbackValue?: string): string | undefined;
    public get(key: string, fallbackValue?: string): string | undefined {
        return this.cache.get(key) ?? fallbackValue;
    }

    public getBoolean(key: string, fallbackValue: boolean): boolean;
    public getBoolean(key: string, fallbackValue?: boolean): boolean | undefined;
    public getBoolean(key: string, fallbackValue?: boolean): boolean | undefined {
        const value = this.get(key);
        return value === undefined ? fallbackValue : value === "true";
    }

    public getNumber(key: string, fallbackValue: number): number;
    public getNumber(key: string, fallbackValue?: number): number | undefined;
    public getNumber(key: string, fallbackValue?: number): number | undefined {
        const value = this.get(key);
        return value === undefined ? fallbackValue : Number.parseInt(value, 10);
    }

    public getObject<T extends object>(key: string, fallbackValue: T): T;
    public getObject<T extends object>(key: string, fallbackValue?: T): T | undefined;
    public getObject<T extends object>(key: string, fallbackValue?: T): T | undefined {
        const value = this.get(key);

        if (value === undefined) {
            return fallbackValue;
        }

        try {
            return JSON.parse(value) as T;
        }
        catch (error) {
            console.warn(`Failed to parse storage object for key '${key}'.`, error);
            return fallbackValue;
        }
    }

    public async set(key: string, value: StorageValue, external = false): Promise<void> {
        if (this.state === StorageState.Closed) {
            return;
        }

        if (value === undefined || value === null) {
            return this.delete(key, external);
        }

        const valueString = typeof value === "object" ? JSON.stringify(value) : String(value);

        if (this.cache.get(key) === valueString) {
            return;
        }

        this.cache.set(key, valueString);
        this.pendingInserts.set(key, valueString);
        this.pendingDeletes.delete(key);
        this.onDidChangeStorageEmitter.fire({ key, external });

        return this.doFlush();
    }

    public async delete(key: string, external = false): Promise<void> {
        if (this.state === StorageState.Closed) {
            return;
        }

        if (!this.cache.delete(key)) {
            return;
        }

        this.pendingDeletes.add(key);
        this.pendingInserts.delete(key);
        this.onDidChangeStorageEmitter.fire({ key, external });

        return this.doFlush();
    }

    public async flush(delay?: number): Promise<void> {
        if (this.state === StorageState.Closed || this.pendingClose) {
            return;
        }

        return this.doFlush(delay);
    }

    public async whenFlushed(): Promise<void> {
        if (!this.hasPending) {
            return;
        }

        return new Promise(resolve => this.whenFlushedCallbacks.push(resolve));
    }

    public async optimize(): Promise<void> {
        if (this.state === StorageState.Closed) {
            return;
        }

        await this.flush(0);
        return this.database.optimize();
    }

    public async close(): Promise<void> {
        this.pendingClose ??= this.doClose();
        return this.pendingClose;
    }

    public isInMemory(): boolean {
        return this.options.hint === StorageHint.STORAGE_IN_MEMORY;
    }

    private onDidChangeItemsExternal(event: IStorageItemsChangeEvent): void {
        this.onDidChangeStorageEmitter.pause();

        try {
            event.changed?.forEach((value, key) => this.acceptExternal(key, value));
            event.deleted?.forEach(key => this.acceptExternal(key, undefined));
        }
        finally {
            this.onDidChangeStorageEmitter.resume();
        }
    }

    private acceptExternal(key: string, value: string | undefined): void {
        if (this.state === StorageState.Closed) {
            return;
        }

        const currentValue = this.cache.get(key);

        if (value === undefined) {
            if (this.cache.delete(key)) {
                this.onDidChangeStorageEmitter.fire({ key, external: true });
            }
            return;
        }

        if (currentValue !== value) {
            this.cache.set(key, value);
            this.onDidChangeStorageEmitter.fire({ key, external: true });
        }
    }

    private get hasPending(): boolean {
        return this.pendingInserts.size > 0 || this.pendingDeletes.size > 0;
    }

    private async doClose(): Promise<void> {
        this.state = StorageState.Closed;

        try {
            await this.doFlush(0);
        }
        catch (error) {
            console.warn("Failed to flush storage before close.", error);
        }

        await this.database.close(() => this.cache);
    }

    private async doFlush(delay?: number): Promise<void> {
        if (this.options.hint === StorageHint.STORAGE_IN_MEMORY) {
            return this.flushPending();
        }

        return this.flushDelayer.trigger(() => this.queueFlush(), delay);
    }

    private queueFlush(): Promise<void> {
        const flush = this.flushQueue.then(
            () => this.flushPending(),
            () => this.flushPending(),
        );
        this.flushQueue = flush.catch(() => undefined);
        return flush;
    }

    private async flushPending(): Promise<void> {
        if (!this.hasPending) {
            return;
        }

        const request: IUpdateRequest = { insert: this.pendingInserts, delete: this.pendingDeletes };
        this.pendingDeletes = new Set<string>();
        this.pendingInserts = new Map<string, string>();

        try {
            await this.database.updateItems(request);
        } catch (error) {
            request.insert?.forEach((value, key) => {
                if (!this.pendingInserts.has(key) && !this.pendingDeletes.has(key)) {
                    this.pendingInserts.set(key, value);
                }
            });
            request.delete?.forEach(key => {
                if (!this.pendingInserts.has(key) && !this.pendingDeletes.has(key)) {
                    this.pendingDeletes.add(key);
                }
            });
            throw error;
        }

        if (!this.hasPending) {
            while (this.whenFlushedCallbacks.length) {
                this.whenFlushedCallbacks.pop()?.();
            }
        }
    }
}

export class InMemoryStorageDatabase implements IStorageDatabase {
    public readonly onDidChangeItemsExternal = Event.None as Event<IStorageItemsChangeEvent>;
    private readonly storedItems = new Map<string, string>();

    public async getItems(): Promise<Map<string, string>> {
        return this.storedItems;
    }

    public async updateItems(request: IUpdateRequest): Promise<void> {
        request.insert?.forEach((value, key) => this.storedItems.set(key, value));
        request.delete?.forEach(key => this.storedItems.delete(key));
    }

    public async optimize(): Promise<void> {}
    public async close(): Promise<void> {}
}

export const MIGRATED_KEY = "__$__migratedStorageMarker";

export class MigratingStorage extends Storage {
    private static readonly INTERNAL_KEY_PREFIX = "__$__";

    private migratedKeys = new Set<string>();
    private fallbackStorage: IStorage | undefined;
    private isFallbackStorageReadonly = false;

    public override async init(): Promise<void> {
        await super.init();
        this.migratedKeys = this.loadMigratedKeys();
    }

    public setFallbackStorage(storage: IStorage, isReadonly: boolean): void {
        this.fallbackStorage = storage;
        this.isFallbackStorageReadonly = isReadonly;
    }

    public override get(key: string, fallbackValue: string): string;
    public override get(key: string, fallbackValue?: string): string | undefined;
    public override get(key: string, fallbackValue?: string): string | undefined {
        if (!key.startsWith(MigratingStorage.INTERNAL_KEY_PREFIX) && !this.migratedKeys.has(key) && super.get(key) === undefined) {
            this.migratedKeys.add(key);

            const value = this.fallbackStorage?.items.get(key);
            if (value !== undefined) {
                this.set(key, value);

                if (!this.isFallbackStorageReadonly) {
                    this.fallbackStorage?.delete(key);
                }

                this.persistMigratedKeys();
            }
        }

        return super.get(key, fallbackValue);
    }

    private loadMigratedKeys(): Set<string> {
        const rawValue = super.get(MIGRATED_KEY);

        if (!rawValue) {
            return new Set();
        }

        try {
            const parsed = JSON.parse(rawValue) as unknown;
            return Array.isArray(parsed) ? new Set(parsed.filter((value): value is string => typeof value === "string")) : new Set();
        }
        catch (error) {
            console.warn("Failed to parse migrated storage marker.", error);
            return new Set();
        }
    }

    private persistMigratedKeys(): void {
        this.set(MIGRATED_KEY, JSON.stringify(Array.from(this.migratedKeys)));
    }
}
