/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export interface ErrorListenerCallback {
	(error: unknown): void;
}

export interface ErrorListenerUnbind {
	(): void;
}

export class ErrorHandler {
	private unexpectedErrorHandler: (error: unknown) => void;
	private readonly listeners: ErrorListenerCallback[] = [];

	constructor() {
		this.unexpectedErrorHandler = error => {
			setTimeout(() => {
				if (error instanceof Error && error.stack) {
					if (ErrorNoTelemetry.isErrorNoTelemetry(error)) {
						throw new ErrorNoTelemetry(`${error.message}\n\n${error.stack}`);
					}

					throw new Error(`${error.message}\n\n${error.stack}`);
				}

				throw error;
			}, 0);
		};
	}

	addListener(listener: ErrorListenerCallback): ErrorListenerUnbind {
		this.listeners.push(listener);
		return () => {
			this.removeListener(listener);
		};
	}

	setUnexpectedErrorHandler(
		newUnexpectedErrorHandler: (error: unknown) => void,
	): void {
		this.unexpectedErrorHandler = newUnexpectedErrorHandler;
	}

	getUnexpectedErrorHandler(): (error: unknown) => void {
		return this.unexpectedErrorHandler;
	}

	onUnexpectedError(error: unknown): void {
		this.unexpectedErrorHandler(error);
		this.emit(error);
	}

	onUnexpectedExternalError(error: unknown): void {
		this.unexpectedErrorHandler(error);
	}

	private emit(error: unknown): void {
		for (const listener of this.listeners) {
			listener(error);
		}
	}

	private removeListener(listener: ErrorListenerCallback): void {
		const index = this.listeners.indexOf(listener);
		if (index >= 0) {
			this.listeners.splice(index, 1);
		}
	}
}

export const errorHandler = new ErrorHandler();

export function setUnexpectedErrorHandler(
	newUnexpectedErrorHandler: (error: unknown) => void,
): void {
	errorHandler.setUnexpectedErrorHandler(newUnexpectedErrorHandler);
}

export function isSigPipeError(error: unknown): error is Error {
	if (!error || typeof error !== "object") {
		return false;
	}

	const candidate = error as Record<string, string | undefined>;
	return candidate.code === "EPIPE" &&
		candidate.syscall?.toUpperCase() === "WRITE";
}

export function onBugIndicatingError(error: unknown): undefined {
	errorHandler.onUnexpectedError(error);
	return undefined;
}

export function onUnexpectedError(error: unknown): undefined {
	if (!isCancellationError(error)) {
		errorHandler.onUnexpectedError(error);
	}
	return undefined;
}

export function onUnexpectedExternalError(error: unknown): undefined {
	if (!isCancellationError(error)) {
		errorHandler.onUnexpectedExternalError(error);
	}
	return undefined;
}

export interface SerializedError {
	readonly $isError: true;
	readonly name: string;
	readonly message: string;
	readonly noTelemetry: boolean;
	readonly stack?: string;
	readonly code?: string;
	readonly cause?: SerializedError;
}

type ErrorWithCode = Error & {
	code?: string;
};

type ErrorWithStackTrace = Error & {
	readonly stacktrace?: string;
};

type ErrorWithCause = Error & {
	cause?: unknown;
};

export function transformErrorForSerialization(error: Error): SerializedError;
export function transformErrorForSerialization(error: unknown): unknown;
export function transformErrorForSerialization(error: unknown): unknown {
	if (error instanceof Error) {
		const cause = (error as ErrorWithCause).cause;
		return {
			$isError: true,
			name: error.name,
			message: error.message,
			stack: (error as ErrorWithStackTrace).stacktrace || error.stack,
			noTelemetry: ErrorNoTelemetry.isErrorNoTelemetry(error),
			code: (error as ErrorWithCode).code,
			cause: cause instanceof Error
				? transformErrorForSerialization(cause)
				: undefined,
		};
	}

	return error;
}

export function transformErrorFromSerialization(data: SerializedError): Error {
	let error: Error;
	if (data.noTelemetry) {
		error = new ErrorNoTelemetry();
	} else {
		error = new Error();
		error.name = data.name;
	}
	error.message = data.message;
	error.stack = data.stack;

	if (data.code) {
		(error as ErrorWithCode).code = data.code;
	}
	if (data.cause) {
		(error as ErrorWithCause).cause = transformErrorFromSerialization(data.cause);
	}

	return error;
}

export interface V8CallSite {
	getThis(): unknown;
	getTypeName(): string | null;
	getFunction(): Function | undefined;
	getFunctionName(): string | null;
	getMethodName(): string | null;
	getFileName(): string | null;
	getLineNumber(): number | null;
	getColumnNumber(): number | null;
	getEvalOrigin(): string | undefined;
	isToplevel(): boolean;
	isEval(): boolean;
	isNative(): boolean;
	isConstructor(): boolean;
	toString(): string;
}

export const canceledName = "Canceled";

export class CancellationError extends Error {
	constructor() {
		super(canceledName);
		this.name = this.message;
	}
}

export function isCancellationError(error: unknown): error is CancellationError {
	return error instanceof CancellationError ||
		(error instanceof Error &&
			error.name === canceledName &&
			error.message === canceledName);
}

export function canceled(): Error {
	return new CancellationError();
}

export function illegalArgument(name?: string): Error {
	return name
		? new Error(`Illegal argument: ${name}`)
		: new Error("Illegal argument");
}

export function illegalState(name?: string): Error {
	return name
		? new Error(`Illegal state: ${name}`)
		: new Error("Illegal state");
}

export class ReadonlyError extends TypeError {
	constructor(name?: string) {
		super(name
			? `${name} is read-only and cannot be changed`
			: "Cannot change read-only property");
	}
}

export function getErrorMessage(error: unknown): string {
	if (!error) {
		return "Error";
	}

	if (error instanceof Error) {
		return error.message || error.stack?.split("\n")[0] || String(error);
	}

	if (typeof error === "object") {
		const candidate = error as { readonly message?: unknown; readonly stack?: unknown };
		if (typeof candidate.message === "string") {
			return candidate.message;
		}
		if (typeof candidate.stack === "string") {
			return candidate.stack.split("\n")[0];
		}
	}

	return String(error);
}

export class NotImplementedError extends Error {
	constructor(message?: string) {
		super(message || "NotImplemented");
	}
}

export class NotSupportedError extends Error {
	constructor(message?: string) {
		super(message || "NotSupported");
	}
}

export class ExpectedError extends Error {
	readonly isExpected = true;
}

export class ErrorNoTelemetry extends Error {
	override readonly name = "CodeExpectedError";

	static fromError(error: Error): ErrorNoTelemetry {
		if (error instanceof ErrorNoTelemetry) {
			return error;
		}

		const result = new ErrorNoTelemetry();
		result.message = error.message;
		result.stack = error.stack;
		return result;
	}

	static isErrorNoTelemetry(error: Error): error is ErrorNoTelemetry {
		return error.name === "CodeExpectedError";
	}
}

export class PendingMigrationError extends Error {
	private static readonly errorName = "PendingMigrationError";

	static is(error: unknown): error is PendingMigrationError {
		return error instanceof PendingMigrationError ||
			(error instanceof Error && error.name === PendingMigrationError.errorName);
	}

	constructor(message: string) {
		super(message);
		this.name = PendingMigrationError.errorName;
	}
}

export class BugIndicatingError extends Error {
	constructor(message?: string) {
		super(message || "An unexpected bug occurred.");
		Object.setPrototypeOf(this, BugIndicatingError.prototype);
	}
}
