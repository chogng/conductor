/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type {
	FileImportResult,
} from "src/cs/workbench/services/files/common/files";
import type {
	CommitFileImportOptions,
	CommitFileImportResult,
	CommitFileImportRawTableFactsInput,
	SessionSnapshot,
} from "src/cs/workbench/services/session/common/session";
import type { SessionChangeEvent } from "src/cs/workbench/services/session/common/sessionEvents";
import type { FileId } from "src/cs/workbench/services/session/common/sessionModel";
import type { RawTableFactsRecord } from "src/cs/workbench/services/tableFacts/common/tableFacts";

export const ITableFileService = createDecorator<ITableFileService>("tableFileService");

export type TableFileSnapshot = SessionSnapshot;
export type TableFileChangeEvent = SessionChangeEvent;
export type CommitTableFileImportRawTableFactsInput = CommitFileImportRawTableFactsInput;
export type CommitTableFileImportOptions = CommitFileImportOptions;
export type CommitTableFileImportResult = CommitFileImportResult;

export interface ITableFileService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeTableFiles: Event<TableFileChangeEvent>;

	clearTableFiles(): void;
	commitImport(result: FileImportResult, options?: CommitTableFileImportOptions): CommitTableFileImportResult;
	commitTableFacts(tableFacts: RawTableFactsRecord): void;
	commitTableFactsBatch(tableFacts: readonly RawTableFactsRecord[]): void;
	getSnapshot(): TableFileSnapshot;
	removeFiles(fileIds: readonly string[]): void;
	renameFile(fileId: FileId, name: string): boolean;
}
