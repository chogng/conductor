import type { Event } from "src/cs/base/common/event";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";

export type ContextKeyValue = string | number | boolean | undefined | null;
export type ContextKeyRules = ContextKeyExpression | string | undefined | null;

export const IContextKeyService = createDecorator<IContextKeyService>("contextKeyService");

export interface IContextKey<T extends ContextKeyValue = ContextKeyValue> {
    set(value: T): void;
    reset(): void;
    get(): T | undefined;
}

export interface IContext {
    getValue<T extends ContextKeyValue = ContextKeyValue>(key: string): T | undefined;
}

export interface IContextKeyChangeEvent {
    affectsSome(keys: Iterable<string>): boolean;
}

export interface IContextKeyService extends IContext {
    readonly _serviceBrand: undefined;
    readonly onDidChangeContext: Event<IContextKeyChangeEvent>;

    createKey<T extends ContextKeyValue>(key: string, defaultValue: T): IContextKey<T>;
    setContext(key: string, value: ContextKeyValue): void;
    removeContext(key: string): void;
    contextMatchesRules(rules: ContextKeyRules): boolean;
    createScoped(target: HTMLElement): IContextKeyService;
}

export const ContextKeyExprType = {
    Defined: 1,
    Not: 2,
    Equals: 3,
    NotEquals: 4,
    And: 5,
} as const;

export type ContextKeyExpression =
    | ContextKeyDefinedExpr
    | ContextKeyNotExpr
    | ContextKeyEqualsExpr
    | ContextKeyNotEqualsExpr
    | ContextKeyAndExpr;

export interface ContextKeyDefinedExpr {
    readonly type: typeof ContextKeyExprType.Defined;
    readonly key: string;
}

export interface ContextKeyNotExpr {
    readonly type: typeof ContextKeyExprType.Not;
    readonly key: string;
}

export interface ContextKeyEqualsExpr {
    readonly type: typeof ContextKeyExprType.Equals;
    readonly key: string;
    readonly value: ContextKeyValue;
}

export interface ContextKeyNotEqualsExpr {
    readonly type: typeof ContextKeyExprType.NotEquals;
    readonly key: string;
    readonly value: ContextKeyValue;
}

export interface ContextKeyAndExpr {
    readonly type: typeof ContextKeyExprType.And;
    readonly expressions: readonly ContextKeyExpression[];
}

export const ContextKeyExpr = {
    has(key: string): ContextKeyExpression {
        return { type: ContextKeyExprType.Defined, key };
    },

    not(key: string): ContextKeyExpression {
        return { type: ContextKeyExprType.Not, key };
    },

    equals(key: string, value: ContextKeyValue): ContextKeyExpression {
        return { type: ContextKeyExprType.Equals, key, value };
    },

    notEquals(key: string, value: ContextKeyValue): ContextKeyExpression {
        return { type: ContextKeyExprType.NotEquals, key, value };
    },

    and(...expressions: Array<ContextKeyExpression | undefined | null>): ContextKeyExpression | undefined {
        const definedExpressions = expressions.filter((expression): expression is ContextKeyExpression => Boolean(expression));
        if (definedExpressions.length === 0) {
            return undefined;
        }

        if (definedExpressions.length === 1) {
            return definedExpressions[0];
        }

        return {
            type: ContextKeyExprType.And,
            expressions: definedExpressions,
        };
    },
};

export function evaluateContextKeyExpression(expression: ContextKeyExpression, context: IContext): boolean {
    switch (expression.type) {
        case ContextKeyExprType.Defined:
            return Boolean(context.getValue(expression.key));
        case ContextKeyExprType.Not:
            return !context.getValue(expression.key);
        case ContextKeyExprType.Equals:
            return context.getValue(expression.key) === expression.value;
        case ContextKeyExprType.NotEquals:
            return context.getValue(expression.key) !== expression.value;
        case ContextKeyExprType.And:
            return expression.expressions.every(child => evaluateContextKeyExpression(child, context));
    }
}

export function createContextKeyChangeEvent(changedKeys: Iterable<string>): IContextKeyChangeEvent {
    const changedKeySet = new Set(changedKeys);

    return {
        affectsSome(keys: Iterable<string>): boolean {
            for (const key of keys) {
                if (changedKeySet.has(key)) {
                    return true;
                }
            }

            return false;
        },
    };
}

export class RawContextKey<T extends ContextKeyValue = ContextKeyValue> {
    public readonly key: string;
    public readonly defaultValue: T;

    constructor(key: string, defaultValue: T) {
        this.key = key;
        this.defaultValue = defaultValue;
    }

    bindTo(service: IContextKeyService): IContextKey<T> {
        return service.createKey(this.key, this.defaultValue);
    }

    getValue(context: IContext): T | undefined {
        return context.getValue<T>(this.key);
    }

    isEqualTo(value: T): ContextKeyExpression {
        return ContextKeyExpr.equals(this.key, value);
    }

    notEqualsTo(value: T): ContextKeyExpression {
        return ContextKeyExpr.notEquals(this.key, value);
    }
}

export interface IScopedContextKeyService extends IContextKeyService, IDisposable {}
