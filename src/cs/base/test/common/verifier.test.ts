/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
	BooleanVerifier,
	EnumVerifier,
	NumberVerifier,
	ObjectVerifier,
	SetVerifier,
	verifyObject,
} from "src/cs/base/common/verifier";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/common/verifier", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("falls back to defaults for primitive verifiers", () => {
		assert.equal(new BooleanVerifier(false).verify(true), true);
		assert.equal(new BooleanVerifier(false).verify("true"), false);
		assert.equal(new NumberVerifier(2).verify(4), 4);
		assert.equal(new NumberVerifier(2).verify("4"), 2);
	});

	test("verifies enum and set values", () => {
		const values = new Set(["a"]);

		assert.equal(new EnumVerifier("a", ["a", "b"]).verify("b"), "b");
		assert.equal(new EnumVerifier("a", ["a", "b"]).verify("c"), "a");
		assert.equal(new SetVerifier(values).verify(values), values);
		assert.equal(new SetVerifier(values).verify(["a"]), values);
	});

	test("verifies object values by property", () => {
		const verifier = new ObjectVerifier(
			{ enabled: false, count: 1 },
			{
				enabled: new BooleanVerifier(false),
				count: new NumberVerifier(1),
			},
		);

		assert.deepEqual(verifier.verify({ enabled: true, count: "bad" }), {
			enabled: true,
			count: 1,
		});
		assert.deepEqual(verifier.verify(null), {
			enabled: false,
			count: 1,
		});
	});

	test("verifies object values without constructing ObjectVerifier", () => {
		assert.deepEqual(
			verifyObject(
				{
					enabled: new BooleanVerifier(false),
					count: new NumberVerifier(1),
				},
				{ enabled: true },
			),
			{ enabled: true, count: 1 },
		);
	});
});
