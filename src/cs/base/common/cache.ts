import { CancellationToken, CancellationTokenSource } from "./async.js";
import type { IDisposable } from "./lifecycle.js";

export interface CacheResult<T> extends IDisposable {
    promise: Promise<T>;
}

export class Cache<T> {
    private result: CacheResult<T> | null = null;

    constructor(private readonly task: (token: CancellationToken) => Promise<T>) { }

    public get(): CacheResult<T> {
        if (this.result) {
            return this.result;
        }

        const source = new CancellationTokenSource();
        const promise = this.task(source.token);

        this.result = {
            promise,
            dispose: () => {
                this.result = null;
                source.cancel();
                source.dispose();
            },
        };

        return this.result;
    }
}

export function identity<T>(value: T): T {
    return value;
}

interface ICacheOptions<TArg> {
    /**
     * The cache key is used to identify the cache entry.
     * Strict equality is used to compare cache keys.
     */
    getCacheKey: (arg: TArg) => unknown;
}

/**
 * Uses a LRU cache to make a given parametrized function cached.
 * Caches just the last key/value.
 */
export class LRUCachedFunction<TArg, TComputed> {
    private lastCache: TComputed | undefined = undefined;
    private lastArgKey: unknown | undefined = undefined;

    private readonly fn: (arg: TArg) => TComputed;
    private readonly computeKey: (arg: TArg) => unknown;

    constructor(fn: (arg: TArg) => TComputed);
    constructor(options: ICacheOptions<TArg>, fn: (arg: TArg) => TComputed);
    constructor(arg1: ICacheOptions<TArg> | ((arg: TArg) => TComputed), arg2?: (arg: TArg) => TComputed) {
        if (typeof arg1 === "function") {
            this.fn = arg1;
            this.computeKey = identity;
        }
        else {
            this.fn = arg2!;
            this.computeKey = arg1.getCacheKey;
        }
    }

    public get(arg: TArg): TComputed {
        const key = this.computeKey(arg);
        if (this.lastArgKey !== key) {
            this.lastArgKey = key;
            this.lastCache = this.fn(arg);
        }

        return this.lastCache!;
    }
}

/**
 * Uses an unbounded cache to memoize the results of the given function.
 */
export class CachedFunction<TArg, TComputed> {
    private readonly map = new Map<TArg, TComputed>();
    private readonly keyedMap = new Map<unknown, TComputed>();

    private readonly fn: (arg: TArg) => TComputed;
    private readonly computeKey: (arg: TArg) => unknown;

    public get cachedValues(): ReadonlyMap<TArg, TComputed> {
        return this.map;
    }

    constructor(fn: (arg: TArg) => TComputed);
    constructor(options: ICacheOptions<TArg>, fn: (arg: TArg) => TComputed);
    constructor(arg1: ICacheOptions<TArg> | ((arg: TArg) => TComputed), arg2?: (arg: TArg) => TComputed) {
        if (typeof arg1 === "function") {
            this.fn = arg1;
            this.computeKey = identity;
        }
        else {
            this.fn = arg2!;
            this.computeKey = arg1.getCacheKey;
        }
    }

    public get(arg: TArg): TComputed {
        const key = this.computeKey(arg);
        if (this.keyedMap.has(key)) {
            return this.keyedMap.get(key)!;
        }

        const value = this.fn(arg);
        this.map.set(arg, value);
        this.keyedMap.set(key, value);
        return value;
    }
}

/**
 * Uses an unbounded weak cache to memoize the results of the given function.
 */
export class WeakCachedFunction<TArg, TComputed> {
    private readonly map = new WeakMap<WeakKey, TComputed>();

    private readonly fn: (arg: TArg) => TComputed;
    private readonly computeKey: (arg: TArg) => unknown;

    constructor(fn: (arg: TArg) => TComputed);
    constructor(options: ICacheOptions<TArg>, fn: (arg: TArg) => TComputed);
    constructor(arg1: ICacheOptions<TArg> | ((arg: TArg) => TComputed), arg2?: (arg: TArg) => TComputed) {
        if (typeof arg1 === "function") {
            this.fn = arg1;
            this.computeKey = identity;
        }
        else {
            this.fn = arg2!;
            this.computeKey = arg1.getCacheKey;
        }
    }

    public get(arg: TArg): TComputed {
        const key = this.computeKey(arg) as WeakKey;
        if (this.map.has(key)) {
            return this.map.get(key)!;
        }

        const value = this.fn(arg);
        this.map.set(key, value);
        return value;
    }
}
