/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from "./types";

interface IVerifier<T> {
	verify(value: unknown): T;
}

abstract class Verifier<T> implements IVerifier<T> {
	public constructor(protected readonly defaultValue: T) {}

	public verify(value: unknown): T {
		if (!this.isType(value)) {
			return this.defaultValue;
		}

		return value;
	}

	protected abstract isType(value: unknown): value is T;
}

export class BooleanVerifier extends Verifier<boolean> {
	protected isType(value: unknown): value is boolean {
		return typeof value === "boolean";
	}
}

export class NumberVerifier extends Verifier<number> {
	protected isType(value: unknown): value is number {
		return typeof value === "number";
	}
}

export class SetVerifier<T> extends Verifier<Set<T>> {
	protected isType(value: unknown): value is Set<T> {
		return value instanceof Set;
	}
}

export class EnumVerifier<T> extends Verifier<T> {
	private readonly allowedValues: readonly T[];

	public constructor(defaultValue: T, allowedValues: readonly T[]) {
		super(defaultValue);
		this.allowedValues = allowedValues;
	}

	protected isType(value: unknown): value is T {
		return this.allowedValues.includes(value as T);
	}
}

export class ObjectVerifier<T extends object> extends Verifier<T> {
	public constructor(defaultValue: T, private readonly verifier: { [K in keyof T]: IVerifier<T[K]> }) {
		super(defaultValue);
	}

	public override verify(value: unknown): T {
		if (!this.isType(value)) {
			return this.defaultValue;
		}

		return verifyObject<T>(this.verifier, value);
	}

	protected isType(value: unknown): value is T {
		return isObject(value);
	}
}

export function verifyObject<T extends object>(verifiers: { [K in keyof T]: IVerifier<T[K]> }, value: object): T {
	const result: Record<string, unknown> = Object.create(null);

	for (const key in verifiers) {
		if (Object.prototype.hasOwnProperty.call(verifiers, key)) {
			const verifier = verifiers[key];
			result[key] = verifier.verify((value as Record<string, unknown>)[key]);
		}
	}

	return result as T;
}
