/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import type { IReadFileEncoding } from "src/cs/platform/files/common/files";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type {
	ITableModel,
} from "src/cs/workbench/services/table/common/model";
import type { TableSource } from "src/cs/workbench/services/table/common/table";
import type {
	TableFileEditorModel,
} from "src/cs/workbench/services/tablefile/common/tableFileEditorModel";
import type {
	TableFileEditorModelManagerResolveOptions,
} from "src/cs/workbench/services/tablefile/common/tableFileEditorModelManager";

export const ITableFileService = createDecorator<ITableFileService>("tableFileService");

/**
 * File-backed table working-copy service. This is the table counterpart to the
 * upstream text-file service branch used by the model resolver: it validates
 * table file support, chooses file read encoding, and delegates cached working
 * copies to the table file editor model manager.
 */
export interface ITableFileService extends IDisposable {
	readonly _serviceBrand: undefined;
	readonly onDidChangeModel: Event<ITableModel>;

	canHandleResource(resource: URI): boolean;
	getReadEncoding(resource: URI): IReadFileEncoding;
	get(resource: URI | null | undefined): ITableModel | undefined;
	getOrCreateFileEditorModel(
		resource: URI,
		source?: TableSource | null,
	): TableFileEditorModel;
	resolveModel(
		model: TableFileEditorModel,
		options?: TableFileEditorModelManagerResolveOptions,
	): Promise<void>;
	resolve(resource: URI, source?: TableSource | null): void;
	remove(resource: URI): void;
}
