/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, type Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { mark } from "src/cs/base/common/performance";
import type { URI } from "src/cs/base/common/uri";
import {
	FileSystemProviderCapabilities,
	type IFileService,
	type IFileStat,
} from "src/cs/platform/files/common/files";
import { startPerf } from "src/cs/workbench/common/perf";
import {
	TableModel,
	type TableModelContentSnapshot,
	type TableModelSheetSnapshot,
	type TableModelResolvedContent,
} from "src/cs/workbench/services/table/common/model";
import {
	DEFAULT_PHYSICAL_TABLE_SHEET_ID,
	type ParsedTableContent,
	type ParsedTableSheet,
	type ParsedTableStructure,
	type TableXlsReader,
} from "src/cs/workbench/services/table/common/tableStructureParser";
import type { ITableStructureParserService } from "src/cs/workbench/services/table/common/tableStructureParserService";
import {
	readTableFile,
	isTableFileReadDiagnosticError,
	type TableFileReadDiagnosticError,
	type TableFileReadResult,
	type TableFileReadOptions,
} from "src/cs/workbench/services/tableFile/common/tableFileReader";

export type TableFileEditorModelSnapshot = {
	readonly conflict: boolean;
	readonly dirty: boolean;
	readonly errorMessage: string;
	readonly lastResolvedStat: IFileStat | null;
	readonly orphaned: boolean;
	readonly resource: URI;
	readonly saving: boolean;
	readonly sourceVersion: number;
};

export type TableFileEditorModelResolveOptions = TableFileReadOptions & {
	readonly xlsReader?: TableXlsReader;
};

export class TableFileEditorModel extends Disposable {
	private readonly onDidChangeStateEmitter = this._register(new Emitter<TableFileEditorModel>());
	public readonly onDidChangeState: Event<TableFileEditorModel> =
		this.onDidChangeStateEmitter.event;

	public readonly model: TableModel;

	private conflict = false;
	private dirty = false;
	private errorMessage = "";
	private lastResolvedStat: IFileStat | null = null;
	private orphaned = false;
	private pendingText: string | null = null;
	private saving = false;
	private sourceVersion = 0;

	public constructor(
		public readonly resource: URI,
		private readonly fileService: IFileService,
		private readonly tableStructureParserService: ITableStructureParserService,
	) {
		super();
		this.model = this._register(new TableModel(resource));
		if (hasFileProviderCapability(
			this.fileService,
			resource,
			FileSystemProviderCapabilities.FileWatch,
		)) {
			this._register(this.fileService.watch(resource, { recursive: false }));
		}
	}

	public getSourceVersion(): number {
		return this.sourceVersion;
	}

	public getSnapshot(): TableFileEditorModelSnapshot {
		return {
			conflict: this.conflict,
			dirty: this.dirty,
			errorMessage: this.errorMessage,
			lastResolvedStat: this.lastResolvedStat,
			orphaned: this.orphaned,
			resource: this.resource,
			saving: this.saving,
			sourceVersion: this.sourceVersion,
		};
	}

	public getLastResolvedStat(): IFileStat | null {
		return this.lastResolvedStat;
	}

	public isDirty(): boolean {
		return this.dirty;
	}

	public isSaving(): boolean {
		return this.saving;
	}

	public async resolve(options: TableFileEditorModelResolveOptions = {}): Promise<void> {
		mark("code/willResolveTableFileEditorModel");
		const endResolvePerf = startPerf("table.fileEditor.resolve", {
			resourceScheme: this.resource.scheme,
			wasDirty: this.dirty,
		}, { silent: true });
		try {
			await this.resolveFromDisk(options);
			this.setLifecycleState({
				conflict: false,
				errorMessage: "",
				orphaned: false,
			});
			endResolvePerf({
				sourceVersion: this.sourceVersion,
				success: true,
			});
		} catch (error) {
			this.setLifecycleState({
				errorMessage: getErrorMessage(error),
				orphaned: true,
			});
			endResolvePerf({
				errorName: error instanceof Error ? error.name : "unknown",
				success: false,
			});
			throw error;
		} finally {
			mark("code/didResolveTableFileEditorModel");
		}
	}

