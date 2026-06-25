/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { TableSource } from "src/cs/workbench/services/table/common/table";
import type {
	ITableModel,
	TableModelContentSnapshot,
	TableModelPreviewInput,
	TableModelSheetSnapshot,
} from "src/cs/workbench/services/table/common/model";
import type { TableFileFormat } from "src/cs/workbench/services/table/common/tableFileFormat";

export const ITableModelService = createDecorator<ITableModelService>("tableModelService");

/**
 * A reference to a resolved URI-backed table model. Callers must dispose the
 * reference when they no longer need the model so the resolver can release its
 * file-backed or provider-backed cache entry.
 */
export interface ITableModelReference extends IDisposable {
	readonly object: ITableModel;
}

/**
 * Physical table content supplied by a provider-backed table resource.
 */
export type TableModelContentProviderResult = {
	readonly content: TableModelContentSnapshot | null;
	readonly format?: TableFileFormat | null;
	readonly previewInput?: TableModelPreviewInput | null;
	readonly sheets?: readonly TableModelSheetSnapshot[];
	readonly sourceVersion?: number;
};

/**
 * Supplies already-materialized table content for virtual or provider-backed
 * resources. File-backed CSV/TSV/XLS/XLSX parsing belongs to table parsers and
 * tablefile services, not to this provider contract.
 */
export interface ITableModelContentProvider extends IDisposable {
	/**
	 * Returns whether this provider owns resolving the given resource.
	 */
	canHandleResource(resource: URI): boolean;

	/**
	 * Resolves the given resource to physical table content and sheet snapshots.
	 */
	resolveTableModel(
		resource: URI,
		source?: TableSource | null,
	): Promise<TableModelContentProviderResult>;
}

/**
 * Resolves URI resources into table model references for table editors and
 * preview surfaces. This is the table counterpart to the upstream text model
 * resolver service: it owns the resource -> model-reference boundary, while
 * file format support, read encoding, and CSV/TSV/XLSX structure parsing stay
 * in their dedicated table services/helpers.
 */
export interface ITableModelService extends IDisposable {
	readonly _serviceBrand: undefined;

	/**
	 * Fires when a resolved table model changes content, load state, or metadata.
	 */
	readonly onDidChangeModel: Event<ITableModel>;

	/**
	 * Returns whether the resolver can create a table model for the resource.
	 */
	canHandleResource(resource: URI): boolean;

	/**
	 * Resolves a resource to a table model reference. Dispose the returned
	 * reference when the caller is done with the model.
	 */
	createModelReference(resource: URI, source?: TableSource | null): Promise<ITableModelReference>;

	/**
	 * Returns an already cached model for the resource, if one exists.
	 */
	get(resource: URI | null | undefined): ITableModel | undefined;

	/**
	 * Returns preview input for the table source when the backing model has
	 * materialized one.
	 */
	getPreviewInput(source: TableSource | null | undefined): TableModelPreviewInput | null;

	/**
	 * Registers a provider for virtual or generated table resources.
	 */
	registerContentProvider(provider: ITableModelContentProvider): IDisposable;

	/**
	 * Starts resolving the resource without requiring the caller to hold a model
	 * reference.
	 */
	resolve(resource: URI, source?: TableSource | null): void;
}
