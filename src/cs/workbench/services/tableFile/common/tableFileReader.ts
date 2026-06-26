/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { URI } from "src/cs/base/common/uri";
import type {
	IFileService,
	IFileStat,
	IReadFileEncoding,
} from "src/cs/platform/files/common/files";
import type { TableReadBuffer } from "src/cs/workbench/services/table/common/tableReadBuffer";
import {
	createTableByteBuffer,
	createTableTextBuffer,
} from "src/cs/workbench/services/table/common/tableReadBuffer";
import {
	tableFormatService,
	type TableFormatId,
} from "src/cs/workbench/services/table/common/tableFormatService";
import {
	decodeTableFileContent,
	getTableFileMimeType,
	getTableFileReadEncoding,
	isFileContent,
} from "src/cs/workbench/services/tableFile/common/encoding";

export type TableFileReadOptions = {
	readonly readEncoding?: IReadFileEncoding;
};

export type TableFileReadResult = {
	readonly buffer: TableReadBuffer;
	readonly format: TableFormatId;
	readonly mime?: string;
	readonly resource: URI;
	readonly stat: IFileStat;
};

export const readTableFile = async (
	resource: URI,
	fileService: IFileService,
	options: TableFileReadOptions = {},
): Promise<TableFileReadResult> => {
	const format = tableFormatService.resolveFormat(resource);
	if (!format) {
		throw new Error(`Unsupported table file: ${resource.toString()}`);
	}

	const stat = await fileService.stat(resource);
	const content = await fileService.readFile(resource, {
		encoding: options.readEncoding ?? getTableFileReadEncoding(resource),
	});
	if (!isFileContent(content)) {
		throw new Error("The file content could not be read.");
	}

	const decodedContent = decodeTableFileContent(content);
	const buffer = content.encoding === "utf8" && decodedContent.text !== null
		? createTableTextBuffer(decodedContent.text, content.encoding)
		: createTableByteBuffer(decodedContent.bytes);
	return {
		buffer,
		format,
		mime: getTableFileMimeType(getResourceFileName(resource)),
		resource,
		stat,
	};
};

const getResourceFileName = (resource: URI): string => {
	const path = String(resource.path ?? "").replace(/\\/g, "/");
	const index = path.lastIndexOf("/");
	const name = index >= 0 ? path.slice(index + 1) : path;
	return name || "table.csv";
};
