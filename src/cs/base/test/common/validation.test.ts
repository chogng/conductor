/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
	vArray,
	vBoolean,
	vEnum,
	vObj,
	vOptionalProp,
	vString,
	vTuple,
	vUnion,
	vUndefined,
} from "src/cs/base/common/validation";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/common/validation", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("validates object properties", () => {
		const validator = vObj({
			id: vString(),
			enabled: vOptionalProp(vBoolean()),
		});

		assert.deepEqual(validator.validate({ id: "recipe", enabled: true }), {
			content: { id: "recipe", enabled: true },
			error: undefined,
		});
		assert.deepEqual(validator.validate({ id: "recipe" }), {
			content: { id: "recipe" },
			error: undefined,
		});
		assert.equal(validator.validate({ enabled: true }).error?.message, "Error in property 'id': Expected string, but got undefined");
	});

	test("validates arrays, tuples, unions, and enums", () => {
		assert.deepEqual(vArray(vString()).validate(["a", "b"]).content, ["a", "b"]);
		assert.equal(vArray(vString()).validate(["a", 1]).error?.message, "Error in element 1: Expected string, but got number");

		assert.deepEqual(vTuple(vString(), vBoolean()).validate(["a", true]).content, ["a", true]);
		assert.equal(vTuple(vString()).validate(["a", "b"]).error?.message, "Expected tuple of length 1, but got 2");

		assert.equal(vUnion(vUndefined(), vEnum("x", "y")).validate("x").content, "x");
		assert.deepEqual(vUnion(vUndefined(), vEnum("x", "y")).getJSONSchema(), {
			oneOf: [{ enum: ["x", "y"] }],
		});
	});

	test("throws validation errors on demand", () => {
		assert.equal(vString().validateOrThrow("value"), "value");
		assert.throws(() => vString().validateOrThrow(1), /Expected string, but got number/);
	});
});
