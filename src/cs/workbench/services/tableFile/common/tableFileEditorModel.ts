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
	type TableModelResolvedContent,
} from "src/cs/workbench/services/table/common/model";
import {
	toTableSheetKey,
} from "src/cs/workbench/services/table/common/table";
import {
	parseTableStructure,
	type ParsedTableStructure,
} from "src/cs/workbench/services/table/common/tableStructureParser";
import {
	readTableFile,
	type TableFileReadResult,
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
		private readonly fileService: IFileService,
	) {
		super();
		this.model = this._register(new TableModel(resource));
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
		await this.model.resolve({
			checkResourceFormat: true,
			resolveContent: () =>
				this.resolveContentFromDisk(options),
		});
		this.onDidChangeStateEmitter.fire(this);
	}

	private async resolveContentFromDisk(
		options: TableFileEditorModelResolveOptions,
	): Promise<TableModelResolvedContent> {
		const readResult = await readTableFile(this.resource, this.fileService, options);
		this.lastResolvedStat = readResult.stat;
		this.sourceVersion = normalizeResourceSourceVersion(readResult.stat.mtime);
		const parsedContent = await parseTableStructure({
			buffer: readResult.buffer,
			defaultSheetKey: this.defaultSheetKey,
			format: readResult.format,
			resource: this.resource,
		});
		return createResolvedContent({
			parsedContent,
			readResult,
		});
	}

	private get defaultSheetKey(): string {
		return toTableSheetKey({ resource: this.resource });
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
}: {
	readonly parsedContent: ParsedTableStructure;
	readonly readResult: TableFileReadResult;
}): TableModelResolvedContent => ({
	content: parsedContent.content,
	format: readResult.format,
	sheets: parsedContent.sheets,
	sourceVersion: readResult.stat.mtime,
});

const normalizeResourceSourceVersion = (value: unknown): number =>
	Math.max(0, Math.floor(Number(value) || 0));

export const getErrorMessage = (error: unknown): string =>
	error instanceof Error && error.message.trim()
		? error.message
		: "The file could not be read.";
