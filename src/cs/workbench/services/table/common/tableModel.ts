/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import type { TableSource } from "src/cs/workbench/services/table/common/table";
import type { TableFileFormat } from "src/cs/workbench/services/table/common/tableFileFormat";

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
  readonly sheetName: string | null;
  readonly sourceKey: string;
};

export type TableModelPreviewInput = {
  readonly columnCount?: number;
  readonly file?: unknown;
  readonly fileName?: string;
  readonly maxCellLengths?: readonly number[];
  readonly normalizedCsvPath?: string | null;
  readonly rawTableHealth?: "ok" | "suspect" | "decodeFailed" | "parseFailed" | "unsupported" | "empty";
  readonly rawTableHealthMessage?: string | null;
  readonly relativePath?: string | null;
  readonly resource?: URI;
  readonly rowCount?: number;
  readonly sheetId?: string | null;
  readonly sheetName?: string | null;
  readonly sourcePath?: string | null;
  readonly sourceVersion?: number;
  readonly tableModelContent?: TableModelContentSnapshot;
};

export type TableModelSnapshot = {
  readonly content: TableModelContentSnapshot | null;
  readonly format: TableFileFormat | null;
  readonly loadState: TableModelLoadState;
  readonly resource: URI;
  readonly previewInput: TableModelPreviewInput | null;
  readonly sheets: readonly TableModelSheetSnapshot[];
  readonly sourceKey: string;
  readonly sourceVersion: number;
  readonly version: number;
};

export interface ITableModel extends IDisposable {
  readonly onDidChange: Event<ITableModel>;
  readonly resource: URI;
  readonly sourceKey: string;
  getPreviewInput(source?: TableSource | null): TableModelPreviewInput | null;
  getSnapshot(): TableModelSnapshot;
}
