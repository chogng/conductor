/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { mapFilter } from "./arrays";
import type { IJSONSchema } from "./jsonSchema";

export interface IValidator<T> {
	validate(content: unknown): { content: T; error: undefined } | { content: undefined; error: ValidationError };
	getJSONSchema(): IJSONSchema;
}

export abstract class ValidatorBase<T> implements IValidator<T> {
	public abstract validate(content: unknown): { content: T; error: undefined } | { content: undefined; error: ValidationError };
	public abstract getJSONSchema(): IJSONSchema;

	public validateOrThrow(content: unknown): T {
		const result = this.validate(content);
		if (result.error) {
			throw new Error(result.error.message);
		}

		return result.content;
	}
}

export type ValidatorType<T> = T extends IValidator<infer U> ? U : never;

export interface ValidationError {
	readonly message: string;
}

type TypeOfMap = {
	readonly string: string;
	readonly number: number;
	readonly boolean: boolean;
	readonly object: object;
	readonly null: null;
};

class TypeofValidator<TKey extends keyof TypeOfMap> extends ValidatorBase<TypeOfMap[TKey]> {
	public constructor(private readonly type: TKey) {
		super();
	}

	public validate(content: unknown): { content: TypeOfMap[TKey]; error: undefined } | { content: undefined; error: ValidationError } {
		if (typeof content !== this.type) {
			return { content: undefined, error: { message: `Expected ${this.type}, but got ${typeof content}` } };
		}

		return { content: content as TypeOfMap[TKey], error: undefined };
	}

	public getJSONSchema(): IJSONSchema {
		return { type: this.type };
	}
}

const stringValidator = new TypeofValidator("string");
export function vString(): ValidatorBase<string> { return stringValidator; }

const numberValidator = new TypeofValidator("number");
export function vNumber(): ValidatorBase<number> { return numberValidator; }

const booleanValidator = new TypeofValidator("boolean");
export function vBoolean(): ValidatorBase<boolean> { return booleanValidator; }

const objectValidator = new TypeofValidator("object");
export function vObjAny(): ValidatorBase<object> { return objectValidator; }

class UncheckedValidator<T> extends ValidatorBase<T> {
	public validate(content: unknown): { content: T; error: undefined } {
		return { content: content as T, error: undefined };
	}

	public getJSONSchema(): IJSONSchema {
		return {};
	}
}

export function vUnchecked<T>(): ValidatorBase<T> {
	return new UncheckedValidator<T>();
}

class UndefinedValidator extends ValidatorBase<undefined> {
	public validate(content: unknown): { content: undefined; error: undefined } | { content: undefined; error: ValidationError } {
		if (content !== undefined) {
			return { content: undefined, error: { message: `Expected undefined, but got ${typeof content}` } };
		}

		return { content: undefined, error: undefined };
	}

	public getJSONSchema(): IJSONSchema {
		return {};
	}
}

export function vUndefined(): ValidatorBase<undefined> {
	return new UndefinedValidator();
}

export function vUnknown(): ValidatorBase<unknown> {
	return vUnchecked();
}

export type ObjectProperties = Record<string, unknown>;

export class Optional<T extends IValidator<unknown>> {
	public constructor(public readonly validator: T) {}
}

export function vOptionalProp<T>(validator: IValidator<T>): Optional<IValidator<T>> {
	return new Optional(validator);
}

type ExtractOptionalKeys<T> = {
	[K in keyof T]: T[K] extends Optional<IValidator<unknown>> ? K : never;
}[keyof T];

type ExtractRequiredKeys<T> = {
	[K in keyof T]: T[K] extends Optional<IValidator<unknown>> ? never : K;
}[keyof T];

export type vObjType<T extends Record<string, IValidator<unknown> | Optional<IValidator<unknown>>>> = {
	[K in ExtractRequiredKeys<T>]: T[K] extends IValidator<infer U> ? U : never;
} & {
	[K in ExtractOptionalKeys<T>]?: T[K] extends Optional<IValidator<infer U>> ? U : never;
};

