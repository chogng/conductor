/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, type Event } from "src/cs/base/common/event";
import { Disposable, type IDisposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import {
	toTableSheetKey,
} from "src/cs/workbench/services/table/common/table";
import {
	tableFormatService,
	type TableFormatId,
} from "src/cs/workbench/services/table/common/tableFormatService";

export interface ITableModelPosition {
	readonly columnIndex: number;
	readonly rowIndex: number;
}

export class TableModelPosition implements ITableModelPosition {
	public readonly columnIndex: number;
	public readonly rowIndex: number;

	public constructor(rowIndex: number, columnIndex: number) {
		this.rowIndex = normalizeNonNegativeInteger(rowIndex);
		this.columnIndex = normalizeNonNegativeInteger(columnIndex);
	}

	public equals(other: ITableModelPosition): boolean {
		return TableModelPosition.equals(this, other);
	}

	public static equals(
		first: ITableModelPosition,
		second: ITableModelPosition,
	): boolean {
		return first.rowIndex === second.rowIndex &&
			first.columnIndex === second.columnIndex;
	}
}

/**
 * A zero-based, half-open rectangular range in table model coordinates.
 */
export interface ITableModelRange {
	readonly endColumnIndexExclusive: number;
	readonly endRowIndexExclusive: number;
	readonly startColumnIndex: number;
	readonly startRowIndex: number;
}

export class TableModelRange implements ITableModelRange {
	public readonly endColumnIndexExclusive: number;
	public readonly endRowIndexExclusive: number;
	public readonly startColumnIndex: number;
	public readonly startRowIndex: number;

	public constructor(
		startRowIndex: number,
		startColumnIndex: number,
		endRowIndexExclusive: number,
		endColumnIndexExclusive: number,
	) {
		const normalizedStartRowIndex = normalizeNonNegativeInteger(startRowIndex);
		const normalizedStartColumnIndex = normalizeNonNegativeInteger(startColumnIndex);
		const normalizedEndRowIndexExclusive = normalizeNonNegativeInteger(endRowIndexExclusive);
		const normalizedEndColumnIndexExclusive = normalizeNonNegativeInteger(endColumnIndexExclusive);

		this.startRowIndex = Math.min(normalizedStartRowIndex, normalizedEndRowIndexExclusive);
		this.startColumnIndex = Math.min(normalizedStartColumnIndex, normalizedEndColumnIndexExclusive);
		this.endRowIndexExclusive = Math.max(normalizedStartRowIndex, normalizedEndRowIndexExclusive);
		this.endColumnIndexExclusive = Math.max(
			normalizedStartColumnIndex,
			normalizedEndColumnIndexExclusive,
		);
	}

	public isEmpty(): boolean {
		return TableModelRange.isEmpty(this);
	}

	public containsPosition(position: ITableModelPosition): boolean {
		return TableModelRange.containsPosition(this, position);
	}

	public containsRange(range: ITableModelRange): boolean {
		return TableModelRange.containsRange(this, range);
	}

	public intersectsRange(range: ITableModelRange): boolean {
		return TableModelRange.intersectsRange(this, range);
	}

	public intersectRange(range: ITableModelRange): TableModelRange | null {
		return TableModelRange.intersectRanges(this, range);
	}

	public plusRange(range: ITableModelRange): TableModelRange {
		return TableModelRange.plusRange(this, range);
	}

	public static fromPositions(
		start: ITableModelPosition,
		end: ITableModelPosition = start,
	): TableModelRange {
		return new TableModelRange(
			start.rowIndex,
			start.columnIndex,
			end.rowIndex + 1,
			end.columnIndex + 1,
		);
	}

	public static isEmpty(range: ITableModelRange): boolean {
		return range.startRowIndex === range.endRowIndexExclusive ||
			range.startColumnIndex === range.endColumnIndexExclusive;
	}

	public static containsPosition(
		range: ITableModelRange,
		position: ITableModelPosition,
	): boolean {
		return position.rowIndex >= range.startRowIndex &&
			position.rowIndex < range.endRowIndexExclusive &&
			position.columnIndex >= range.startColumnIndex &&
			position.columnIndex < range.endColumnIndexExclusive;
	}

	public static containsRange(
		range: ITableModelRange,
		otherRange: ITableModelRange,
	): boolean {
		return otherRange.startRowIndex >= range.startRowIndex &&
			otherRange.endRowIndexExclusive <= range.endRowIndexExclusive &&
			otherRange.startColumnIndex >= range.startColumnIndex &&
			otherRange.endColumnIndexExclusive <= range.endColumnIndexExclusive;
	}

	public static intersectsRange(
		range: ITableModelRange,
		otherRange: ITableModelRange,
	): boolean {
		return range.startRowIndex < otherRange.endRowIndexExclusive &&
			range.endRowIndexExclusive > otherRange.startRowIndex &&
			range.startColumnIndex < otherRange.endColumnIndexExclusive &&
			range.endColumnIndexExclusive > otherRange.startColumnIndex;
	}

	public static intersectRanges(
		range: ITableModelRange,
		otherRange: ITableModelRange,
	): TableModelRange | null {
		if (!TableModelRange.intersectsRange(range, otherRange)) {
			return null;
		}

		return new TableModelRange(
			Math.max(range.startRowIndex, otherRange.startRowIndex),
			Math.max(range.startColumnIndex, otherRange.startColumnIndex),
			Math.min(range.endRowIndexExclusive, otherRange.endRowIndexExclusive),
			Math.min(range.endColumnIndexExclusive, otherRange.endColumnIndexExclusive),
		);
	}

	public static plusRange(
		range: ITableModelRange,
		otherRange: ITableModelRange,
	): TableModelRange {
		return new TableModelRange(
			Math.min(range.startRowIndex, otherRange.startRowIndex),
			Math.min(range.startColumnIndex, otherRange.startColumnIndex),
			Math.max(range.endRowIndexExclusive, otherRange.endRowIndexExclusive),
			Math.max(range.endColumnIndexExclusive, otherRange.endColumnIndexExclusive),
		);
	}

	public static equals(
		first: ITableModelRange,
		second: ITableModelRange,
	): boolean {
		return first.startRowIndex === second.startRowIndex &&
			first.startColumnIndex === second.startColumnIndex &&
			first.endRowIndexExclusive === second.endRowIndexExclusive &&
			first.endColumnIndexExclusive === second.endColumnIndexExclusive;
	}
}

export const enum TableModelSelectionDirection {
	TopLeftToBottomRight = 0,
	BottomRightToTopLeft = 1,
}

/**
 * A table model selection value. The model can validate this shape, but the
 * active selection owner remains the table widget/service.
 */
export interface ITableModelSelection {
	readonly positionColumnIndex: number;
	readonly positionRowIndex: number;
	readonly selectionStartColumnIndex: number;
	readonly selectionStartRowIndex: number;
}

export class TableModelSelection extends TableModelRange implements ITableModelSelection {
	public readonly positionColumnIndex: number;
	public readonly positionRowIndex: number;
	public readonly selectionStartColumnIndex: number;
	public readonly selectionStartRowIndex: number;

	public constructor(
		selectionStartRowIndex: number,
		selectionStartColumnIndex: number,
		positionRowIndex: number,
		positionColumnIndex: number,
	) {
		super(
			Math.min(selectionStartRowIndex, positionRowIndex),
			Math.min(selectionStartColumnIndex, positionColumnIndex),
			Math.max(selectionStartRowIndex, positionRowIndex) + 1,
			Math.max(selectionStartColumnIndex, positionColumnIndex) + 1,
		);
		this.selectionStartRowIndex = normalizeNonNegativeInteger(selectionStartRowIndex);
		this.selectionStartColumnIndex = normalizeNonNegativeInteger(selectionStartColumnIndex);
		this.positionRowIndex = normalizeNonNegativeInteger(positionRowIndex);
		this.positionColumnIndex = normalizeNonNegativeInteger(positionColumnIndex);
	}

	public getDirection(): TableModelSelectionDirection {
		if (
			this.selectionStartRowIndex === this.startRowIndex &&
			this.selectionStartColumnIndex === this.startColumnIndex
		) {
			return TableModelSelectionDirection.TopLeftToBottomRight;
		}

		return TableModelSelectionDirection.BottomRightToTopLeft;
	}

	public getPosition(): TableModelPosition {
		return new TableModelPosition(this.positionRowIndex, this.positionColumnIndex);
	}

	public getSelectionStart(): TableModelPosition {
		return new TableModelPosition(
			this.selectionStartRowIndex,
			this.selectionStartColumnIndex,
		);
	}

	public static fromPositions(
		start: ITableModelPosition,
		end: ITableModelPosition = start,
	): TableModelSelection {
		return new TableModelSelection(
			start.rowIndex,
			start.columnIndex,
			end.rowIndex,
			end.columnIndex,
		);
	}

	public static selectionsEqual(
		first: ITableModelSelection,
		second: ITableModelSelection,
	): boolean {
		return first.selectionStartRowIndex === second.selectionStartRowIndex &&
			first.selectionStartColumnIndex === second.selectionStartColumnIndex &&
			first.positionRowIndex === second.positionRowIndex &&
			first.positionColumnIndex === second.positionColumnIndex;
	}
}

export type TableModelLoadState = {
	readonly state: "idle" | "loading" | "ready" | "error";
	readonly message: string;
};

export type TableModelContentSnapshot = {
	readonly columnCount: number;
	readonly maxCellLengths: readonly number[];
	readonly rowCount: number;
	readonly rows: readonly (readonly string[])[];
};

export type TableModelSheetSnapshot = {
	readonly content: TableModelContentSnapshot | null;
	readonly sheetId: string;
	readonly sheetKey: string;
	readonly sheetName: string | null;
};

export type TableModelSnapshot = {
	readonly content: TableModelContentSnapshot | null;
	readonly defaultSheetId: string | null;
	readonly format: TableFormatId | null;
	readonly loadState: TableModelLoadState;
	readonly resource: URI;
	readonly sheets: readonly TableModelSheetSnapshot[];
	readonly sourceVersion: number;
	readonly version: number;
};

export const enum TableModelTrackedRangeStickiness {
	AlwaysGrowsWhenEditingAtEdges = 0,
	NeverGrowsWhenEditingAtEdges = 1,
	GrowsOnlyWhenEditingBefore = 2,
	GrowsOnlyWhenEditingAfter = 3,
}

export interface ITableModelDecorationOptions {
	readonly description: string;
	readonly className?: string | null;
	readonly columnHeaderClassName?: string | null;
	readonly hoverMessage?: string | null;
	readonly isWholeColumn?: boolean;
	readonly isWholeRow?: boolean;
	readonly rowHeaderClassName?: string | null;
	readonly stickiness?: TableModelTrackedRangeStickiness;
	readonly zIndex?: number;
}

export interface ITableModelDeltaDecoration {
	readonly options: ITableModelDecorationOptions;
	readonly range: ITableModelRange;
}

export interface ITableModelDecoration {
	readonly id: string;
	readonly options: ITableModelDecorationOptions;
	readonly ownerId: number;
	readonly range: TableModelRange;
}

export interface ITableModelDecorationsChangeAccessor {
	addDecoration(range: ITableModelRange, options: ITableModelDecorationOptions): string;
	changeDecoration(id: string, newRange: ITableModelRange): void;
	changeDecorationOptions(id: string, newOptions: ITableModelDecorationOptions): void;
	deltaDecorations(
		oldDecorations: readonly string[],
		newDecorations: readonly ITableModelDeltaDecoration[],
	): string[];
	removeDecoration(id: string): void;
}

export type TableModelContentChangedEvent = {
	readonly content: TableModelContentSnapshot | null;
	readonly sourceVersion: number;
	readonly version: number;
};

export type TableModelDecorationsChangedEvent = {
	readonly addedOrChangedDecorations: readonly string[];
	readonly removedDecorations: readonly string[];
};

export interface ITableModelViewModel {
	readonly id: string;
	onDidChangeModelContent?(event: TableModelContentChangedEvent): void;
	onDidChangeModelDecorations?(event: TableModelDecorationsChangedEvent): void;
	onDidChangeModelState?(model: ITableModel): void;
}

export interface ITableModel extends IDisposable {
	readonly onDidChange: Event<ITableModel>;
	readonly onDidChangeContent: Event<TableModelContentChangedEvent>;
	readonly onDidChangeDecorations: Event<TableModelDecorationsChangedEvent>;
	readonly resource: URI;
	changeDecorations<T>(
		callback: (changeAccessor: ITableModelDecorationsChangeAccessor) => T,
		ownerId?: number,
	): T | null;
	deltaDecorations(
		oldDecorations: readonly string[],
		newDecorations: readonly ITableModelDeltaDecoration[],
		ownerId?: number,
	): string[];
	getAllDecorations(ownerId?: number): readonly ITableModelDecoration[];
	getCellValue(rowIndex: number, columnIndex: number): string | null;
	getColumnCount(): number;
	getDecorationOptions(id: string): ITableModelDecorationOptions | null;
	getDecorationRange(id: string): TableModelRange | null;
	getDecorationsInRange(
		range: ITableModelRange,
		ownerId?: number,
	): readonly ITableModelDecoration[];
	getFullModelRange(): TableModelRange;
	getRowCount(): number;
	getRows(startRowIndex?: number, endRowIndexExclusive?: number): readonly (readonly string[])[];
	getSnapshot(): TableModelSnapshot;
	getSourceVersionId(): number;
	getValueInRange(range: ITableModelRange): readonly (readonly string[])[];
	getVersionId(): number;
	isDisposed(): boolean;
	isValidRange(range: ITableModelRange): boolean;
	registerViewModel(viewModel: ITableModelViewModel): void;
	removeAllDecorationsWithOwnerId(ownerId: number): void;
	unregisterViewModel(viewModel: ITableModelViewModel): void;
	validatePosition(position: ITableModelPosition): TableModelPosition;
	validateRange(range: ITableModelRange): TableModelRange;
	validateSelection(selection: ITableModelSelection): TableModelSelection;
}

export type TableModelResolvedContent = {
	readonly content: TableModelContentSnapshot | null;
	readonly format?: TableFormatId | null;
	readonly sheets?: readonly TableModelSheetSnapshot[];
	readonly sourceVersion?: unknown;
};

export type TableModelResolveOptions = {
	readonly checkResourceFormat?: boolean;
	readonly resolveContent: () => Promise<TableModelResolvedContent>;
	readonly sourceVersion?: unknown;
};

type MutableTableModelDecoration = {
	readonly id: string;
	options: ITableModelDecorationOptions;
	readonly ownerId: number;
	range: TableModelRange;
};

type MutableDecorationsChange = {
	readonly addedOrChangedDecorations: string[];
	readonly removedDecorations: string[];
};

export class TableModel extends Disposable implements ITableModel {
	private readonly onDidChangeEmitter = this._register(new Emitter<ITableModel>());
	public readonly onDidChange: Event<ITableModel> = this.onDidChangeEmitter.event;

	private readonly onDidChangeContentEmitter =
		this._register(new Emitter<TableModelContentChangedEvent>());
	public readonly onDidChangeContent: Event<TableModelContentChangedEvent> =
		this.onDidChangeContentEmitter.event;

	private readonly onDidChangeDecorationsEmitter =
		this._register(new Emitter<TableModelDecorationsChangedEvent>());
	public readonly onDidChangeDecorations: Event<TableModelDecorationsChangedEvent> =
		this.onDidChangeDecorationsEmitter.event;

	private content: TableModelContentSnapshot | null = null;
	private decorationIdPool = 0;
	private readonly decorations = new Map<string, MutableTableModelDecoration>();
	private disposed = false;
	private format: TableFormatId | null;
	private loadState: TableModelLoadState = { state: "idle", message: "" };
	private resolveRequestId = 0;
	private sheets: readonly TableModelSheetSnapshot[] = [];
	private sourceVersion = 0;
	private version = 0;
	private readonly viewModels = new Set<ITableModelViewModel>();

	public constructor(
		public readonly resource: URI,
	) {
		super();
		this.format = tableFormatService.getFormat(resource);
	}

	public override dispose(): void {
		if (this.disposed) {
			return;
		}

		this.disposed = true;
		this.viewModels.clear();
		this.decorations.clear();
		super.dispose();
	}

	public isDisposed(): boolean {
		return this.disposed;
	}

	public registerViewModel(viewModel: ITableModelViewModel): void {
		this.viewModels.add(viewModel);
	}

	public unregisterViewModel(viewModel: ITableModelViewModel): void {
		this.viewModels.delete(viewModel);
	}

	public getSnapshot(): TableModelSnapshot {
		return {
			content: this.content,
			defaultSheetId: this.sheets[0]?.sheetId ?? null,
			format: this.format,
			loadState: this.loadState,
			resource: this.resource,
			sheets: this.sheets,
			sourceVersion: this.sourceVersion,
			version: this.version,
		};
	}

	public getVersionId(): number {
		return this.version;
	}

	public getSourceVersionId(): number {
		return this.sourceVersion;
	}

	public getRowCount(): number {
		return this.content?.rowCount ?? 0;
	}

	public getColumnCount(): number {
		return this.content?.columnCount ?? 0;
	}

	public getCellValue(rowIndex: number, columnIndex: number): string | null {
		const safeRowIndex = normalizeNonNegativeInteger(rowIndex);
		const safeColumnIndex = normalizeNonNegativeInteger(columnIndex);
		if (
			safeRowIndex >= this.getRowCount() ||
			safeColumnIndex >= this.getColumnCount()
		) {
			return null;
		}

		return this.content?.rows[safeRowIndex]?.[safeColumnIndex] ?? "";
	}

	public getRows(
		startRowIndex = 0,
		endRowIndexExclusive = this.getRowCount(),
	): readonly (readonly string[])[] {
		const start = clampInteger(startRowIndex, 0, this.getRowCount());
		const end = clampInteger(endRowIndexExclusive, start, this.getRowCount());
		return this.content?.rows.slice(start, end) ?? [];
	}

	public getValueInRange(range: ITableModelRange): readonly (readonly string[])[] {
		const validatedRange = this.validateRange(range);
		const rows: string[][] = [];
		for (
			let rowIndex = validatedRange.startRowIndex;
			rowIndex < validatedRange.endRowIndexExclusive;
			rowIndex += 1
		) {
			const row: string[] = [];
			for (
				let columnIndex = validatedRange.startColumnIndex;
				columnIndex < validatedRange.endColumnIndexExclusive;
				columnIndex += 1
			) {
				row.push(this.getCellValue(rowIndex, columnIndex) ?? "");
			}
			rows.push(row);
		}
		return rows;
	}

	public getFullModelRange(): TableModelRange {
		return new TableModelRange(0, 0, this.getRowCount(), this.getColumnCount());
	}

	public validatePosition(position: ITableModelPosition): TableModelPosition {
		return new TableModelPosition(
			clampInteger(position.rowIndex, 0, Math.max(0, this.getRowCount() - 1)),
			clampInteger(position.columnIndex, 0, Math.max(0, this.getColumnCount() - 1)),
		);
	}

	public validateRange(range: ITableModelRange): TableModelRange {
		const startRowIndex = clampInteger(range.startRowIndex, 0, this.getRowCount());
		const startColumnIndex = clampInteger(range.startColumnIndex, 0, this.getColumnCount());
		const endRowIndexExclusive = clampInteger(
			range.endRowIndexExclusive,
			startRowIndex,
			this.getRowCount(),
		);
		const endColumnIndexExclusive = clampInteger(
			range.endColumnIndexExclusive,
			startColumnIndex,
			this.getColumnCount(),
		);
		return new TableModelRange(
			startRowIndex,
			startColumnIndex,
			endRowIndexExclusive,
			endColumnIndexExclusive,
		);
	}

	public validateSelection(selection: ITableModelSelection): TableModelSelection {
		const selectionStart = this.validatePosition({
			rowIndex: selection.selectionStartRowIndex,
			columnIndex: selection.selectionStartColumnIndex,
		});
		const position = this.validatePosition({
			rowIndex: selection.positionRowIndex,
			columnIndex: selection.positionColumnIndex,
		});
		return new TableModelSelection(
			selectionStart.rowIndex,
			selectionStart.columnIndex,
			position.rowIndex,
			position.columnIndex,
		);
	}

	public isValidRange(range: ITableModelRange): boolean {
		return TableModelRange.equals(range, this.validateRange(range));
	}

	public async resolve({
		checkResourceFormat,
		resolveContent,
		sourceVersion,
	}: TableModelResolveOptions): Promise<void> {
		if (checkResourceFormat && !tableFormatService.canHandle(this.resource)) {
			this.setError(`Unsupported table file: ${this.resource.toString()}`);
			return;
		}

		const requestId = ++this.resolveRequestId;
		this.format = tableFormatService.getFormat(this.resource);
		this.loadState = { state: "loading", message: "" };
		this.fireStateChanged();

		let resolvedContent: TableModelResolvedContent;
		try {
			resolvedContent = await resolveContent();
			this.loadState = { state: "ready", message: "" };
		} catch (error) {
			const message = getErrorMessage(error, "The table model could not be resolved.");
			resolvedContent = {
				content: null,
				sheets: [],
			};
			this.loadState = { state: "error", message };
		}

		if (requestId !== this.resolveRequestId) {
			return;
		}

		this.applyResolvedContent(resolvedContent, resolvedContent.sourceVersion ?? sourceVersion);
	}

	public changeDecorations<T>(
		callback: (changeAccessor: ITableModelDecorationsChangeAccessor) => T,
		ownerId = 0,
	): T | null {
		if (this.disposed) {
			return null;
		}

		const change = createDecorationsChange();
		let isChangeAccessorValid = true;
		const assertChangeAccessorValid = (): void => {
			if (!isChangeAccessorValid) {
				throw new Error("This table model decorations change accessor is no longer valid.");
			}
		};

		const changeAccessor: ITableModelDecorationsChangeAccessor = {
			addDecoration: (range, options) => {
				assertChangeAccessorValid();
				return this.addDecoration(range, options, ownerId, change);
			},
			changeDecoration: (id, newRange) => {
				assertChangeAccessorValid();
				this.changeDecorationRange(id, newRange, ownerId, change);
			},
			changeDecorationOptions: (id, newOptions) => {
				assertChangeAccessorValid();
				this.changeDecorationOptions(id, newOptions, ownerId, change);
			},
			deltaDecorations: (oldDecorations, newDecorations) => {
				assertChangeAccessorValid();
				return this.deltaDecorationsWithoutFiring(
					oldDecorations,
					newDecorations,
					ownerId,
					change,
				);
			},
			removeDecoration: id => {
				assertChangeAccessorValid();
				this.removeDecoration(id, ownerId, change);
			},
		};

		try {
			return callback(changeAccessor);
		} finally {
			isChangeAccessorValid = false;
			this.fireDecorationsChanged(change);
		}
	}

	public deltaDecorations(
		oldDecorations: readonly string[],
		newDecorations: readonly ITableModelDeltaDecoration[],
		ownerId = 0,
	): string[] {
		const change = createDecorationsChange();
		const result = this.deltaDecorationsWithoutFiring(
			oldDecorations,
			newDecorations,
			ownerId,
			change,
		);
		this.fireDecorationsChanged(change);
		return result;
	}

	public removeAllDecorationsWithOwnerId(ownerId: number): void {
		const change = createDecorationsChange();
		for (const decoration of this.decorations.values()) {
			if (decoration.ownerId === ownerId) {
				this.decorations.delete(decoration.id);
				change.removedDecorations.push(decoration.id);
			}
		}
		this.fireDecorationsChanged(change);
	}

	public getDecorationOptions(id: string): ITableModelDecorationOptions | null {
		return this.decorations.get(id)?.options ?? null;
	}

	public getDecorationRange(id: string): TableModelRange | null {
		return this.decorations.get(id)?.range ?? null;
	}

	public getDecorationsInRange(
		range: ITableModelRange,
		ownerId?: number,
	): readonly ITableModelDecoration[] {
		const filterRange = this.validateRange(range);
		return this.getDecorations(ownerId)
			.filter(decoration => decoration.range.intersectsRange(filterRange));
	}

	public getAllDecorations(ownerId?: number): readonly ITableModelDecoration[] {
		return this.getDecorations(ownerId);
	}

	private applyResolvedContent(
		resolvedContent: TableModelResolvedContent,
		sourceVersion: unknown,
	): void {
		this.content = resolvedContent.content;
		this.format = resolvedContent.format ?? this.format;
		this.sheets = resolvedContent.sheets ?? (resolvedContent.content ? [{
			content: resolvedContent.content,
			sheetId: toTableSheetKey({ resource: this.resource }),
			sheetKey: toTableSheetKey({ resource: this.resource }),
			sheetName: null,
		}] : []);
		this.sourceVersion = normalizeResourceSourceVersion(sourceVersion);
		this.version += 1;

		const event: TableModelContentChangedEvent = {
			content: this.content,
			sourceVersion: this.sourceVersion,
			version: this.version,
		};
		this.onDidChangeContentEmitter.fire(event);
		for (const viewModel of this.viewModels) {
			viewModel.onDidChangeModelContent?.(event);
		}
		this.fireStateChanged();
	}

	private setError(message: string): void {
		this.loadState = { state: "error", message };
		this.content = null;
		this.sheets = [];
		this.sourceVersion = 0;
		this.version += 1;

		const event: TableModelContentChangedEvent = {
			content: this.content,
			sourceVersion: this.sourceVersion,
			version: this.version,
		};
		this.onDidChangeContentEmitter.fire(event);
		for (const viewModel of this.viewModels) {
			viewModel.onDidChangeModelContent?.(event);
		}
		this.fireStateChanged();
	}

	private fireStateChanged(): void {
		this.onDidChangeEmitter.fire(this);
		for (const viewModel of this.viewModels) {
			viewModel.onDidChangeModelState?.(this);
		}
	}

	private addDecoration(
		range: ITableModelRange,
		options: ITableModelDecorationOptions,
		ownerId: number,
		change: MutableDecorationsChange,
	): string {
		const id = `${this.resource.toString()}#table-decoration-${++this.decorationIdPool}`;
		this.decorations.set(id, {
			id,
			options,
			ownerId,
			range: this.validateRange(range),
		});
		change.addedOrChangedDecorations.push(id);
		return id;
	}

	private changeDecorationRange(
		id: string,
		newRange: ITableModelRange,
		ownerId: number,
		change: MutableDecorationsChange,
	): void {
		const decoration = this.getOwnerDecoration(id, ownerId);
		if (!decoration) {
			return;
		}

		decoration.range = this.validateRange(newRange);
		change.addedOrChangedDecorations.push(id);
	}

	private changeDecorationOptions(
		id: string,
		newOptions: ITableModelDecorationOptions,
		ownerId: number,
		change: MutableDecorationsChange,
	): void {
		const decoration = this.getOwnerDecoration(id, ownerId);
		if (!decoration) {
			return;
		}

		decoration.options = newOptions;
		change.addedOrChangedDecorations.push(id);
	}

	private removeDecoration(
		id: string,
		ownerId: number,
		change: MutableDecorationsChange,
	): void {
		const decoration = this.getOwnerDecoration(id, ownerId);
		if (!decoration) {
			return;
		}

		this.decorations.delete(id);
		change.removedDecorations.push(id);
	}

	private deltaDecorationsWithoutFiring(
		oldDecorations: readonly string[],
		newDecorations: readonly ITableModelDeltaDecoration[],
		ownerId: number,
		change: MutableDecorationsChange,
	): string[] {
		for (const oldDecoration of oldDecorations) {
			this.removeDecoration(oldDecoration, ownerId, change);
		}

		return newDecorations.map(decoration =>
			this.addDecoration(decoration.range, decoration.options, ownerId, change)
		);
	}

	private getOwnerDecoration(
		id: string,
		ownerId: number,
	): MutableTableModelDecoration | null {
		const decoration = this.decorations.get(id);
		if (!decoration || decoration.ownerId !== ownerId) {
			return null;
		}
		return decoration;
	}

	private getDecorations(ownerId: number | undefined): readonly ITableModelDecoration[] {
		return Array.from(this.decorations.values())
			.filter(decoration => ownerId === undefined || decoration.ownerId === ownerId)
			.sort((first, second) => {
				const zIndexDifference = (first.options.zIndex ?? 0) - (second.options.zIndex ?? 0);
				return zIndexDifference || first.id.localeCompare(second.id);
			})
			.map(decoration => ({
				id: decoration.id,
				options: decoration.options,
				ownerId: decoration.ownerId,
				range: decoration.range,
			}));
	}

	private fireDecorationsChanged(change: MutableDecorationsChange): void {
		if (!change.addedOrChangedDecorations.length && !change.removedDecorations.length) {
			return;
		}

		const event: TableModelDecorationsChangedEvent = {
			addedOrChangedDecorations: dedupeStrings(change.addedOrChangedDecorations),
			removedDecorations: dedupeStrings(change.removedDecorations),
		};
		this.onDidChangeDecorationsEmitter.fire(event);
		for (const viewModel of this.viewModels) {
			viewModel.onDidChangeModelDecorations?.(event);
		}
	}
}

const createDecorationsChange = (): MutableDecorationsChange => ({
	addedOrChangedDecorations: [],
	removedDecorations: [],
});

const normalizeNonNegativeInteger = (value: number): number => {
	const normalized = Math.floor(Number(value));
	return Number.isFinite(normalized) && normalized >= 0 ? normalized : 0;
};

const clampInteger = (value: number, min: number, max: number): number =>
	Math.max(min, Math.min(max, normalizeNonNegativeInteger(value)));

const normalizeResourceSourceVersion = (value: unknown): number =>
	Math.max(0, Math.floor(Number(value) || 0));

const dedupeStrings = (values: readonly string[]): readonly string[] =>
	Array.from(new Set(values));

const getErrorMessage = (error: unknown, fallback: string): string =>
	error instanceof Error && error.message.trim()
		? error.message
		: fallback;
