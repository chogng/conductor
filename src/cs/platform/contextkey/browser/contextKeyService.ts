import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
    createContextKeyChangeEvent,
    evaluateContextKeyRules,
    IContextKeyService,
    type ContextKeyRules,
    type ContextKeyValue,
    type IContextKey,
    type IContextKeyChangeEvent,
    type IContextKeyService as IContextKeyServiceType,
    type IScopedContextKeyService,
} from "src/cs/platform/contextkey/common/contextkey";

export class ContextKeyService extends Disposable implements IContextKeyServiceType {
    public declare readonly _serviceBrand: undefined;

    private readonly onDidChangeContextEmitter = this._register(new Emitter<IContextKeyChangeEvent>());
    private readonly values = new Map<string, ContextKeyValue>();

    public readonly onDidChangeContext = this.onDidChangeContextEmitter.event;

    public createKey<T extends ContextKeyValue>(key: string, defaultValue: T): IContextKey<T> {
        this.setContext(key, defaultValue);
        return new BoundContextKey(key, defaultValue, this);
    }

    public setContext(key: string, value: ContextKeyValue): void {
        const hasKey = this.values.has(key);
        const previousValue = this.values.get(key);
        if ((!hasKey && typeof value === "undefined") || (hasKey && previousValue === value)) {
            return;
        }

        if (typeof value === "undefined") {
            this.values.delete(key);
        }
        else {
            this.values.set(key, value);
        }

        this.onDidChangeContextEmitter.fire(createContextKeyChangeEvent([key]));
    }

    public removeContext(key: string): void {
        if (!this.values.delete(key)) {
            return;
        }

        this.onDidChangeContextEmitter.fire(createContextKeyChangeEvent([key]));
    }

    public getValue<T extends ContextKeyValue = ContextKeyValue>(key: string): T | undefined {
        return this.values.get(key) as T | undefined;
    }

    public contextMatchesRules(rules: ContextKeyRules): boolean {
        return evaluateContextKeyRules(rules, this);
    }

    public createScoped(_target: HTMLElement): IScopedContextKeyService {
        return new ScopedContextKeyService(this);
    }
}

class ScopedContextKeyService extends Disposable implements IScopedContextKeyService {
    public declare readonly _serviceBrand: undefined;

    private readonly onDidChangeContextEmitter = this._register(new Emitter<IContextKeyChangeEvent>());
    private readonly values = new Map<string, ContextKeyValue>();
    private readonly parent: IContextKeyServiceType;

    public readonly onDidChangeContext = this.onDidChangeContextEmitter.event;

    constructor(parent: IContextKeyServiceType) {
        super();
        this.parent = parent;
        this._register(parent.onDidChangeContext(event => {
            if (!event.allKeysContainedIn(this.values.keys())) {
                this.onDidChangeContextEmitter.fire(event);
            }
        }));
    }

    public createKey<T extends ContextKeyValue>(key: string, defaultValue: T): IContextKey<T> {
        this.setContext(key, defaultValue);
        return new BoundContextKey(key, defaultValue, this);
    }

    public setContext(key: string, value: ContextKeyValue): void {
        const hasKey = this.values.has(key);
        const previousValue = this.values.get(key);
        if ((!hasKey && typeof value === "undefined") || (hasKey && previousValue === value)) {
            return;
        }

        if (typeof value === "undefined") {
            this.values.delete(key);
        }
        else {
            this.values.set(key, value);
        }

        this.onDidChangeContextEmitter.fire(createContextKeyChangeEvent([key]));
    }

    public removeContext(key: string): void {
        if (!this.values.delete(key)) {
            return;
        }

        this.onDidChangeContextEmitter.fire(createContextKeyChangeEvent([key]));
    }

    public getValue<T extends ContextKeyValue = ContextKeyValue>(key: string): T | undefined {
        if (this.values.has(key)) {
            return this.values.get(key) as T | undefined;
        }

        return this.parent.getValue<T>(key);
    }

    public contextMatchesRules(rules: ContextKeyRules): boolean {
        return evaluateContextKeyRules(rules, this);
    }

    public createScoped(_target: HTMLElement): IScopedContextKeyService {
        return new ScopedContextKeyService(this);
    }
}

class BoundContextKey<T extends ContextKeyValue> implements IContextKey<T> {
    private readonly key: string;
    private readonly defaultValue: T;
    private readonly service: IContextKeyServiceType;

    constructor(key: string, defaultValue: T, service: IContextKeyServiceType) {
        this.key = key;
        this.defaultValue = defaultValue;
        this.service = service;
    }

    public set(value: T): void {
        this.service.setContext(this.key, value);
    }

    public reset(): void {
        this.service.setContext(this.key, this.defaultValue);
    }

    public get(): T | undefined {
        return this.service.getValue<T>(this.key);
    }
}

registerSingleton(IContextKeyService, ContextKeyService, InstantiationType.Delayed);
