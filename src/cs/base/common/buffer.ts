/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as streams from "./stream.js";
import { Lazy } from "./lazy.js";

let textEncoder: TextEncoder | undefined;
let textDecoder: TextDecoder | undefined;

// Shared skip table for byte searches. It is allocated lazily because callers
// that only encode/decode or concatenate buffers do not need search state.
const indexOfTable = new Lazy(() => new Uint8Array(256));

/**
 * Conductor byte buffer primitive for shared byte allocation, copying,
 * encoding, and stream conversion.
 */
export class ByteBuffer {
	public readonly byteLength: number;

	private constructor(
		public readonly bytes: Uint8Array,
	) {
		this.byteLength = bytes.byteLength;
	}

	public static alloc(byteLength: number): ByteBuffer {
		return new ByteBuffer(new Uint8Array(byteLength));
	}

	public static wrap(bytes: Uint8Array): ByteBuffer {
		return new ByteBuffer(bytes);
	}

	public static fromArrayBuffer(buffer: ArrayBufferLike, byteOffset?: number, length?: number): ByteBuffer {
		return new ByteBuffer(new Uint8Array(buffer, byteOffset, length));
	}

	public static fromString(value: string): ByteBuffer {
		textEncoder ??= new TextEncoder();
		return new ByteBuffer(textEncoder.encode(value));
	}

	public static fromByteArray(value: readonly number[]): ByteBuffer {
		return new ByteBuffer(Uint8Array.from(value));
	}

	public static concat(buffers: readonly ByteBuffer[], totalLength?: number): ByteBuffer {
		const length = totalLength ?? buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
		const result = ByteBuffer.alloc(length);
		let offset = 0;

		for (const buffer of buffers) {
			result.set(buffer, offset);
			offset += buffer.byteLength;
		}

		return result;
	}

	public clone(): ByteBuffer {
		const result = ByteBuffer.alloc(this.byteLength);
		result.set(this);
		return result;
	}

	public toArrayBuffer(): ArrayBuffer {
		const copy = new Uint8Array(this.byteLength);
		copy.set(this.bytes);
		return copy.buffer;
	}

	public toString(): string {
		textDecoder ??= new TextDecoder(undefined, { ignoreBOM: true });
		return textDecoder.decode(this.bytes);
	}

	public slice(start?: number, end?: number): ByteBuffer {
		return new ByteBuffer(this.bytes.subarray(start, end));
	}

	public set(array: ByteBuffer | Uint8Array | ArrayBuffer | ArrayBufferView, offset?: number): void {
		if (array instanceof ByteBuffer) {
			this.bytes.set(array.bytes, offset);
			return;
		}

		if (array instanceof Uint8Array) {
			this.bytes.set(array, offset);
			return;
		}

		if (array instanceof ArrayBuffer) {
			this.bytes.set(new Uint8Array(array), offset);
			return;
		}

		if (ArrayBuffer.isView(array)) {
			this.bytes.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), offset);
			return;
		}

		throw new Error("Unsupported byte source.");
	}

	public readUInt8(offset: number): number {
		return readUInt8(this.bytes, offset);
	}

	public writeUInt8(value: number, offset: number): void {
		writeUInt8(this.bytes, value, offset);
	}

	public readUInt32BE(offset: number): number {
		return readUInt32BE(this.bytes, offset);
	}

	public writeUInt32BE(value: number, offset: number): void {
		writeUInt32BE(this.bytes, value, offset);
	}

	public readUInt32LE(offset: number): number {
		return readUInt32LE(this.bytes, offset);
	}

	public writeUInt32LE(value: number, offset: number): void {
		writeUInt32LE(this.bytes, value, offset);
	}

	public indexOf(needle: ByteBuffer | Uint8Array, offset = 0): number {
		return indexOfBytes(this.bytes, needle instanceof ByteBuffer ? needle.bytes : needle, offset);
	}

	public equals(other: ByteBuffer): boolean {
		if (this === other) {
			return true;
		}

		if (this.byteLength !== other.byteLength) {
			return false;
		}

		return this.bytes.every((value, index) => value === other.bytes[index]);
	}
}

export function indexOfBytes(haystack: Uint8Array, needle: Uint8Array, offset = 0): number {
	const needleLength = needle.byteLength;
	const haystackLength = haystack.byteLength;

	if (needleLength === 0) {
		return 0;
	}

	if (needleLength === 1) {
		return haystack.indexOf(needle[0], offset);
	}

	if (needleLength > haystackLength - offset) {
		return -1;
	}

	const table = indexOfTable.value;
	table.fill(needleLength);
	for (let index = 0; index < needleLength; index++) {
		table[needle[index]] = needleLength - index - 1;
	}

	let haystackIndex = offset + needleLength - 1;
	let needleIndex = needleLength - 1;
	while (haystackIndex < haystackLength) {
		if (haystack[haystackIndex] === needle[needleIndex]) {
			if (needleIndex === 0) {
				return haystackIndex;
			}

			haystackIndex--;
			needleIndex--;
			continue;
		}

		haystackIndex += Math.max(needleLength - needleIndex, table[haystack[haystackIndex]]);
		needleIndex = needleLength - 1;
	}

	return -1;
}

export function readUInt16LE(source: Uint8Array, offset: number): number {
	return (
		((source[offset + 0] << 0) >>> 0) |
		((source[offset + 1] << 8) >>> 0)
	);
}

export function writeUInt16LE(destination: Uint8Array, value: number, offset: number): void {
	destination[offset + 0] = value & 0xff;
	destination[offset + 1] = (value >>> 8) & 0xff;
}

