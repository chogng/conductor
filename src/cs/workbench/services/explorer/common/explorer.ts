/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { ExplorerPaneInput } from "src/cs/workbench/services/explorer/common/explorerPaneViewInput";

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

export type ExplorerSelectionRequest = {
  readonly kind: ExplorerSelectionKind;
  readonly selectedFileId: string | null;
  readonly candidateFileIds?: readonly string[];
};

export type ExplorerSelectionRemoval = {
  readonly kind: ExplorerSelectionKind;
  readonly removedFileIds: readonly string[];
  readonly remainingFileIds: readonly string[];
};

export type ExplorerFileRemovalRequest = {
  readonly fileId: string;
};

export type ExplorerSessionSelectionInput = {
  readonly rawFileIds: readonly string[];
  readonly analysisFileIds: readonly string[];
};

export type ExplorerSessionSelection = {
  readonly selectedRawFileId: string | null;
  readonly selectedAnalysisFileId: string | null;
};

export interface IExplorerService {
  readonly _serviceBrand: undefined;

  readonly selectedRawFileId: string | null;
  readonly selectedAnalysisFileId: string | null;
  readonly expandedFolderKeys: readonly string[];
  readonly viewLayout: ExplorerViewLayout;
  readonly onDidChangeSelection: Event<ExplorerSelectionChangeEvent>;
  readonly onDidChangeExpandedFolderKeys: Event<ExplorerFolderExpansionChangeEvent>;
  readonly onDidChangeViewLayout: Event<ExplorerViewLayout>;
  readonly onDidChangePaneInput: Event<ExplorerPaneInput | null>;
  readonly onDidRequestFolderImport: Event<void>;
  readonly onDidRequestSelectedFolderRemoval: Event<void>;
  readonly onDidRequestFileRemoval: Event<ExplorerFileRemovalRequest>;

  selectFile(kind: ExplorerSelectionKind, fileId: string | null, candidateFileIds?: readonly string[]): string | null;
  setSelection(selection: ExplorerSelectionRequest): string | null;
  clearSelection(kind: ExplorerSelectionKind): void;
  setExpandedFolderKeys(folderKeys: readonly string[]): void;
  reconcileExpandedFolderKeys(folderKeys: readonly string[]): readonly string[];
  reconcileSelection(kind: ExplorerSelectionKind, fileIds: readonly string[]): string | null;
  getCollapsedFolderKeys(folderKeys: readonly string[]): readonly string[];
  removeFileIdsFromSelection(selection: ExplorerSelectionRemoval): string | null;
  requestFolderImport(): void;
  requestSelectedFolderRemoval(): void;
  requestFileRemoval(fileId: string): void;
  setSelectedRawFileId(fileId: string | null): void;
  setSelectedAnalysisFileId(fileId: string | null): void;
  setViewLayout(viewLayout: ExplorerViewLayout): void;
  toggleViewLayout(): void;
  resolveSelectedFileId(kind: ExplorerSelectionKind, fileIds: readonly string[]): string | null;
  resolveSelectedRawFileId(fileIds: readonly string[]): string | null;
  resolveSelectedAnalysisFileId(fileIds: readonly string[]): string | null;
  reconcileSelectedRawFileId(fileIds: readonly string[]): string | null;
  reconcileSelectedAnalysisFileId(fileIds: readonly string[]): string | null;
  resolveSessionSelection(input: ExplorerSessionSelectionInput): ExplorerSessionSelection;
  reconcileSessionSelection(input: ExplorerSessionSelectionInput): ExplorerSessionSelection;
  getPaneInput(): ExplorerPaneInput | null;
  updatePaneInput(input: ExplorerPaneInput): void;
}
