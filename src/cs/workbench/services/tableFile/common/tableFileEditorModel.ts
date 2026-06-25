/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, type Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import type {
	IFileService,
	IFileStat,
	IReadFileEncoding,
} from "src/cs/platform/files/common/files";
import {
	TableModel,
	type TableModelContentSnapshot,
	type TableModelPreviewInput,
	type TableModelResolvedContent,
} from "src/cs/workbench/services/table/common/model";
import {
	parseTableStructure,
	type ParsedTableStructure,
} from "src/cs/workbench/services/table/common/parsers";
import {
	decodeTableFileContent,
	getTableFileMimeType,
	getTableFileReadEncoding,
	isFileContent,
} from "src/cs/workbench/services/tablefile/common/encoding";

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

export type TableFileEditorModelResolveOptions = {
	readonly readEncoding?: IReadFileEncoding;
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
		sourceKey: string,
		private readonly fileService: IFileService,
	) {
		super();
		this.model = this._register(new TableModel(resource, sourceKey));
		this._register(this.fileService.watch(resource, { recursive: false }));
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
		try {
			await this.resolveFromDisk(options);
			this.setLifecycleState({
				conflict: false,
				errorMessage: "",
				orphaned: false,
			});
		} catch (error) {
			this.setLifecycleState({
				errorMessage: getErrorMessage(error),
				orphaned: true,
			});
			throw error;
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
		const stat = await this.fileService.stat(this.resource);

		this.lastResolvedStat = stat;
		this.sourceVersion = normalizeResourceSourceVersion(stat.mtime);
		await this.model.resolve({
			checkResourceFormat: true,
			createErrorPreviewInput: message =>
				createFailedResourcePreviewInput({
					message,
					resource: this.resource,
				}),
			resolveContent: () =>
				this.resolveContentFromDisk(stat, options),
			sourceVersion: stat.mtime,
		});
		this.onDidChangeStateEmitter.fire(this);
	}

	private async resolveContentFromDisk(
		stat: IFileStat,
		options: TableFileEditorModelResolveOptions,
	): Promise<TableModelResolvedContent> {
		const fileName = getResourceFileName(this.resource);
		const resourceFile = await this.readResourceAsBrowserFile(fileName, stat, options);
		const parsedContent = await parseTableStructure({
			bytes: resourceFile.bytes,
			resource: this.resource,
			sourceKey: this.model.sourceKey,
			text: resourceFile.text,
		});
		return createResolvedContent({
			file: resourceFile.file,
			fileName,
			parsedContent,
			resource: this.resource,
			sourceKey: this.model.sourceKey,
			stat,
		});
	}

	private async readResourceAsBrowserFile(
		fileName: string,
		stat: IFileStat,
		options: TableFileEditorModelResolveOptions,
	): Promise<{ readonly bytes: ArrayBuffer; readonly file: File; readonly text: string | null }> {
		const content = await this.fileService.readFile(this.resource, {
			encoding: options.readEncoding ?? getTableFileReadEncoding(this.resource),
		});
		if (!isFileContent(content)) {
			throw new Error("The file content could not be read.");
		}

		const decodedContent = decodeTableFileContent(content);
		return {
			bytes: decodedContent.bytes,
			file: new File([decodedContent.filePart], fileName, {
				lastModified: normalizeResourceSourceVersion(stat.mtime) || Date.now(),
				type: getTableFileMimeType(fileName),
			}),
			text: decodedContent.text,
		};
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
	file,
	fileName,
	parsedContent,
	resource,
	sourceKey,
	stat,
}: {
	readonly file: File;
	readonly fileName: string;
	readonly parsedContent: ParsedTableStructure;
	readonly resource: URI;
	readonly sourceKey: string;
	readonly stat: IFileStat;
}): TableModelResolvedContent => {
	const previewInputsBySourceKey: [string, TableModelPreviewInput][] = [];
	let previewInput: TableModelPreviewInput | null = null;
	for (const sheet of parsedContent.sheets) {
		const hasDistinctSheetIdentity = sheet.sourceKey !== sourceKey || sheet.sheetName !== null;
		const sheetPreviewInput = createResourcePreviewInput({
			content: sheet.content,
			file,
			fileName,
			resource,
			...(hasDistinctSheetIdentity ? {
				sheetId: sheet.sheetId,
				sheetName: sheet.sheetName,
			} : {}),
			stat,
		});
		previewInputsBySourceKey.push([sheet.sourceKey, sheetPreviewInput]);
		previewInput ??= sheetPreviewInput;
	}

	if (!previewInput) {
		previewInput = createResourcePreviewInput({
			content: parsedContent.content,
			file,
			fileName,
			resource,
			stat,
		});
		previewInputsBySourceKey.push([sourceKey, previewInput]);
	}

	return {
		content: parsedContent.content,
		previewInput,
		previewInputsBySourceKey,
		sheets: parsedContent.sheets,
	};
};

const createResourcePreviewInput = ({
	content,
	file,
	fileName,
	resource,
	sheetId,
	sheetName,
	stat,
}: {
	readonly content: TableModelContentSnapshot | null;
	readonly file: File;
	readonly fileName: string;
	readonly resource: URI;
	readonly sheetId?: string | null;
	readonly sheetName?: string | null;
	readonly stat: IFileStat;
}): TableModelPreviewInput => ({
	file,
	fileName,
	resource,
	relativePath: fileName,
	...(sheetId ? { sheetId } : {}),
	...(sheetName ? { sheetName } : {}),
	...(content ? {
		columnCount: content.columnCount,
		maxCellLengths: content.maxCellLengths,
		rowCount: content.rowCount,
		tableModelContent: content,
	} : {}),
	sourcePath: getResourcePath(resource),
	sourceVersion: normalizeResourceSourceVersion(stat.mtime),
});

const createFailedResourcePreviewInput = ({
	message,
	resource,
}: {
	readonly message: string;
	readonly resource: URI;
}): TableModelPreviewInput => {
	const fileName = getResourceFileName(resource);
	return {
		file: new File([], fileName, {
			lastModified: Date.now(),
			type: getTableFileMimeType(fileName),
		}),
		fileName,
		resource,
		rawTableHealth: "decodeFailed",
		rawTableHealthMessage: message,
		relativePath: fileName,
		sourcePath: getResourcePath(resource),
		sourceVersion: 0,
	};
};

const getResourceFileName = (resource: URI): string => {
	const path = String(resource.path ?? "").replace(/\\/g, "/");
	const index = path.lastIndexOf("/");
	const name = index >= 0 ? path.slice(index + 1) : path;
	return name || "table.csv";
};

const getResourcePath = (resource: URI): string | null => {
	const fsPath = typeof resource.fsPath === "string" ? resource.fsPath.trim() : "";
	if (fsPath) {
		return fsPath;
	}

	const path = String(resource.path ?? "").trim();
	return path || null;
};

const normalizeResourceSourceVersion = (value: unknown): number =>
	Math.max(0, Math.floor(Number(value) || 0));

export const getErrorMessage = (error: unknown): string =>
	error instanceof Error && error.message.trim()
		? error.message
		: "The file could not be read.";
