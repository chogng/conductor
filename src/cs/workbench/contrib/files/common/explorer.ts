/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { ExplorerPaneInput } from "src/cs/workbench/contrib/files/common/explorerPaneViewInput";

export const IExplorerService = createDecorator<IExplorerService>("explorerService");
export const ExplorerViewId = "workbench.files";

export type ExplorerSelectionKind = "raw" | "analysis";

export type ExplorerViewLayout = "tree" | "thumbnail";

export type ExplorerSelectionChangeEvent = {
  readonly kind: ExplorerSelectionKind;
  readonly selectedFileId: string | null;
};

export type ExplorerFolderExpansionChangeEvent = {
  readonly expandedFolderKeys: readonly string[];
};

export type ExplorerSelectionTarget = {
  readonly kind: ExplorerSelectionKind;
  readonly fileId: string | null;
  readonly candidateFileIds?: readonly string[];
};

export type ExplorerRevealMode = boolean | "force";

export type ExplorerContext = {
  readonly selectedRawFileId: string | null;
  readonly selectedProcessedFileId: string | null;
  readonly expandedFolderKeys: readonly string[];
  readonly viewLayout: ExplorerViewLayout;
  readonly editable: ExplorerEditableData | null;
  readonly toCopy: ExplorerCopyState;
};

export type ExplorerEditableData = {
  readonly resource: ExplorerSelectionTarget;
  readonly isEditing: boolean;
};

export type ExplorerCopyState = {
  readonly resources: readonly ExplorerSelectionTarget[];
  readonly isCut: boolean;
};

export interface IExplorerView {
  selectResource?(target: ExplorerSelectionTarget, reveal?: ExplorerRevealMode): void;
  refresh?(): void;
}

export type ExplorerFileRemovalRequest = {
  readonly fileId: string;
};

export interface IExplorerService {
  readonly _serviceBrand: undefined;

  readonly selectedRawFileId: string | null;
  readonly selectedProcessedFileId: string | null;
  readonly expandedFolderKeys: readonly string[];
  readonly viewLayout: ExplorerViewLayout;
  readonly onDidChangeSelection: Event<ExplorerSelectionChangeEvent>;
  readonly onDidChangeExpandedFolderKeys: Event<ExplorerFolderExpansionChangeEvent>;
  readonly onDidChangeViewLayout: Event<ExplorerViewLayout>;
  readonly onDidChangePaneInput: Event<ExplorerPaneInput | null>;
  readonly onDidRequestFolderImport: Event<void>;
  readonly onDidRequestSelectedFolderRemoval: Event<void>;
  readonly onDidRequestFileRemoval: Event<ExplorerFileRemovalRequest>;

  getContext(): ExplorerContext;
  registerView(view: IExplorerView): IDisposable;
  select(target: ExplorerSelectionTarget, reveal?: ExplorerRevealMode): string | null;
  setEditable(data: ExplorerEditableData | null): void;
  setToCopy(resources: readonly ExplorerSelectionTarget[], isCut: boolean): void;
  applyBulkEdit(): Promise<void>;
  refresh(): Promise<void>;
  setExpandedFolderKeys(folderKeys: readonly string[]): void;
  reconcileExpandedFolderKeys(folderKeys: readonly string[]): readonly string[];
  getCollapsedFolderKeys(folderKeys: readonly string[]): readonly string[];
  requestFolderImport(): void;
  requestSelectedFolderRemoval(): void;
  requestFileRemoval(fileId: string): void;
  setViewLayout(viewLayout: ExplorerViewLayout): void;
  toggleViewLayout(): void;
  getPaneInput(): ExplorerPaneInput | null;
  updatePaneInput(input: ExplorerPaneInput): void;
}