class ObjValidator<T extends Record<string, IValidator<unknown> | Optional<IValidator<unknown>>>> extends ValidatorBase<vObjType<T>> {
	public constructor(private readonly properties: T) {
		super();
	}

	public validate(content: unknown): { content: vObjType<T>; error: undefined } | { content: undefined; error: ValidationError } {
		if (typeof content !== "object" || content === null) {
			return { content: undefined, error: { message: "Expected object" } };
		}

		const result = {} as vObjType<T>;

		for (const key in this.properties) {
			const property = this.properties[key];
			const fieldValue = (content as Record<string, unknown>)[key];
			const isOptional = property instanceof Optional;
			const validator: IValidator<unknown> = isOptional ? property.validator : property;

			if (isOptional && fieldValue === undefined) {
				continue;
			}

			const { content: value, error } = validator.validate(fieldValue);
			if (error) {
				return { content: undefined, error: { message: `Error in property '${key}': ${error.message}` } };
			}

			(result as Record<string, unknown>)[key] = value;
		}

		return { content: result, error: undefined };
	}

	public getJSONSchema(): IJSONSchema {
		const requiredFields: string[] = [];
		const schemaProperties: Record<string, IJSONSchema> = {};

		for (const [key, property] of Object.entries(this.properties)) {
			const isOptional = property instanceof Optional;
			const validator: IValidator<unknown> = isOptional ? property.validator : property;
			schemaProperties[key] = validator.getJSONSchema();
			if (!isOptional) {
				requiredFields.push(key);
			}
		}

		return {
			type: "object",
			properties: schemaProperties,
			...(requiredFields.length > 0 ? { required: requiredFields } : {}),
		};
	}
}

export function vObj<T extends Record<string, IValidator<unknown> | Optional<IValidator<unknown>>>>(properties: T): ValidatorBase<vObjType<T>> {
	return new ObjValidator(properties);
}

class ArrayValidator<T> extends ValidatorBase<T[]> {
	public constructor(private readonly validator: IValidator<T>) {
		super();
	}

	public validate(content: unknown): { content: T[]; error: undefined } | { content: undefined; error: ValidationError } {
		if (!Array.isArray(content)) {
			return { content: undefined, error: { message: "Expected array" } };
		}

		const result: T[] = [];
		for (let index = 0; index < content.length; index += 1) {
			const { content: value, error } = this.validator.validate(content[index]);
			if (error) {
				return { content: undefined, error: { message: `Error in element ${index}: ${error.message}` } };
			}

			result.push(value);
		}

		return { content: result, error: undefined };
	}

	public getJSONSchema(): IJSONSchema {
		return {
			type: "array",
			items: this.validator.getJSONSchema(),
		};
	}
}

export function vArray<T>(validator: IValidator<T>): ValidatorBase<T[]> {
	return new ArrayValidator(validator);
}

type vTupleType<T extends IValidator<unknown>[]> = { [K in keyof T]: ValidatorType<T[K]> };

class TupleValidator<T extends IValidator<unknown>[]> extends ValidatorBase<vTupleType<T>> {
	public constructor(private readonly validators: T) {
		super();
	}

	public validate(content: unknown): { content: vTupleType<T>; error: undefined } | { content: undefined; error: ValidationError } {
		if (!Array.isArray(content)) {
			return { content: undefined, error: { message: "Expected array" } };
		}

		if (content.length !== this.validators.length) {
			return { content: undefined, error: { message: `Expected tuple of length ${this.validators.length}, but got ${content.length}` } };
		}

		const result = [] as unknown as vTupleType<T>;
		for (let index = 0; index < this.validators.length; index += 1) {
			const validator = this.validators[index];
			const { content: value, error } = validator.validate(content[index]);
			if (error) {
				return { content: undefined, error: { message: `Error in element ${index}: ${error.message}` } };
			}
			(result as unknown[]).push(value);
		}

		return { content: result, error: undefined };
	}