export function readUInt32BE(source: Uint8Array, offset: number): number {
	return (
		source[offset] * 2 ** 24
		+ source[offset + 1] * 2 ** 16
		+ source[offset + 2] * 2 ** 8
		+ source[offset + 3]
	);
}

export function writeUInt32BE(destination: Uint8Array, value: number, offset: number): void {
	destination[offset + 0] = (value >>> 24) & 0xff;
	destination[offset + 1] = (value >>> 16) & 0xff;
	destination[offset + 2] = (value >>> 8) & 0xff;
	destination[offset + 3] = value & 0xff;
}

export function readUInt32LE(source: Uint8Array, offset: number): number {
	return (
		((source[offset + 0] << 0) >>> 0) |
		((source[offset + 1] << 8) >>> 0) |
		((source[offset + 2] << 16) >>> 0) |
		((source[offset + 3] << 24) >>> 0)
	);
}

export function writeUInt32LE(destination: Uint8Array, value: number, offset: number): void {
	destination[offset + 0] = value & 0xff;
	destination[offset + 1] = (value >>> 8) & 0xff;
	destination[offset + 2] = (value >>> 16) & 0xff;
	destination[offset + 3] = (value >>> 24) & 0xff;
}

export function readUInt8(source: Uint8Array, offset: number): number {
	return source[offset];
}

export function writeUInt8(destination: Uint8Array, value: number, offset: number): void {
	destination[offset] = value & 0xff;
}

export interface ByteBufferReadable extends streams.Readable<ByteBuffer> { }

export interface ByteBufferReadableStream extends streams.ReadableStream<ByteBuffer> { }

export interface ByteBufferWriteableStream extends streams.WriteableStream<ByteBuffer> { }

export interface ByteBufferReadableBufferedStream extends streams.ReadableBufferedStream<ByteBuffer> { }

export function readableToBuffer(readable: ByteBufferReadable): ByteBuffer {
	return streams.consumeReadable(readable, chunks => ByteBuffer.concat(chunks));
}

export function bufferToReadable(buffer: ByteBuffer): ByteBufferReadable {
	return streams.toReadable(buffer);
}

export function streamToBuffer(stream: streams.ReadableStream<ByteBuffer>): Promise<ByteBuffer> {
	return streams.consumeStream(stream, chunks => ByteBuffer.concat(chunks));
}

export async function bufferedStreamToBuffer(bufferedStream: ByteBufferReadableBufferedStream): Promise<ByteBuffer> {
	if (bufferedStream.ended) {
		return ByteBuffer.concat(bufferedStream.buffer);
	}

	return ByteBuffer.concat([
		...bufferedStream.buffer,
		await streamToBuffer(bufferedStream.stream),
	]);
}

export function bufferToStream(buffer: ByteBuffer): streams.ReadableStream<ByteBuffer> {
	return streams.toStream(buffer, chunks => ByteBuffer.concat(chunks));
}

export function streamToBufferReadableStream(stream: streams.ReadableStreamEvents<Uint8Array | string>): streams.ReadableStream<ByteBuffer> {
	return streams.transform(
		stream,
		{ data: data => typeof data === "string" ? ByteBuffer.fromString(data) : ByteBuffer.wrap(data) },
		chunks => ByteBuffer.concat(chunks),
	);
}

export function newWriteableBufferStream(options?: streams.WriteableStreamOptions): ByteBufferWriteableStream {
	return streams.newWriteableStream(chunks => ByteBuffer.concat(chunks), options);
}

export function prefixedBufferReadable(prefix: ByteBuffer, readable: ByteBufferReadable): ByteBufferReadable {
	return streams.prefixedReadable(prefix, readable, chunks => ByteBuffer.concat(chunks));
}

export function prefixedBufferStream(prefix: ByteBuffer, stream: ByteBufferReadableStream): ByteBufferReadableStream {
	return streams.prefixedStream(prefix, stream, chunks => ByteBuffer.concat(chunks));
}

export function decodeBase64(value: string): ByteBuffer {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const binary = atob(normalized);
	const bytes = new Uint8Array(binary.length);

	for (let index = 0; index < binary.length; index++) {
		bytes[index] = binary.charCodeAt(index);
	}

	return ByteBuffer.wrap(bytes);
}

export function encodeBase64(buffer: ByteBuffer, padded = true, urlSafe = false): string {
	let binary = "";
	for (const byte of buffer.bytes) {
		binary += String.fromCharCode(byte);
	}

	let encoded = btoa(binary);
	if (!padded) {
		encoded = encoded.replace(/=+$/u, "");
	}

	if (urlSafe) {
		encoded = encoded.replace(/\+/g, "-").replace(/\//g, "_");
	}

	return encoded;
}

const hexChars = "0123456789abcdef";

export function encodeHex(buffer: ByteBuffer): string {
	let result = "";
	for (const byte of buffer.bytes) {
		result += hexChars[byte >>> 4];
		result += hexChars[byte & 0x0f];
	}

	return result;
}

export function decodeHex(hex: string): ByteBuffer {
	if (hex.length % 2 !== 0) {
		throw new SyntaxError("Hex string must have an even length.");
	}

	const bytes = new Uint8Array(hex.length / 2);
	for (let index = 0; index < hex.length; index += 2) {
		bytes[index / 2] = (decodeHexChar(hex, index) << 4) | decodeHexChar(hex, index + 1);
	}

	return ByteBuffer.wrap(bytes);
}

function decodeHexChar(value: string, index: number): number {
	const code = value.charCodeAt(index);
	if (code >= 48 && code <= 57) {
		return code - 48;
	}

	if (code >= 97 && code <= 102) {
		return code - 87;
	}

	if (code >= 65 && code <= 70) {
		return code - 55;
	}

	throw new SyntaxError(`Invalid hex character at position ${index}.`);
}
