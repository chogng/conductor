/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { URI } from "src/cs/base/common/uri";
import type {
	IFileContent,
	IFileService,
	IFileStat,
} from "src/cs/platform/files/common/files";
import { startPerf } from "src/cs/workbench/common/perf";
import type { TableReadBuffer } from "src/cs/workbench/services/table/common/tableReadBuffer";
import type { TableParseDiagnostic } from "src/cs/workbench/services/table/common/model";
import {
	createTableByteChunkBuffer,
	createTableByteBuffer,
	createTableTextChunkBuffer,
	createTableTextBuffer,
} from "src/cs/workbench/services/table/common/tableReadBuffer";
import {
	tableFormatService,
	type TableFormatId,
} from "src/cs/workbench/services/table/common/tableFormatService";
import {
	canMaterializeTableFormat,
} from "src/cs/workbench/services/table/common/tableFormatRegistry";
import {
	decodeTableFileContent,
	getTableFileMimeType,
	getTableFileReadMode,
	resolveTableFileTextEncoding,
	type TableFileReadMode,
} from "src/cs/workbench/services/tableFile/common/encoding";

export type TableFileReadOptions = {
	readonly chunkSizeBytes?: number;
	readonly readMode?: TableFileReadMode;
};

const DefaultTableFileReadChunkSizeBytes = 1024 * 1024;

export type TableFileReadResult = {
	readonly buffer: TableReadBuffer;
	readonly format: TableFormatId;
	readonly mime?: string;
	readonly resource: URI;
	readonly stat: IFileStat;
};

export class TableFileReadDiagnosticError extends Error {
	public readonly diagnostic: TableParseDiagnostic;
	public readonly format: TableFormatId;
	public readonly resource: URI;
	public readonly stat: IFileStat;

	public constructor({
		diagnostic,
		format,
		resource,
		stat,
	}: {
		readonly diagnostic: TableParseDiagnostic;
		readonly format: TableFormatId;
		readonly resource: URI;
		readonly stat: IFileStat;
	}) {
		super(diagnostic.message);
		this.name = "TableFileReadDiagnosticError";
		this.diagnostic = diagnostic;
		this.format = format;
		this.resource = resource;
		this.stat = stat;
	}
}

export const isTableFileReadDiagnosticError = (
	error: unknown,
): error is TableFileReadDiagnosticError => error instanceof TableFileReadDiagnosticError;

export const readTableFile = async (
	resource: URI,
	fileService: IFileService,
	options: TableFileReadOptions = {},
): Promise<TableFileReadResult> => {
	const format = tableFormatService.resolveFormat(resource);
	if (!format || !canMaterializeTableFormat(format)) {
		throw new Error(`Unsupported table file: ${resource.toString()}`);
	}

	const stat = await fileService.stat(resource);
	const chunkSizeBytes = normalizeChunkSizeBytes(options.chunkSizeBytes);
	const readMode = options.readMode ?? getTableFileReadMode(format);
	const isChunked = stat.size > chunkSizeBytes;
	const endReadPerf = startPerf("table.file.read", {
		chunkSizeBytes,
		fileSizeBytes: stat.size,
		format,
		readMode,
		resourceScheme: resource.scheme,
		willReadChunks: isChunked,
	}, { silent: true });
	if (stat.size > chunkSizeBytes) {
		try {
			const chunks = await readTableFileByteChunks({
				chunkSizeBytes,
				fileService,
				format,
				resource,
				stat,
			});
			let buffer: TableReadBuffer;
			try {
				buffer = readMode === "text"
					? createTableTextChunkBuffer(
						chunks,
						resolveTableFileTextEncoding(chunks),
					)
					: createTableByteChunkBuffer(chunks);
			} catch (error) {
				throw createReadDiagnosticError({
					format,
					message: getErrorMessage(error, "The table file content could not be decoded."),
					resource,
					stat,
				});
			}
			endReadPerf({
				bufferKind: buffer.kind,
				chunkCount: chunks.length,
				success: true,
			});
			return {
				buffer,
				format,
				mime: getTableFileMimeType(format),
				resource,
				stat,
			};
		} catch (error) {
			endReadPerf({
				errorName: error instanceof Error ? error.name : "unknown",
				success: false,
			});
			throw error;
		}
	}

	let content: IFileContent;
	try {
		content = await fileService.readFile(resource);
	} catch (error) {
		endReadPerf({
			errorName: error instanceof Error ? error.name : "unknown",
			success: false,
		});
		throw error;
	}

	let decodedContent: ReturnType<typeof decodeTableFileContent>;
	try {
		decodedContent = decodeTableFileContent(content.value, readMode);
	} catch (error) {
		endReadPerf({
			errorName: error instanceof Error ? error.name : "unknown",
			success: false,
		});
		throw createReadDiagnosticError({
			format,
			message: getErrorMessage(error, "The table file content could not be decoded."),
			resource,
			stat,
		});
	}
	const buffer = decodedContent.text !== null
		? createTableTextBuffer(decodedContent.text, "utf8")
		: createTableByteBuffer(decodedContent.bytes);
	endReadPerf({
		bufferKind: buffer.kind,
		success: true,
	});
	return {
		buffer,
		format,
		mime: getTableFileMimeType(format),
		resource,
		stat,
	};
};

const readTableFileByteChunks = async ({
	chunkSizeBytes,
	fileService,
	format,
	resource,
	stat,
}: {
	readonly chunkSizeBytes: number;
	readonly fileService: IFileService;
	readonly format: TableFormatId;
	readonly resource: URI;
	readonly stat: IFileStat;
}): Promise<readonly Uint8Array[]> => {
	const chunks: Uint8Array[] = [];
	for (let position = 0; position < stat.size; position += chunkSizeBytes) {
		const length = Math.min(chunkSizeBytes, stat.size - position);
		const content = await fileService.readFile(resource, {
			position,
			length,
		});
		try {
			chunks.push(content.value);
		} catch (error) {
			throw createReadDiagnosticError({
				format,
				message: getErrorMessage(error, "The table file content could not be decoded."),
				resource,
				stat,
			});
		}
	}
	return chunks;
};

const normalizeChunkSizeBytes = (
	value: number | undefined,
): number => {
	const normalized = Math.floor(Number(value));
	return Number.isFinite(normalized) && normalized > 0
		? normalized
		: DefaultTableFileReadChunkSizeBytes;
};

const createReadDiagnosticError = ({
	format,
	message,
	resource,
	stat,
}: {
	readonly format: TableFormatId;
	readonly message: string;
	readonly resource: URI;
	readonly stat: IFileStat;
}): TableFileReadDiagnosticError =>
	new TableFileReadDiagnosticError({
		diagnostic: {
			code: "table.reader.decodeFailed",
			message,
			severity: "fatal",
		},
		format,
		resource,
		stat,
	});

const getErrorMessage = (error: unknown, fallback: string): string =>
	error instanceof Error && error.message.trim()
		? error.message
		: fallback;
