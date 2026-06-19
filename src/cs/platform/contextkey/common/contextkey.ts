import type { Event } from "src/cs/base/common/event";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";

export type ContextKeyPrimitiveValue = string | number | boolean | undefined | null;
export type ContextKeyValue =
    | ContextKeyPrimitiveValue
    | readonly ContextKeyPrimitiveValue[]
    | Readonly<Record<string, ContextKeyPrimitiveValue>>;
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
    allKeysContainedIn(keys: Iterable<string>): boolean;
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
    False: 0,
    True: 1,
    Defined: 2,
    Not: 3,
    Equals: 4,
    NotEquals: 5,
    And: 6,
    Or: 7,
    Greater: 8,
    GreaterEquals: 9,
    Smaller: 10,
    SmallerEquals: 11,
} as const;

export type ContextKeyExpression =
    | ContextKeyFalseExpr
    | ContextKeyTrueExpr
    | ContextKeyDefinedExpr
    | ContextKeyNotExpr
    | ContextKeyEqualsExpr
    | ContextKeyNotEqualsExpr
    | ContextKeyAndExpr
    | ContextKeyOrExpr
    | ContextKeyGreaterExpr
    | ContextKeyGreaterEqualsExpr
    | ContextKeySmallerExpr
    | ContextKeySmallerEqualsExpr;

export interface ContextKeyFalseExpr {
    readonly type: typeof ContextKeyExprType.False;
}

export interface ContextKeyTrueExpr {
    readonly type: typeof ContextKeyExprType.True;
}

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

export interface ContextKeyOrExpr {
    readonly type: typeof ContextKeyExprType.Or;
    readonly expressions: readonly ContextKeyExpression[];
}

export interface ContextKeyGreaterExpr {
    readonly type: typeof ContextKeyExprType.Greater;
    readonly key: string;
    readonly value: number | string;
}

export interface ContextKeyGreaterEqualsExpr {
    readonly type: typeof ContextKeyExprType.GreaterEquals;
    readonly key: string;
    readonly value: number | string;
}

export interface ContextKeySmallerExpr {
    readonly type: typeof ContextKeyExprType.Smaller;
    readonly key: string;
    readonly value: number | string;
}

export interface ContextKeySmallerEqualsExpr {
    readonly type: typeof ContextKeyExprType.SmallerEquals;
    readonly key: string;
    readonly value: number | string;
}

export const ContextKeyExpr = {
    false(): ContextKeyExpression {
        return { type: ContextKeyExprType.False };
    },

    true(): ContextKeyExpression {
        return { type: ContextKeyExprType.True };
    },

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
        const definedExpressions = expressions
            .filter((expression): expression is ContextKeyExpression => Boolean(expression))
            .flatMap(expression => expression.type === ContextKeyExprType.And ? expression.expressions : [expression]);
        if (definedExpressions.some(expression => expression.type === ContextKeyExprType.False)) {
            return ContextKeyExpr.false();
        }

        const nonTrivialExpressions = definedExpressions.filter(expression => expression.type !== ContextKeyExprType.True);
        if (nonTrivialExpressions.length === 0) {
            return definedExpressions.length === 0 ? undefined : ContextKeyExpr.true();
        }

        if (nonTrivialExpressions.length === 1) {
            return nonTrivialExpressions[0];
        }

        return {
            type: ContextKeyExprType.And,
            expressions: nonTrivialExpressions,
        };
    },

    or(...expressions: Array<ContextKeyExpression | undefined | null>): ContextKeyExpression | undefined {
        const definedExpressions = expressions
            .filter((expression): expression is ContextKeyExpression => Boolean(expression))
            .flatMap(expression => expression.type === ContextKeyExprType.Or ? expression.expressions : [expression]);
        if (definedExpressions.length === 0) {
            return undefined;
        }

        if (definedExpressions.some(expression => expression.type === ContextKeyExprType.True)) {
            return ContextKeyExpr.true();
        }

        const nonTrivialExpressions = definedExpressions.filter(expression => expression.type !== ContextKeyExprType.False);
        if (nonTrivialExpressions.length === 0) {
            return ContextKeyExpr.false();
        }

        if (nonTrivialExpressions.length === 1) {
            return nonTrivialExpressions[0];
        }

        return {
            type: ContextKeyExprType.Or,
            expressions: nonTrivialExpressions,
        };
    },

    greater(key: string, value: number | string): ContextKeyExpression {
        return { type: ContextKeyExprType.Greater, key, value };
    },

    greaterEquals(key: string, value: number | string): ContextKeyExpression {
        return { type: ContextKeyExprType.GreaterEquals, key, value };
    },

    smaller(key: string, value: number | string): ContextKeyExpression {
        return { type: ContextKeyExprType.Smaller, key, value };
    },

    smallerEquals(key: string, value: number | string): ContextKeyExpression {
        return { type: ContextKeyExprType.SmallerEquals, key, value };
    },
};

