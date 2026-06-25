/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
	ISessionService,
	type ISessionService as ISessionServiceType,
} from "src/cs/workbench/services/session/common/session";
import {
	ITableFileService,
	type CommitTableFileImportResult,
	type ITableFileService as ITableFileServiceType,
	type TableFileSnapshot,
} from "src/cs/workbench/services/tableFile/common/tableFile";
import type { FileImportResult } from "src/cs/workbench/services/files/common/files";
import type { FileId } from "src/cs/workbench/services/session/common/sessionModel";

// TODO(conductor-architecture): Migration bridge.
// TableFile owns imported data-file APIs while Session remains the backing ledger.
export class TableFileService implements ITableFileServiceType {
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

registerSingleton(ITableFileService, TableFileService, InstantiationType.Delayed);
