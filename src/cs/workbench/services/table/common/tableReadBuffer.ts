/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export type TableReadBuffer = TableTextBuffer | TableByteBuffer;

export interface TableTextBuffer {
	readonly kind: "text";
	readonly encoding: string;
	readonly chunks?: AsyncIterable<TableTextChunk>;
	getLine?(lineNumber: number): string | undefined;
	readLines?(start: number, end: number): readonly string[];
}

export interface TableTextChunk {
	readonly lineStart: number;
	readonly text: string;
}

export interface TableByteBuffer {
	readonly kind: "bytes";
	readonly bytes?: Uint8Array;
	readonly chunks?: AsyncIterable<Uint8Array>;
}

export const createTableTextBuffer = (
	text: string,
	encoding: string,
): TableTextBuffer => {
	const lines = text.split(/\r\n|\r|\n/);
	return {
		kind: "text",
		encoding,
		chunks: createSingleTextChunkIterable(text),
		getLine: lineNumber => {
			const index = Math.max(0, Math.floor(Number(lineNumber)) - 1);
			return lines[index];
		},
		readLines: (start, end) => {
			const startIndex = Math.max(0, Math.floor(Number(start)));
			const endIndex = Math.max(startIndex, Math.floor(Number(end)));
			return lines.slice(startIndex, endIndex);
		},
	};
};

export const createTableByteBuffer = (
	bytes: ArrayBuffer | Uint8Array,
): TableByteBuffer => {
	const byteArray = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	return {
		kind: "bytes",
		bytes: byteArray,
		chunks: createSingleByteChunkIterable(byteArray),
	};
};

export const readTableTextBuffer = async (
	buffer: TableTextBuffer,
): Promise<string> => {
	const chunks: string[] = [];
	if (buffer.chunks) {
		for await (const chunk of buffer.chunks) {
			chunks.push(chunk.text);
		}
	}
	return chunks.join("");
};

export const readTableByteBuffer = async (
	buffer: TableByteBuffer,
): Promise<Uint8Array> => {
	if (buffer.bytes) {
		return buffer.bytes;
	}

	const chunks: Uint8Array[] = [];
	let byteLength = 0;
	if (buffer.chunks) {
		for await (const chunk of buffer.chunks) {
			chunks.push(chunk);
			byteLength += chunk.byteLength;
		}
	}

	const bytes = new Uint8Array(byteLength);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
};

export const getTableReadBufferFilePart = async (
	buffer: TableReadBuffer,
): Promise<string | ArrayBuffer> => {
	if (buffer.kind === "text") {
		return readTableTextBuffer(buffer);
	}
	const bytes = await readTableByteBuffer(buffer);
	return copyBytesToArrayBuffer(bytes);
};

export const copyBytesToArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
	bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

const createSingleTextChunkIterable = (text: string): AsyncIterable<TableTextChunk> => ({
	async *[Symbol.asyncIterator]() {
		yield {
			lineStart: 1,
			text,
		};
	},
});

const createSingleByteChunkIterable = (bytes: Uint8Array): AsyncIterable<Uint8Array> => ({
	async *[Symbol.asyncIterator]() {
		yield bytes;
	},
});