	public getJSONSchema(): IJSONSchema {
		return {
			type: "array",
			items: this.validators.map(validator => validator.getJSONSchema()),
		};
	}
}

export function vTuple<T extends IValidator<unknown>[]>(...validators: T): ValidatorBase<vTupleType<T>> {
	return new TupleValidator(validators);
}

class UnionValidator<T extends IValidator<unknown>[]> extends ValidatorBase<ValidatorType<T[number]>> {
	public constructor(private readonly validators: T) {
		super();
	}

	public validate(content: unknown): { content: ValidatorType<T[number]>; error: undefined } | { content: undefined; error: ValidationError } {
		let lastError: ValidationError | undefined;
		for (const validator of this.validators) {
			const { content: value, error } = validator.validate(content);
			if (!error) {
				return { content: value as ValidatorType<T[number]>, error: undefined };
			}

			lastError = error;
		}

		return { content: undefined, error: lastError ?? { message: "Expected union match" } };
	}

	public getJSONSchema(): IJSONSchema {
		return {
			oneOf: mapFilter(this.validators, validator => {
				if (validator instanceof UndefinedValidator) {
					return undefined;
				}

				return validator.getJSONSchema();
			}),
		};
	}
}

export function vUnion<T extends IValidator<unknown>[]>(...validators: T): ValidatorBase<ValidatorType<T[number]>> {
	return new UnionValidator(validators);
}

class EnumValidator<T extends string[]> extends ValidatorBase<T[number]> {
	public constructor(private readonly values: T) {
		super();
	}

	public validate(content: unknown): { content: T[number]; error: undefined } | { content: undefined; error: ValidationError } {
		if (!this.values.includes(content as T[number])) {
			return { content: undefined, error: { message: `Expected one of: ${this.values.join(", ")}` } };
		}

		return { content: content as T[number], error: undefined };
	}

	public getJSONSchema(): IJSONSchema {
		return {
			enum: this.values,
		};
	}
}

export function vEnum<T extends string[]>(...values: T): ValidatorBase<T[number]> {
	return new EnumValidator(values);
}

class LiteralValidator<T extends string> extends ValidatorBase<T> {
	public constructor(private readonly value: T) {
		super();
	}

	public validate(content: unknown): { content: T; error: undefined } | { content: undefined; error: ValidationError } {
		if (content !== this.value) {
			return { content: undefined, error: { message: `Expected: ${this.value}` } };
		}

		return { content: content as T, error: undefined };
	}

	public getJSONSchema(): IJSONSchema {
		return {
			const: this.value,
		};
	}
}

export function vLiteral<T extends string>(value: T): ValidatorBase<T> {
	return new LiteralValidator(value);
}

class LazyValidator<T> extends ValidatorBase<T> {
	public constructor(private readonly fn: () => IValidator<T>) {
		super();
	}

	public validate(content: unknown): { content: T; error: undefined } | { content: undefined; error: ValidationError } {
		return this.fn().validate(content);
	}

	public getJSONSchema(): IJSONSchema {
		return this.fn().getJSONSchema();
	}
}

export function vLazy<T>(fn: () => IValidator<T>): ValidatorBase<T> {
	return new LazyValidator(fn);
}

class UseRefSchemaValidator<T> extends ValidatorBase<T> {
	public constructor(
		private readonly ref: string,
		private readonly validator: IValidator<T>,
	) {
		super();
	}

	public validate(content: unknown): { content: T; error: undefined } | { content: undefined; error: ValidationError } {
		return this.validator.validate(content);
	}

	public getJSONSchema(): IJSONSchema {
		return { $ref: this.ref };
	}
}

export function vWithJsonSchemaRef<T>(ref: string, validator: IValidator<T>): ValidatorBase<T> {
	return new UseRefSchemaValidator(ref, validator);
}