	public async reload(options: TableFileEditorModelResolveOptions = {}): Promise<void> {
		await this.resolve(options);
	}

	public markDirty(text: string): void {
		this.pendingText = text;
		this.setLifecycleState({
			dirty: true,
			errorMessage: "",
		});
	}

	public markConflict(): void {
		this.setLifecycleState({ conflict: true });
	}

	public markOrphaned(orphaned: boolean): void {
		this.setLifecycleState({
			orphaned,
			...(orphaned ? {} : { errorMessage: "" }),
		});
	}

	public async save(text?: string): Promise<void> {
		if (typeof text === "string") {
			this.markDirty(text);
		}
		if (!this.dirty || this.pendingText === null) {
			return;
		}

		this.setLifecycleState({
			errorMessage: "",
			saving: true,
		});
		try {
			await this.fileService.writeFile(this.resource, this.pendingText);
			this.pendingText = null;
			this.setLifecycleState({
				conflict: false,
				dirty: false,
				orphaned: false,
			});
			await this.resolveFromDisk();
		} catch (error) {
			this.setLifecycleState({
				errorMessage: getErrorMessage(error),
			});
			throw error;
		} finally {
			this.setLifecycleState({ saving: false });
		}
	}

	public async revert(): Promise<void> {
		this.pendingText = null;
		this.setLifecycleState({
			conflict: false,
			dirty: false,
			errorMessage: "",
		});
		await this.resolve();
	}

	private async resolveFromDisk(options: TableFileEditorModelResolveOptions = {}): Promise<void> {
		await this.model.resolve({
			resolveContent: () =>
				this.resolveContentFromDisk(options),
		});
		this.onDidChangeStateEmitter.fire(this);
	}

	private async resolveContentFromDisk(
		options: TableFileEditorModelResolveOptions,
	): Promise<TableModelResolvedContent> {
		const endResolveContentPerf = startPerf("table.fileEditor.resolveContentFromDisk", {
			resourceScheme: this.resource.scheme,
		}, { silent: true });
		const { xlsReader, ...readOptions } = options;
		let readResult: TableFileReadResult;
		try {
			readResult = await readTableFile(this.resource, this.fileService, readOptions);
		} catch (error) {
			if (isTableFileReadDiagnosticError(error)) {
				this.lastResolvedStat = error.stat;
				this.sourceVersion = normalizeResourceSourceVersion(error.stat.mtime);
				const resolvedContent = createResolvedContentFromReadDiagnostic(error);
				endResolveContentPerf({
					diagnosticsCount: resolvedContent.diagnostics?.length ?? 0,
					fileSizeBytes: error.stat.size,
					format: error.format,
					success: false,
				});
				return resolvedContent;
			}
			endResolveContentPerf({
				errorName: error instanceof Error ? error.name : "unknown",
				success: false,
			});
			throw error;
		}
		this.lastResolvedStat = readResult.stat;
		this.sourceVersion = normalizeResourceSourceVersion(readResult.stat.mtime);
		const parsedContent = await this.tableStructureParserService.parse({
			buffer: readResult.buffer,
			format: readResult.format,
			...(readResult.format === "xls" && xlsReader ? { xlsReader } : {}),
		});
		const resolvedContent = createResolvedContent({
			parsedContent,
			readResult,
			resource: this.resource,
		});
		endResolveContentPerf({
			...summarizeParsedTableStructure(parsedContent),
			fileSizeBytes: readResult.stat.size,
			format: readResult.format,
			success: resolvedContent.content !== null,
		});
		return resolvedContent;
	}

