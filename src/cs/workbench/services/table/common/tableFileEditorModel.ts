/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import Papa from "papaparse";

import { Emitter, type Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import type { IFileService, IFileStat } from "src/cs/platform/files/common/files";
import {
	type TableSource,
	toTableSourceKey,
} from "src/cs/workbench/services/table/common/table";
import {
	type ITableModel,
	type TableModelContentSnapshot,
	type TableModelLoadState,
	type TableModelPreviewInput,
	type TableModelSheetSnapshot,
	type TableModelSnapshot,
} from "src/cs/workbench/services/table/common/tableModel";
import {
	tableFileFormatService,
	type TableFileFormat,
} from "src/cs/workbench/services/table/common/tableFileFormat";

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

export type TableModelPreviewInputBySourceKey =
	readonly [sourceKey: string, previewInput: TableModelPreviewInput];

export type TableModelResolvedContent = {
	readonly content: TableModelContentSnapshot | null;
	readonly previewInput: TableModelPreviewInput;
	readonly previewInputsBySourceKey?: readonly TableModelPreviewInputBySourceKey[];
	readonly sheets?: readonly TableModelSheetSnapshot[];
};

export interface ITableFileEditorModelContentResolver {
	createErrorPreviewInput(resource: URI, message: string): TableModelPreviewInput;
	resolve(
		resource: URI,
		sourceKey: string,
		stat: IFileStat,
	): Promise<TableModelResolvedContent>;
}

type TableModelResolveOptions = {
	readonly createErrorPreviewInput: (message: string) => TableModelPreviewInput;
	readonly resolveContent: () => Promise<TableModelResolvedContent>;
	readonly sourceVersion: unknown;
};

export class TableModel extends Disposable implements ITableModel {
	private readonly onDidChangeEmitter = this._register(new Emitter<ITableModel>());
	public readonly onDidChange = this.onDidChangeEmitter.event;

	private content: TableModelContentSnapshot | null = null;
	private format: TableFileFormat | null;
	private loadState: TableModelLoadState = { state: "idle", message: "" };
	private previewInput: TableModelPreviewInput | null = null;
	private readonly previewInputsBySourceKey = new Map<string, TableModelPreviewInput>();
	private sheets: readonly TableModelSheetSnapshot[] = [];
	private sourceVersion = 0;
	private version = 0;
	private resolveRequestId = 0;

	public constructor(
		public readonly resource: URI,
		public readonly sourceKey: string,
	) {
		super();
		this.format = tableFileFormatService.getFormat(resource);
	}

	public getSnapshot(): TableModelSnapshot {
		return {
			content: this.content,
			format: this.format,
			loadState: this.loadState,
			resource: this.resource,
			previewInput: this.previewInput,
			sheets: this.sheets,
			sourceKey: this.sourceKey,
			sourceVersion: this.sourceVersion,
			version: this.version,
		};
	}

	public getPreviewInput(source?: TableSource | null): TableModelPreviewInput | null {
		const sourceKey = toTableSourceKey(source ?? { resource: this.resource });
		return this.previewInputsBySourceKey.get(sourceKey) ?? this.previewInput;
	}

	public async resolve({
		createErrorPreviewInput,
		resolveContent,
		sourceVersion,
	}: TableModelResolveOptions): Promise<void> {
		if (!tableFileFormatService.canHandle(this.resource)) {
			this.setError(
				`Unsupported table file: ${this.resource.toString()}`,
				createErrorPreviewInput,
			);
			return;
		}

		const requestId = ++this.resolveRequestId;
		this.format = tableFileFormatService.getFormat(this.resource);
		this.loadState = { state: "loading", message: "" };
		this.onDidChangeEmitter.fire(this);

		let resolvedContent: TableModelResolvedContent;
		try {
			resolvedContent = await resolveContent();
			this.loadState = { state: "ready", message: "" };
		} catch (error) {
			const message = getErrorMessage(error);
			resolvedContent = {
				content: null,
				previewInput: createErrorPreviewInput(message),
				previewInputsBySourceKey: [],
				sheets: [],
			};
			this.loadState = { state: "error", message };
		}

		if (requestId !== this.resolveRequestId) {
			return;
		}

		this.applyResolvedContent(resolvedContent, sourceVersion);
	}

	private applyResolvedContent(
		resolvedContent: TableModelResolvedContent,
		sourceVersion: unknown,
	): void {
		this.previewInput = resolvedContent.previewInput;
		this.content = resolvedContent.content;
		this.sheets = resolvedContent.sheets ?? (resolvedContent.content ? [{
			content: resolvedContent.content,
			sheetId: this.sourceKey,
			sheetName: null,
			sourceKey: this.sourceKey,
		}] : []);
		this.previewInputsBySourceKey.clear();
		for (const [sourceKey, previewInput] of resolvedContent.previewInputsBySourceKey ?? [[
			this.sourceKey,
			resolvedContent.previewInput,
		]]) {
			this.previewInputsBySourceKey.set(sourceKey, previewInput);
		}
		this.sourceVersion = normalizeResourceSourceVersion(sourceVersion);
		this.version += 1;
		this.onDidChangeEmitter.fire(this);
	}

	private setError(
		message: string,
		createErrorPreviewInput: (message: string) => TableModelPreviewInput,
	): void {
		this.loadState = { state: "error", message };
		this.previewInput = createErrorPreviewInput(message);
		this.content = null;
		this.sheets = [];
		this.sourceVersion = 0;
		this.previewInputsBySourceKey.clear();
		this.version += 1;
		this.onDidChangeEmitter.fire(this);
	}
}

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
		private readonly contentResolver: ITableFileEditorModelContentResolver,
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

	public async resolve(): Promise<void> {
		try {
			await this.resolveFromDisk();
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

	public async reload(): Promise<void> {
		await this.resolve();
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

	private async resolveFromDisk(): Promise<void> {
		const stat = await this.fileService.stat(this.resource);

		this.lastResolvedStat = stat;
		this.sourceVersion = normalizeResourceSourceVersion(stat.mtime);
		await this.model.resolve({
			createErrorPreviewInput: message =>
				this.contentResolver.createErrorPreviewInput(this.resource, message),
			resolveContent: () =>
				this.contentResolver.resolve(this.resource, this.model.sourceKey, stat),
			sourceVersion: stat.mtime,
		});
		this.onDidChangeStateEmitter.fire(this);
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

export const createTableModelContentSnapshot = (
	text: string | null,
	format: TableFileFormat | null,
): TableModelContentSnapshot | null => {
	if (text === null || (format !== "csv" && format !== "tsv")) {
		return null;
	}

	const parsed = Papa.parse<unknown[]>(text, {
		delimiter: format === "tsv" ? "\t" : ",",
		skipEmptyLines: false,
	});
	const rows = parsed.data.map(row => row.map(cell => cell == null ? "" : String(cell)));
	const columnCount = rows.reduce(
		(count, row) => Math.max(count, row.length),
		0,
	);
	const maxCellLengths = Array.from({ length: columnCount }, (_, columnIndex) =>
		rows.reduce(
			(length, row) => Math.max(length, String(row[columnIndex] ?? "").length),
			0,
		)
	);
	return {
		columnCount,
		maxCellLengths,
		rowCount: rows.length,
		rows,
	};
};

export const createEmptyTableModelContentSnapshot = (
	rowCount: unknown,
	columnCount: unknown,
	maxCellLengths: readonly number[] | undefined,
): TableModelContentSnapshot | null => {
	const normalizedRowCount = normalizeNonNegativeInteger(rowCount);
	const normalizedColumnCount = normalizeNonNegativeInteger(columnCount);
	if (normalizedRowCount === null || normalizedColumnCount === null) {
		return null;
	}

	return {
		columnCount: normalizedColumnCount,
		maxCellLengths: normalizeMaxCellLengths(maxCellLengths, normalizedColumnCount),
		rowCount: normalizedRowCount,
		rows: [],
	};
};

export const getResourceFileName = (resource: URI): string => {
	const path = String(resource.path ?? "").replace(/\\/g, "/");
	const index = path.lastIndexOf("/");
	const name = index >= 0 ? path.slice(index + 1) : path;
	return name || "table.csv";
};

export const getResourcePath = (resource: URI): string | null => {
	const fsPath = typeof resource.fsPath === "string" ? resource.fsPath.trim() : "";
	if (fsPath) {
		return fsPath;
	}

	const path = String(resource.path ?? "").trim();
	return path || null;
};

export const normalizeResourceSourceVersion = (value: unknown): number =>
	Math.max(0, Math.floor(Number(value) || 0));

export const getErrorMessage = (error: unknown): string =>
	error instanceof Error && error.message.trim()
		? error.message
		: "The file could not be read.";

const normalizeNonNegativeInteger = (value: unknown): number | null => {
	const number = Number(value);
	return Number.isInteger(number) && number >= 0 ? number : null;
};

const normalizeMaxCellLengths = (
	values: readonly number[] | undefined,
	columnCount: number,
): readonly number[] =>
	Array.from({ length: columnCount }, (_, index) => {
		const value = Number(values?.[index]);
		return Number.isFinite(value) && value >= 0 ? value : 0;
	});
