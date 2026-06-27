/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
	consumeReadable,
	consumeStream,
	newWriteableStream,
	peekReadable,
	prefixedStream,
	toReadable,
	toStream,
	transform,
} from "../../common/stream.ts";

suite("base/test/common/stream", () => {
	test("readable helpers consume and peek values", () => {
		const consumed = consumeReadable(toReadable("first"), chunks => chunks.join(""));
		const peeked = peekReadable(toReadable("second"), chunks => chunks.join(""), 2);

		assert.deepStrictEqual({
			consumed,
			peeked,
		}, {
			consumed: "first",
			peeked: "second",
		});
	});

	test("writeable stream buffers until listeners consume data", async () => {
		const stream = newWriteableStream<string>(chunks => chunks.join(""));
		stream.write("a");
		stream.write("b");
		stream.end("c");

		assert.equal(await consumeStream(stream, chunks => chunks.join("")), "abc");
	});

	test("stream helpers transform and prefix data", async () => {
		const upper = transform(
			toStream("data", chunks => chunks.join("")),
			{ data: value => value.toUpperCase() },
			chunks => chunks.join(""),
		);
		const prefixed = prefixedStream("RAW-", upper, chunks => chunks.join(""));

		assert.equal(await consumeStream(prefixed, chunks => chunks.join("")), "RAW-DATA");
	});
});
