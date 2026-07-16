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
} from "src/cs/workbench/services/table/common/model";

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
	 * Starts resolving the resource without requiring the caller to hold a model
	 * reference.
	 */
	resolve(resource: URI, source?: TableSource | null): void;
}
