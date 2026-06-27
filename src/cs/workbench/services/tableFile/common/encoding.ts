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
	const text = mode === "text" ? new TextDecoder().decode(content) : null;
	const filePart = text ?? bytes;
	return {
		bytes,
		filePart,
		text,
	};
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
