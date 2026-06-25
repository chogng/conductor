/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import type { FileImportResult } from "src/cs/workbench/services/files/common/files";
import {
	ISessionService,
	type ISessionService as ISessionServiceType,
} from "src/cs/workbench/services/session/common/session";
import type { FileId } from "src/cs/workbench/services/session/common/sessionModel";
import { tableFileFormatService } from "src/cs/workbench/services/table/common/tableFileFormat";
import {
	type CommitTableFileImportResult,
	ITableFileService,
	type ITableFileService as ITableFileServiceType,
	type TableFileSnapshot,
} from "src/cs/workbench/services/tablefile/common/tablefile";

// TableFile owns explicit converted-import APIs while Session remains the backing ledger.
export class BrowserTableFileService implements ITableFileServiceType {
	public declare readonly _serviceBrand: undefined;

	public readonly onDidChangeTableFiles: ITableFileServiceType["onDidChangeTableFiles"];

	public constructor(
		@ISessionService private readonly sessionService: ISessionServiceType,
	) {
		this.onDidChangeTableFiles = this.sessionService.onDidChangeSession;
	}

	public clearTableFiles(): void {
		this.sessionService.clearSession();
	}

	public commitImport(
		result: FileImportResult,
	): CommitTableFileImportResult {
		assertSupportedTableFileImport(result);
		return this.sessionService.commitFileImport(result);
	}

	public getSnapshot(): TableFileSnapshot {
		return this.sessionService.getSnapshot();
	}

	public removeFiles(fileIds: readonly string[]): void {
		this.sessionService.removeFiles(fileIds);
	}

	public renameFile(fileId: FileId, name: string): boolean {
		return this.sessionService.renameFile(fileId, name);
	}
}

const assertSupportedTableFileImport = (
	result: FileImportResult,
): void => {
	for (const file of result.files) {
		const fileNames = getImportedTableFileNameCandidates(file);
		if (!fileNames.some(fileName => tableFileFormatService.canHandle(fileName))) {
			throw new Error(`Unsupported table file: ${fileNames[0] ?? "Unknown file"}`);
		}
	}
};

const getImportedTableFileNameCandidates = (
	file: FileImportResult["files"][number],
): readonly string[] => [
	file.name,
	file.raw.fileName,
	file.id,
]
	.map(value => String(value ?? "").trim())
	.filter((value): value is string => Boolean(value));

registerSingleton(ITableFileService, BrowserTableFileService, InstantiationType.Delayed);
