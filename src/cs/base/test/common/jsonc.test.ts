/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { parse, stripComments } from "src/cs/base/common/jsonc";

suite("base/common/jsonc", () => {
	test("parses comments and trailing commas", () => {
		assert.deepEqual(parse("{\n  // comment\n  \"value\": 1,\n}\n"), { value: 1 });
		assert.deepEqual(parse("{\n  /* comment */\n  \"items\": [1, 2,],\n}\n"), { items: [1, 2] });
	});

	test("keeps comment markers inside strings", () => {
		assert.deepEqual(parse("{ \"url\": \"https://example.test/path\", \"text\": \"/* value */\", }"), {
			url: "https://example.test/path",
			text: "/* value */",
		});
	});

	test("treats comments as whitespace", () => {
		assert.throws(() => JSON.parse(stripComments("1/* comment */2")));
	});
});
