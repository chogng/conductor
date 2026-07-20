/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { ByteBuffer } from "src/cs/base/common/buffer";
import type { TableFormatId } from "src/cs/workbench/services/table/common/tableFormatService";

export type TableFileDecodedContent = {
	readonly bytes: ArrayBuffer;
	readonly filePart: string | ArrayBuffer;
	readonly text: string | null;
};

export type TableFileReadMode = "bytes" | "text";

export const getTableFileReadMode = (
	format: TableFormatId,
): TableFileReadMode =>
	format === "xls" || format === "xlsx" ? "bytes" : "text";

export const decodeTableFileContent = (
	content: Uint8Array,
	mode: TableFileReadMode,
): TableFileDecodedContent => {
	const bytes = ByteBuffer.wrap(content).toArrayBuffer();
	const text = mode === "text" ? decodeTableFileTextChunks([content]).join("") : null;
	const filePart = text ?? bytes;
	return {
		bytes,
		filePart,
		text,
	};
};

export const decodeTableFileTextChunks = (
	chunks: readonly Uint8Array[],
): readonly string[] => {
	validateTableFileTextChunks(chunks);
	try {
		return decodeTableFileTextChunksWithEncoding(chunks, "utf-8");
	} catch {
		try {
			return decodeTableFileTextChunksWithEncoding(chunks, "gb18030");
		} catch {
			throw new Error("The table file is not valid UTF-8 or GB18030 text.");
		}
	}
};

export const getTableFileMimeType = (format: TableFormatId): string => {
	if (format === "xls" || format === "xlsx") {
		return "application/octet-stream";
	}
	if (format === "tsv") {
		return "text/tab-separated-values;charset=utf-8";
	}
	return "text/csv;charset=utf-8";
};

const validateTableFileTextChunks = (
	chunks: readonly Uint8Array[],
): void => {
	const prefix = getTableFileBytePrefix(chunks, 4);
	if (isZipFilePrefix(prefix)) {
		throw new Error("The table file contains ZIP binary data and cannot be decoded as CSV or TSV text.");
	}
	if (chunks.some(chunk => chunk.includes(0))) {
		throw new Error("The table file contains binary data and cannot be decoded as CSV or TSV text.");
	}
};

const decodeTableFileTextChunksWithEncoding = (
	chunks: readonly Uint8Array[],
	encoding: string,
): readonly string[] => {
	const decoder = new TextDecoder(encoding, { fatal: true });
	const decodedChunks: string[] = [];
	for (let index = 0; index < chunks.length; index += 1) {
		const text = decoder.decode(chunks[index], {
			stream: index < chunks.length - 1,
		});
		if (text) {
			decodedChunks.push(text);
		}
	}
	return decodedChunks;
};

const getTableFileBytePrefix = (
	chunks: readonly Uint8Array[],
	length: number,
): Uint8Array => {
	const prefix = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		const remaining = length - offset;
		if (remaining <= 0) {
			break;
		}
		const slice = chunk.subarray(0, remaining);
		prefix.set(slice, offset);
		offset += slice.byteLength;
	}
	return prefix.subarray(0, offset);
};

const isZipFilePrefix = (
	prefix: Uint8Array,
): boolean =>
	prefix.byteLength >= 4 &&
	prefix[0] === 0x50 &&
	prefix[1] === 0x4b &&
	(
		(prefix[2] === 0x03 && prefix[3] === 0x04) ||
		(prefix[2] === 0x05 && prefix[3] === 0x06) ||
		(prefix[2] === 0x07 && prefix[3] === 0x08)
	);