export function evaluateContextKeyRules(rules: ContextKeyRules, context: IContext): boolean {
    if (!rules) {
        return true;
    }

    if (typeof rules === "string") {
        return evaluateContextKeyStringRules(rules, context);
    }

    return evaluateContextKeyExpression(rules, context);
}

export function evaluateContextKeyExpression(expression: ContextKeyExpression, context: IContext): boolean {
    switch (expression.type) {
        case ContextKeyExprType.False:
            return false;
        case ContextKeyExprType.True:
            return true;
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
        case ContextKeyExprType.Or:
            return expression.expressions.some(child => evaluateContextKeyExpression(child, context));
        case ContextKeyExprType.Greater:
            return compareContextKeyValues(context.getValue(expression.key), expression.value) > 0;
        case ContextKeyExprType.GreaterEquals:
            return compareContextKeyValues(context.getValue(expression.key), expression.value) >= 0;
        case ContextKeyExprType.Smaller:
            return compareContextKeyValues(context.getValue(expression.key), expression.value) < 0;
        case ContextKeyExprType.SmallerEquals:
            return compareContextKeyValues(context.getValue(expression.key), expression.value) <= 0;
    }
}

export function getContextKeyRulesKeys(rules: ContextKeyRules): readonly string[] {
    if (!rules) {
        return [];
    }

    if (typeof rules === "string") {
        return getContextKeyStringRulesKeys(rules);
    }

    return getContextKeyExpressionKeys(rules);
}

export function getContextKeyExpressionKeys(expression: ContextKeyExpression): readonly string[] {
    switch (expression.type) {
        case ContextKeyExprType.False:
        case ContextKeyExprType.True:
            return [];
        case ContextKeyExprType.And:
        case ContextKeyExprType.Or:
            return dedupeContextKeys(expression.expressions.flatMap(child => getContextKeyExpressionKeys(child)));
        case ContextKeyExprType.Defined:
        case ContextKeyExprType.Not:
        case ContextKeyExprType.Equals:
        case ContextKeyExprType.NotEquals:
        case ContextKeyExprType.Greater:
        case ContextKeyExprType.GreaterEquals:
        case ContextKeyExprType.Smaller:
        case ContextKeyExprType.SmallerEquals:
            return [expression.key];
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

        allKeysContainedIn(keys: Iterable<string>): boolean {
            const keySet = new Set(keys);
            for (const key of changedKeySet) {
                if (!keySet.has(key)) {
                    return false;
                }
            }

            return true;
        },
    };
}

export interface ContextKeyInfo {
    readonly key: string;
    readonly type?: string;
    readonly description?: string;
}

export class RawContextKey<T extends ContextKeyValue = ContextKeyValue> {
    private static readonly info: ContextKeyInfo[] = [];

    public static all(): IterableIterator<ContextKeyInfo> {
        return RawContextKey.info.values();
    }

    public readonly key: string;
    public readonly defaultValue: T;

    constructor(key: string, defaultValue: T, metadata?: string | true | { readonly type: string; readonly description: string }) {
        this.key = key;
        this.defaultValue = defaultValue;

        if (typeof metadata === "object") {
            RawContextKey.info.push({ ...metadata, key });
        }
        else if (metadata !== true) {
            RawContextKey.info.push({
                key,
                description: metadata,
                type: defaultValue === null || typeof defaultValue === "undefined" ? undefined : typeof defaultValue,
            });
        }
    }

    bindTo(service: IContextKeyService): IContextKey<T> {
        return service.createKey(this.key, this.defaultValue);
    }

    getValue(context: IContext): T | undefined {
        return context.getValue<T>(this.key);
    }

    toNegated(): ContextKeyExpression {
        return ContextKeyExpr.not(this.key);
    }

    isEqualTo(value: T): ContextKeyExpression {
        return ContextKeyExpr.equals(this.key, value);
    }

    notEqualsTo(value: T): ContextKeyExpression {
        return ContextKeyExpr.notEquals(this.key, value);
    }

    greater(value: number | string): ContextKeyExpression {
        return ContextKeyExpr.greater(this.key, value);
    }
}

export interface IScopedContextKeyService extends IContextKeyService, IDisposable {}

function evaluateContextKeyStringRules(rules: string, context: IContext): boolean {
    const orClauses = splitContextKeyString(rules, "||");
    if (orClauses.length > 1) {
        return orClauses.some(clause => evaluateContextKeyStringRules(clause, context));
    }

    return splitContextKeyString(rules, "&&")
        .map(clause => clause.trim())
        .filter(Boolean)
        .every(clause => evaluateContextKeyStringClause(clause, context));
}

