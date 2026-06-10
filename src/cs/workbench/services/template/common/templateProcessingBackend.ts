/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type {
	ConvertedCsvReaderService,
} from "src/cs/workbench/services/files/common/fileConverterBackend";

export const ITemplateProcessingBackendService =
	createDecorator<ITemplateProcessingBackendService>("templateProcessingBackendService");

export type TemplateProcessingResultPayload = {
	readonly message?: string;
	readonly ok?: boolean;
	readonly result?: unknown;
	readonly [key: string]: unknown;
};

export type TemplateProcessingBackend = ConvertedCsvReaderService & {
	canProcessFile(): boolean;
	processFile(payload: unknown): Promise<TemplateProcessingResultPayload>;
};

export interface ITemplateProcessingBackendService extends TemplateProcessingBackend {
	readonly _serviceBrand: undefined;
}
