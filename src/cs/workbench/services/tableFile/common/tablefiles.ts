/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type {
	ITableModel,
	TableModelResolvedContent,
} from "src/cs/workbench/services/table/common/model";
import type { TableSource } from "src/cs/workbench/services/table/common/table";
import type {
	TableFileEditorModel,
} from "src/cs/workbench/services/tableFile/common/tableFileEditorModel";
import type {
	TableFileEditorModelManagerResolveOptions,
} from "src/cs/workbench/services/tableFile/common/tableFileEditorModelManager";
import type { TableFileReadMode } from "src/cs/workbench/services/tableFile/common/encoding";

export const ITableFileService = createDecorator<ITableFileService>("tableFileService");

export type TableFileResolvedContent = {
	readonly content: TableModelResolvedContent;
	readonly version: number;
};

/**
 * File-backed table working-copy service. This is the table counterpart to the
 * upstream text-file service branch used by the model resolver: it validates
 * table file support, chooses table read mode, and delegates cached working
 * copies to the table file editor model manager.
 */
export interface ITableFileService extends IDisposable {
	readonly _serviceBrand: undefined;
	readonly onDidChangeContent: Event<URI>;
	readonly onDidChangeModel: Event<ITableModel>;

	canHandleResource(resource: URI): boolean;
	getReadMode(resource: URI): TableFileReadMode;
	get(resource: URI | null | undefined): ITableModel | undefined;
	getResolvedContent(resource: URI | null | undefined): TableFileResolvedContent | undefined;
	getOrCreateFileEditorModel(
		resource: URI,
		source?: TableSource | null,
	): TableFileEditorModel;
	resolveModel(
		model: TableFileEditorModel,
		options?: TableFileEditorModelManagerResolveOptions,
	): Promise<void>;
	resolveContent(
		model: TableFileEditorModel,
		options?: TableFileEditorModelManagerResolveOptions,
	): Promise<TableFileResolvedContent>;
	resolve(resource: URI, source?: TableSource | null): void;
	remove(resource: URI): void;
}