function evaluateContextKeyStringClause(rawClause: string, context: IContext): boolean {
    const clause = trimWrappingParentheses(rawClause.trim());
    if (!clause) {
        return true;
    }

    if (splitContextKeyString(clause, "||").length > 1 || splitContextKeyString(clause, "&&").length > 1) {
        return evaluateContextKeyStringRules(clause, context);
    }

    if (clause.startsWith("!")) {
        return !evaluateContextKeyStringClause(clause.slice(1), context);
    }

    const operator = findContextKeyOperator(clause);
    if (!operator) {
        return Boolean(context.getValue(clause));
    }

    const key = clause.slice(0, operator.index).trim();
    const expected = parseContextKeyValue(clause.slice(operator.index + operator.value.length).trim());
    const actual = context.getValue(key);
    switch (operator.value) {
        case "!=":
            return actual !== expected;
        case "==":
            return actual === expected;
        case ">":
            return compareContextKeyValues(actual, expected) > 0;
        case ">=":
            return compareContextKeyValues(actual, expected) >= 0;
        case "<":
            return compareContextKeyValues(actual, expected) < 0;
        case "<=":
            return compareContextKeyValues(actual, expected) <= 0;
    }

    return false;
}

function getContextKeyStringRulesKeys(rules: string): readonly string[] {
    const keys: string[] = [];
    for (const orClause of splitContextKeyString(rules, "||")) {
        for (const andClause of splitContextKeyString(orClause, "&&")) {
            collectContextKeyStringClauseKeys(andClause, keys);
        }
    }

    return dedupeContextKeys(keys);
}

function collectContextKeyStringClauseKeys(rawClause: string, keys: string[]): void {
    const clause = trimWrappingParentheses(rawClause.trim());
    if (!clause || clause === "true" || clause === "false") {
        return;
    }

    const orClauses = splitContextKeyString(clause, "||");
    const andClauses = splitContextKeyString(clause, "&&");
    if (orClauses.length > 1 || andClauses.length > 1) {
        for (const orClause of orClauses) {
            for (const andClause of splitContextKeyString(orClause, "&&")) {
                collectContextKeyStringClauseKeys(andClause, keys);
            }
        }
        return;
    }

    if (clause.startsWith("!")) {
        collectContextKeyStringClauseKeys(clause.slice(1), keys);
        return;
    }

    const operator = findContextKeyOperator(clause);
    const key = operator ? clause.slice(0, operator.index).trim() : clause;
    if (key) {
        keys.push(key);
    }
}

function findContextKeyOperator(clause: string): { readonly value: string; readonly index: number } | null {
    const operators = ["!=", "==", ">=", "<=", ">", "<"] as const;
    let quote: string | null = null;

    for (let index = 0; index < clause.length; index += 1) {
        const char = clause[index];
        if (quote) {
            if (char === quote) {
                quote = null;
            }
            continue;
        }

        if (char === "'" || char === "\"") {
            quote = char;
            continue;
        }

        for (const operator of operators) {
            if (clause.startsWith(operator, index)) {
                return { value: operator, index };
            }
        }
    }

    return null;
}

function splitContextKeyString(value: string, operator: "&&" | "||"): readonly string[] {
    const result: string[] = [];
    let depth = 0;
    let quote: string | null = null;
    let start = 0;

    for (let index = 0; index < value.length; index += 1) {
        const char = value[index];
        if (quote) {
            if (char === quote) {
                quote = null;
            }
            continue;
        }

        if (char === "'" || char === "\"") {
            quote = char;
            continue;
        }

        if (char === "(") {
            depth += 1;
            continue;
        }

        if (char === ")") {
            depth -= 1;
            continue;
        }

        if (depth !== 0) {
            continue;
        }

        if (!value.startsWith(operator, index)) {
            continue;
        }

        result.push(value.slice(start, index));
        index += operator.length - 1;
        start = index + 1;
    }

    result.push(value.slice(start));
    return result;
}

function trimWrappingParentheses(value: string): string {
    let result = value;
    while (result.startsWith("(") && result.endsWith(")") && wrapsWholeExpression(result)) {
        result = result.slice(1, -1).trim();
    }

    return result;
}

function wrapsWholeExpression(value: string): boolean {
    let depth = 0;
    let quote: string | null = null;
    for (let index = 0; index < value.length; index += 1) {
        const char = value[index];
        if (quote) {
            if (char === quote) {
                quote = null;
            }
            continue;
        }

        if (char === "'" || char === "\"") {
            quote = char;
            continue;
        }

        if (char === "(") {
            depth += 1;
        }
        else if (char === ")") {
            depth -= 1;
            if (depth === 0 && index < value.length - 1) {
                return false;
            }
        }
    }

    return depth === 0;
}

function parseContextKeyValue(rawValue: string): ContextKeyPrimitiveValue {
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

function compareContextKeyValues(actual: ContextKeyValue | undefined, expected: ContextKeyValue): number {
    if ((typeof actual === "number" || typeof actual === "string") &&
        (typeof expected === "number" || typeof expected === "string")) {
        return actual > expected ? 1 : actual < expected ? -1 : 0;
    }

    return Number.NaN;
}

function dedupeContextKeys(keys: readonly string[]): readonly string[] {
    return [...new Set(keys)];
}
