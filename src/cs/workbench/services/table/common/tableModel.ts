/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import type { SessionFile } from "src/cs/workbench/services/session/common/sessionTypes";
import type { TableSource } from "src/cs/workbench/services/table/common/table";
import type { TableFileFormat } from "src/cs/workbench/services/table/common/tableFileFormat";

export type TableModelLoadState = {
  readonly state: "idle" | "loading" | "ready" | "error";
  readonly message: string;
};

export type TableModelSnapshot = {
  readonly format: TableFileFormat | null;
  readonly loadState: TableModelLoadState;
  readonly resource: URI;
  readonly sessionFile: SessionFile | null;
  readonly sourceKey: string;
  readonly version: number;
};

export interface ITableModel extends IDisposable {
  readonly onDidChange: Event<ITableModel>;
  readonly resource: URI;
  readonly sourceKey: string;
  getSnapshot(): TableModelSnapshot;
}

export interface ITableModelService extends IDisposable {
  readonly onDidChangeModel: Event<ITableModel>;
  get(resource: URI | null | undefined): ITableModel | undefined;
  getSessionFile(source: TableSource | null | undefined): SessionFile | null;
  resolve(resource: URI, source?: TableSource | null): void;
}

