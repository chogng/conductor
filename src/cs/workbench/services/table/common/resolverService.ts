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
} from "src/cs/workbench/services/table/common/tableModel";
import type { TableFileFormat } from "src/cs/workbench/services/table/common/tableFileFormat";

export const ITableModelService = createDecorator<ITableModelService>("tableModelService");

export interface ITableModelReference extends IDisposable {
  readonly object: ITableModel;
}

export type TableModelContentProviderResult = {
  readonly content: TableModelContentSnapshot | null;
  readonly format?: TableFileFormat | null;
  readonly previewInput?: TableModelPreviewInput | null;
  readonly sheets?: readonly TableModelSheetSnapshot[];
  readonly sourceVersion?: number;
};

export interface ITableModelContentProvider extends IDisposable {
  canHandleResource(resource: URI): boolean;
  resolveTableModel(
    resource: URI,
    source?: TableSource | null,
  ): Promise<TableModelContentProviderResult>;
}

export interface ITableModelService extends IDisposable {
  readonly _serviceBrand: undefined;
  readonly onDidChangeModel: Event<ITableModel>;
  canHandleResource(resource: URI): boolean;
  createModelReference(resource: URI, source?: TableSource | null): Promise<ITableModelReference>;
  get(resource: URI | null | undefined): ITableModel | undefined;
  getPreviewInput(source: TableSource | null | undefined): TableModelPreviewInput | null;
  registerContentProvider(provider: ITableModelContentProvider): IDisposable;
  resolve(resource: URI, source?: TableSource | null): void;
}
