import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
    createContextKeyChangeEvent,
    evaluateContextKeyExpression,
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
        if (!this.values.has(key)) {
            this.setContext(key, defaultValue);
        }

        return new BoundContextKey(key, defaultValue, this);
    }

    public setContext(key: string, value: ContextKeyValue): void {
        const previousValue = this.values.get(key);
        if (previousValue === value && (this.values.has(key) || typeof value !== "undefined")) {
            return;
        }

        if (typeof value === "undefined" || value === null) {
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
        if (!rules) {
            return true;
        }

        if (typeof rules === "string") {
            return this.contextMatchesStringRules(rules);
        }

        return evaluateContextKeyExpression(rules, this);
    }

    public createScoped(_target: HTMLElement): IScopedContextKeyService {
        return new ScopedContextKeyService(this);
    }

    private contextMatchesStringRules(rules: string): boolean {
        const clauses = rules.split("&&").map(clause => clause.trim()).filter(Boolean);
        return clauses.every(clause => this.contextMatchesStringClause(clause));
    }

    private contextMatchesStringClause(clause: string): boolean {
        if (clause.startsWith("!")) {
            return !this.getValue(clause.slice(1).trim());
        }

        const notEqualsIndex = clause.indexOf("!=");
        if (notEqualsIndex >= 0) {
            const key = clause.slice(0, notEqualsIndex).trim();
            const value = parseContextKeyValue(clause.slice(notEqualsIndex + 2).trim());
            return this.getValue(key) !== value;
        }

        const equalsIndex = clause.indexOf("==");
        if (equalsIndex >= 0) {
            const key = clause.slice(0, equalsIndex).trim();
            const value = parseContextKeyValue(clause.slice(equalsIndex + 2).trim());
            return this.getValue(key) === value;
        }

        return Boolean(this.getValue(clause));
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
        this._register(parent.onDidChangeContext(event => this.onDidChangeContextEmitter.fire(event)));
    }

    public createKey<T extends ContextKeyValue>(key: string, defaultValue: T): IContextKey<T> {
        if (!this.values.has(key) && typeof this.parent.getValue(key) === "undefined") {
            this.setContext(key, defaultValue);
        }

        return new BoundContextKey(key, defaultValue, this);
    }

    public setContext(key: string, value: ContextKeyValue): void {
        const previousValue = this.values.get(key);
        if (previousValue === value && (this.values.has(key) || typeof value !== "undefined")) {
            return;
        }

        if (typeof value === "undefined" || value === null) {
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
        if (!rules) {
            return true;
        }

        if (typeof rules === "string") {
            const clauses = rules.split("&&").map(clause => clause.trim()).filter(Boolean);
            return clauses.every(clause => this.contextMatchesStringClause(clause));
        }

        return evaluateContextKeyExpression(rules, this);
    }

    public createScoped(_target: HTMLElement): IScopedContextKeyService {
        return new ScopedContextKeyService(this);
    }

    private contextMatchesStringClause(clause: string): boolean {
        if (clause.startsWith("!")) {
            return !this.getValue(clause.slice(1).trim());
        }

        const notEqualsIndex = clause.indexOf("!=");
        if (notEqualsIndex >= 0) {
            const key = clause.slice(0, notEqualsIndex).trim();
            const value = parseContextKeyValue(clause.slice(notEqualsIndex + 2).trim());
            return this.getValue(key) !== value;
        }

        const equalsIndex = clause.indexOf("==");
        if (equalsIndex >= 0) {
            const key = clause.slice(0, equalsIndex).trim();
            const value = parseContextKeyValue(clause.slice(equalsIndex + 2).trim());
            return this.getValue(key) === value;
        }

        return Boolean(this.getValue(clause));
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

function parseContextKeyValue(rawValue: string): ContextKeyValue {
    const value = rawValue.trim();
    if (value === "true") {
        return true;
    }

    if (value === "false") {
        return false;
    }

    if (value === "undefined") {
        return undefined;
    }

    if (value === "null") {
        return null;
    }

    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith("\"") && value.endsWith("\""))) {
        return value.slice(1, -1);
    }

    const numberValue = Number(value);
    if (value !== "" && Number.isFinite(numberValue)) {
        return numberValue;
    }

    return value;
}

registerSingleton(IContextKeyService, ContextKeyService, InstantiationType.Delayed);
