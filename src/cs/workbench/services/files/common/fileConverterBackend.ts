/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type {
	RawTableHealthRecord,
	TemplateEligibility,
} from "src/cs/workbench/services/files/common/rawTable";

export const IFileConverterBackendService =
	createDecorator<IFileConverterBackendService>("fileConverterBackendService");

export type FileConverterPreparedFile = {
	readonly columnCount?: number;
	readonly csvText?: string;
	readonly durationMs?: number;
	readonly health?: RawTableHealthRecord;
	readonly manifest?: unknown;
	readonly maxCellLengths?: readonly number[];
	readonly normalizedCsvPath?: string | null;
	readonly normalizedSizeBytes?: number;
	readonly ok?: boolean;
	readonly rowCount?: number;
	readonly sheets?: readonly FileConverterPreparedSheet[];
	readonly sourceName?: string;
	readonly sourcePath?: string;
	readonly sourceSizeBytes?: number;
	readonly templateEligibility?: TemplateEligibility;
	readonly code?: string;
	readonly message?: string;
};

export type FileConverterPreparedSheet = {
	readonly columnCount?: number;
	readonly csvText?: string;
	readonly health?: RawTableHealthRecord;
	readonly maxCellLengths?: readonly number[];
	readonly normalizedCsvPath?: string | null;
	readonly rowCount?: number;
	readonly sheetIndex?: number | null;
	readonly sheetName?: string | null;
	readonly templateEligibility?: TemplateEligibility;
};

export type FileConverterConvertedCsv = {
	readonly csvText?: string;
	readonly ok?: boolean;
	readonly sizeBytes?: number;
};

export type ConvertedCsvReaderService = {
	canReadConvertedCsv(): boolean;
	readConvertedCsv(payload: { path: string; maxRows?: number }): Promise<FileConverterConvertedCsv>;
};

export type FileConverterBackend = ConvertedCsvReaderService & {
	canPrepareFile(): boolean;
	prepareFile(payload: { fileName: string; path: string }): Promise<FileConverterPreparedFile>;
};

export interface IFileConverterBackendService extends FileConverterBackend {
	readonly _serviceBrand: undefined;
}
