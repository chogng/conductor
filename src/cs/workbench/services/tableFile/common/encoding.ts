/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { URI } from "src/cs/base/common/uri";
import type {
	IFileContent,
	IReadFileEncoding,
} from "src/cs/platform/files/common/files";
import { tableFileFormatService } from "src/cs/workbench/services/tablefile/common/tableFileFormat";

export type TableFileDecodedContent = {
	readonly bytes: ArrayBuffer;
	readonly filePart: string | ArrayBuffer;
	readonly text: string | null;
};

export const getTableFileReadEncoding = (
	resource: URI | string | null | undefined,
): IReadFileEncoding =>
	tableFileFormatService.isExcel(resource) ? "base64" : "utf8";

export const decodeTableFileContent = (
	content: IFileContent,
): TableFileDecodedContent => {
	const filePart = content.encoding === "base64"
		? decodeBase64(content.value)
		: content.value;
	return {
		bytes: typeof filePart === "string" ? encodeText(filePart) : filePart,
		filePart,
		text: content.encoding === "utf8" ? content.value : null,
	};
};

export const isFileContent = (value: unknown): value is IFileContent => {
	if (!value || typeof value !== "object") {
		return false;
	}

	const candidate = value as Partial<IFileContent>;
	return (candidate.encoding === "base64" || candidate.encoding === "utf8") &&
		typeof candidate.value === "string";
};

export const getTableFileMimeType = (fileName: string): string => {
	if (tableFileFormatService.isExcel(fileName)) {
		return "application/octet-stream";
	}
	if (tableFileFormatService.isTsv(fileName)) {
		return "text/tab-separated-values;charset=utf-8";
	}
	return "text/csv;charset=utf-8";
};

const encodeText = (value: string): ArrayBuffer =>
	new TextEncoder().encode(value).buffer as ArrayBuffer;

const decodeBase64 = (value: string): ArrayBuffer => {
	const binary = globalThis.atob(value);
	const buffer = new ArrayBuffer(binary.length);
	const bytes = new Uint8Array(buffer);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return buffer;
};
