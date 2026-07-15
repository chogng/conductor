import assert from "assert";

import {
	ErrorNoTelemetry,
	isSerializedError,
	transformErrorForSerialization,
	transformErrorFromSerialization,
	type SerializedError,
} from "../../common/errors.ts";

suite("base/test/common/errors", () => {
	test("serializes regular errors as a compact wire record", () => {
		const serialized = transformErrorForSerialization(new Error("Failure"));

		assert.equal(serialized.$isError, true);
		assert.equal(serialized.name, "Error");
		assert.equal(serialized.message, "Failure");
		assert.equal(typeof serialized.stack, "string");
		assert.equal("code" in serialized, false);
		assert.equal("cause" in serialized, false);
		assert.equal("noTelemetry" in serialized, false);
	});

	test("preserves code, cause, and telemetry intent across a round trip", () => {
		const source = new ErrorNoTelemetry("Operation failed") as ErrorNoTelemetry & {
			cause?: unknown;
			code?: string;
		};
		source.code = "E_OPERATION";
		source.cause = new Error("Root failure");

		const serialized = transformErrorForSerialization(source);
		const revived = transformErrorFromSerialization(serialized) as ErrorNoTelemetry & {
			cause?: unknown;
			code?: string;
		};

		assert.equal(serialized.noTelemetry, true);
		assert.equal(serialized.code, "E_OPERATION");
		assert.equal(serialized.cause?.message, "Root failure");
		assert.equal(revived instanceof ErrorNoTelemetry, true);
		assert.equal(revived.message, "Operation failed");
		assert.equal(revived.code, "E_OPERATION");
		assert.equal(revived.cause instanceof Error, true);
		assert.equal((revived.cause as Error).message, "Root failure");
	});

	test("normalizes non-Error throws", () => {
		const serialized = transformErrorForSerialization("String failure");
		const revived = transformErrorFromSerialization(serialized);

		assert.deepStrictEqual(serialized, {
			$isError: true,
			name: "Error",
			message: "String failure",
		});
		assert.equal(revived instanceof Error, true);
		assert.equal(revived.message, "String failure");
	});

	test("cuts circular causes and rejects circular wire records", () => {
		const source = new Error("Circular") as Error & { cause?: unknown };
		source.cause = source;
		const serialized = transformErrorForSerialization(source);
		assert.equal("cause" in serialized, false);

		const circular = {
			$isError: true,
			name: "Error",
			message: "Circular",
		} as SerializedError & { cause?: SerializedError };
		circular.cause = circular;
		assert.equal(isSerializedError(circular), false);
	});

	test("validates the complete wire shape", () => {
		assert.equal(isSerializedError({
			$isError: true,
			name: "Error",
			message: "Valid",
			noTelemetry: true,
		}), true);
		assert.equal(isSerializedError({
			$isError: true,
			name: "Error",
			message: "Invalid",
			noTelemetry: false,
		}), false);
		assert.equal(isSerializedError({
			$isError: true,
			name: "Error",
			message: 1,
		}), false);
	});
});
