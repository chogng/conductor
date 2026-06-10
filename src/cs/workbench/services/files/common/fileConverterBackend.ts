/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";

export const IFileConverterBackendService =
	createDecorator<IFileConverterBackendService>("fileConverterBackendService");

export type FileConverterPreparedFile = {
	readonly csvText?: string;
	readonly durationMs?: number;
	readonly manifest?: unknown;
	readonly normalizedCsvPath?: string | null;
	readonly normalizedSizeBytes?: number;
	readonly ok?: boolean;
	readonly sheets?: readonly FileConverterPreparedSheet[];
	readonly sourceName?: string;
	readonly sourcePath?: string;
	readonly sourceSizeBytes?: number;
	readonly code?: string;
	readonly message?: string;
};

export type FileConverterPreparedSheet = {
	readonly columnCount?: number;
	readonly csvText?: string;
	readonly maxCellLengths?: readonly number[];
	readonly normalizedCsvPath?: string | null;
	readonly rowCount?: number;
	readonly sheetIndex?: number | null;
	readonly sheetName?: string | null;
};

export type FileConverterConvertedCsv = {
	readonly csvText?: string;
	readonly ok?: boolean;
	readonly sizeBytes?: number;
};

export type ConvertedCsvReaderService = {
	canReadConvertedCsv(): boolean;
	readConvertedCsv(payload: { path: string }): Promise<FileConverterConvertedCsv>;
};

export type FileConverterBackend = ConvertedCsvReaderService & {
	canPrepareFile(): boolean;
	prepareFile(payload: { fileName: string; path: string }): Promise<FileConverterPreparedFile>;
};

export interface IFileConverterBackendService extends FileConverterBackend {
	readonly _serviceBrand: undefined;
}
