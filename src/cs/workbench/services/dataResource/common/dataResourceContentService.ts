/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { StructuredContentGridSnapshot } from "src/cs/workbench/services/dataResource/common/structuredContent";
import type { TableFormatId } from "src/cs/workbench/services/table/common/tableFormatService";
import type { TableParseDiagnostic } from "src/cs/workbench/services/table/common/model";

export const IDataResourceContentService = createDecorator<IDataResourceContentService>(
	"dataResourceContentService",
);

export type DataResourceContentKind = "file" | "provider";

export type DataResourceContentSheetSnapshot = {
	readonly content: StructuredContentGridSnapshot | null;
	readonly diagnostics?: readonly TableParseDiagnostic[];
	readonly sheetId: string;
	readonly sheetName: string | null;
};

export type DataResourceContentSnapshot = {
	readonly content: StructuredContentGridSnapshot | null;
	readonly defaultSheetId: string | null;
	readonly diagnostics: readonly TableParseDiagnostic[];
	readonly errorMessage: string | null;
	readonly format: TableFormatId | null;
	readonly resource: URI;
	readonly sheets: readonly DataResourceContentSheetSnapshot[];
	readonly sourceVersion: number;
	readonly version: number;
};

export type DataResourceContentProviderResult = {
	readonly content: StructuredContentGridSnapshot | null;
	readonly defaultSheetId?: string | null;
	readonly diagnostics?: readonly TableParseDiagnostic[];
	readonly format: TableFormatId | null;
	readonly sheets?: readonly DataResourceContentSheetSnapshot[];
	readonly sourceVersion?: number;
};

export interface IDataResourceContentProvider extends IDisposable {
	canHandleResource(resource: URI): boolean;
	resolveContent(resource: URI): Promise<DataResourceContentProviderResult>;
}

export interface IDataResourceContentReference extends IDisposable {
	readonly kind: DataResourceContentKind;
	readonly object: DataResourceContentSnapshot;
}

/**
 * Owns reusable physical content resolution below DataResource evidence and
 * table-model materialization.
 */
export interface IDataResourceContentService extends IDisposable {
	readonly _serviceBrand: undefined;
	readonly onDidChangeContent: Event<URI>;

	canHandleResource(resource: URI): boolean;
	createContentReference(resource: URI): Promise<IDataResourceContentReference>;
	get(resource: URI | null | undefined): DataResourceContentSnapshot | undefined;
	getContentKind(resource: URI): DataResourceContentKind | null;
	registerContentProvider(provider: IDataResourceContentProvider): IDisposable;
}