	private setLifecycleState(update: {
		readonly conflict?: boolean;
		readonly dirty?: boolean;
		readonly errorMessage?: string;
		readonly orphaned?: boolean;
		readonly saving?: boolean;
	}): void {
		const nextConflict = update.conflict ?? this.conflict;
		const nextDirty = update.dirty ?? this.dirty;
		const nextErrorMessage = update.errorMessage ?? this.errorMessage;
		const nextOrphaned = update.orphaned ?? this.orphaned;
		const nextSaving = update.saving ?? this.saving;
		if (
			nextConflict === this.conflict &&
			nextDirty === this.dirty &&
			nextErrorMessage === this.errorMessage &&
			nextOrphaned === this.orphaned &&
			nextSaving === this.saving
		) {
			return;
		}

		this.conflict = nextConflict;
		this.dirty = nextDirty;
		this.errorMessage = nextErrorMessage;
		this.orphaned = nextOrphaned;
		this.saving = nextSaving;
		this.onDidChangeStateEmitter.fire(this);
	}
}

const createResolvedContent = ({
	parsedContent,
	readResult,
	resource,
}: {
	readonly parsedContent: ParsedTableStructure;
	readonly readResult: TableFileReadResult;
	readonly resource: URI;
}): TableModelResolvedContent => ({
	content: materializeModelContentSnapshot(parsedContent.content),
	defaultSheetId: getModelDefaultSheetId(parsedContent.sheets, resource),
	diagnostics: parsedContent.diagnostics,
	format: readResult.format,
	resource,
	sheets: materializeModelSheetSnapshots(parsedContent.sheets, resource),
	sourceVersion: readResult.stat.mtime,
});

const createResolvedContentFromReadDiagnostic = (
	error: TableFileReadDiagnosticError,
): TableModelResolvedContent => ({
	content: null,
	defaultSheetId: null,
	diagnostics: [error.diagnostic],
	format: error.format,
	resource: error.resource,
	sheets: [],
	sourceVersion: error.stat.mtime,
});

const materializeModelContentSnapshot = (
	content: ParsedTableContent | null,
): TableModelContentSnapshot | null => content
	? {
			columnCount: content.columnCount,
			columnFacts: content.columnFacts,
			contentFingerprint: content.contentFingerprint,
			maxCellLengths: content.maxCellLengths,
			rowCount: content.rowCount,
			rows: content.rows,
			...(content.rowWindows ? { rowWindows: content.rowWindows } : {}),
		}
	: null;

const materializeModelSheetSnapshots = (
	sheets: readonly ParsedTableSheet[],
	resource: URI,
): readonly TableModelSheetSnapshot[] =>
	sheets.map(sheet => ({
		content: materializeModelContentSnapshot(sheet.content),
		diagnostics: sheet.diagnostics,
		sheetId: sheet.sheetId === DEFAULT_PHYSICAL_TABLE_SHEET_ID && !sheet.sheetName
			? resource.toString()
			: sheet.sheetId,
		sheetName: sheet.sheetName,
	}));

const getModelDefaultSheetId = (
	sheets: readonly ParsedTableSheet[],
	resource: URI,
): string | null => {
	const sheet = sheets.find(candidate => candidate.content) ?? sheets[0];
	if (!sheet) {
		return null;
	}
	return sheet.sheetId === DEFAULT_PHYSICAL_TABLE_SHEET_ID && !sheet.sheetName
		? resource.toString()
		: sheet.sheetId;
};

const summarizeParsedTableStructure = (
	parsedContent: ParsedTableStructure,
): Record<string, unknown> => ({
	columnCount: parsedContent.content?.columnCount ?? 0,
	diagnosticsCount: parsedContent.diagnostics.length +
		parsedContent.sheets.reduce((count, sheet) => count + sheet.diagnostics.length, 0),
	hasContent: Boolean(parsedContent.content),
	rowCount: parsedContent.content?.rowCount ?? 0,
	sheetCount: parsedContent.sheets.length,
	windowCount: parsedContent.content?.rowWindows?.length ?? 0,
});

const normalizeResourceSourceVersion = (value: unknown): number =>
	Math.max(0, Math.floor(Number(value) || 0));

export const getErrorMessage = (error: unknown): string =>
	error instanceof Error && error.message.trim()
		? error.message
		: "The file could not be read.";

const hasFileProviderCapability = (
	fileService: IFileService,
	resource: URI,
	capability: FileSystemProviderCapabilities,
): boolean => {
	try {
		return Boolean(fileService.getProviderCapabilities(resource) & capability);
	} catch {
		return false;
	}
};
