/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
	ByteBuffer,
	bufferToReadable,
	bufferToStream,
	decodeBase64,
	decodeHex,
	encodeBase64,
	encodeHex,
	prefixedBufferReadable,
	readableToBuffer,
	streamToBuffer,
} from "../../common/buffer.ts";

suite("base/test/common/buffer", () => {
	test("ByteBuffer encodes, concatenates, slices, and searches bytes", () => {
		const buffer = ByteBuffer.concat([
			ByteBuffer.fromString("alpha"),
			ByteBuffer.fromByteArray([45]),
			ByteBuffer.fromString("beta"),
		]);

		assert.deepStrictEqual({
			index: buffer.indexOf(ByteBuffer.fromString("-")),
			slice: buffer.slice(6).toString(),
			text: buffer.toString(),
		}, {
			index: 5,
			slice: "beta",
			text: "alpha-beta",
		});
	});

	test("ByteBuffer reads and writes integer values", () => {
		const buffer = ByteBuffer.alloc(8);
		buffer.writeUInt32BE(0x10203040, 0);
		buffer.writeUInt32LE(0x50607080, 4);

		assert.deepStrictEqual({
			first: buffer.readUInt32BE(0),
			last: buffer.readUInt32LE(4),
		}, {
			first: 0x10203040,
			last: 0x50607080,
		});
	});

	test("base64 and hex codecs round trip buffers", () => {
		const source = ByteBuffer.fromString("table review");
		const base64 = encodeBase64(source);
		const urlSafe = encodeBase64(source, false, true);
		const hex = encodeHex(source);

		assert.deepStrictEqual({
			base64: decodeBase64(base64).toString(),
			hex: decodeHex(hex).toString(),
			urlSafe: decodeBase64(urlSafe).toString(),
		}, {
			base64: "table review",
			hex: "table review",
			urlSafe: "table review",
		});
	});

	test("readable and stream helpers convert ByteBuffer values", async () => {
		const source = ByteBuffer.fromString("content");
		const prefixedReadable = prefixedBufferReadable(
			ByteBuffer.fromString("raw-"),
			bufferToReadable(source),
		);

		assert.deepStrictEqual({
			readable: readableToBuffer(prefixedReadable).toString(),
			stream: (await streamToBuffer(bufferToStream(source))).toString(),
		}, {
			readable: "raw-content",
			stream: "content",
		});
	});
});
