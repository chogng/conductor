/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { WorkbenchMainPart } from "src/cs/workbench/services/layout/browser/layoutService";
import type { ExplorerFileEntry } from "src/cs/workbench/contrib/files/common/explorerModel";
import type { FilesViewLayout } from "src/cs/workbench/contrib/files/common/files";
import type { OriginPlotOptions } from "src/cs/workbench/services/origin/common/originPlotOptions";
import type { PlotType } from "src/cs/workbench/services/plot/common/plot";
import type { PlotMainRenderModelSource } from "src/cs/workbench/services/plot/common/plotModel";
import type { PlotAxisSettings } from "src/cs/workbench/services/plot/common/plotSettings";
import type {
  ProcessedEntry,
} from "src/cs/workbench/services/session/common/sessionTypes";
import type {
  TemplateSelection,
  TemplateSelectionsByFileId,
} from "src/cs/workbench/services/slice/common/templateSelection";

export const IExplorerService = createDecorator<IExplorerService>("explorerService");
export const IExplorerWorkflowService = createDecorator<IExplorerWorkflowService>("explorerWorkflowService");
export const ExplorerViewId = "workbench.files";

export type ExplorerSelectionKind = WorkbenchMainPart;

export type ExplorerViewLayout = FilesViewLayout;

export type ExplorerThumbnailPlotModel = PlotMainRenderModelSource & {
  readonly signature: string;
};

export type ExplorerPaneInput = {
  readonly activePlotType?: PlotType;
  readonly fileTemplateSelectionsByFileId?: TemplateSelectionsByFileId;
  readonly files: ExplorerFileEntry[];
  readonly mode: WorkbenchMainPart;
  readonly originOpenPlotOptions?: OriginPlotOptions;
  readonly plotAxisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
  readonly quickAccessFiles?: ExplorerFileEntry[];
  readonly selectedFileId: string | null;
  readonly selectedSourceKey?: string | null;
  readonly selectionKind: ExplorerSelectionKind;
  readonly thumbnailFiles: ProcessedEntry[];
  readonly thumbnailPlotModelsByFileId?: Readonly<Record<string, ExplorerThumbnailPlotModel>>;
};

export type ExplorerSelectionChangeEvent = {
  readonly kind: ExplorerSelectionKind;
  readonly selectedFileId: string | null;
  readonly selectedSourceKey?: string | null;
};

export type ExplorerFolderExpansionChangeEvent = {
  readonly expandedFolderKeys: readonly string[];
};

export type ExplorerVisibleFileIdsChangeEvent = {
  readonly nearbyFileIds: readonly string[];
  readonly visibleFileIds: readonly string[];
};

export type ExplorerHoveredFileChangeEvent = {
  readonly fileId: string | null;
};

export type ExplorerSelectionTarget = {
  readonly kind: ExplorerSelectionKind;
  readonly fileId: string | null;
  readonly candidateFileIds?: readonly string[];
  readonly candidateSourceKeys?: readonly string[];
  readonly sourceKey?: string | null;
};

export type ExplorerRevealMode = boolean | "force";

export type ExplorerContext = {
  readonly selectedRawFileId: string | null;
  readonly selectedRawSourceKey: string | null;
  readonly selectedProcessedFileId: string | null;
  readonly selectedProcessedSourceKey: string | null;
  readonly hoveredFileId: string | null;
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

export interface IExplorerService {
  readonly _serviceBrand: undefined;

  readonly hasPendingSourceFiles: boolean;
  readonly selectedRawFileId: string | null;
  readonly selectedRawSourceKey: string | null;
  readonly selectedProcessedFileId: string | null;
  readonly selectedProcessedSourceKey: string | null;
  readonly hoveredFileId: string | null;
  readonly expandedFolderKeys: readonly string[];
  readonly viewLayout: ExplorerViewLayout;
  readonly onDidChangePendingSourceFiles: Event<boolean>;
  readonly onDidChangeSelection: Event<ExplorerSelectionChangeEvent>;
  readonly onDidChangeHoveredFile: Event<ExplorerHoveredFileChangeEvent>;
  readonly onDidChangeExpandedFolderKeys: Event<ExplorerFolderExpansionChangeEvent>;
  readonly onDidChangeViewLayout: Event<ExplorerViewLayout>;
  readonly onDidChangeVisibleFileIds: Event<ExplorerVisibleFileIdsChangeEvent>;
  readonly onDidChangePaneInput: Event<void>;

  getContext(): ExplorerContext;
  registerView(view: IExplorerView): IDisposable;
  select(target: ExplorerSelectionTarget, reveal?: ExplorerRevealMode): string | null;
  setEditable(data: ExplorerEditableData | null): void;
  setToCopy(resources: readonly ExplorerSelectionTarget[], isCut: boolean): void;
  applyBulkEdit(): Promise<void>;
  refresh(): Promise<void>;
  setHoveredFileId(fileId: string | null): void;
  setExpandedFolderKeys(folderKeys: readonly string[]): void;
  reconcileExpandedFolderKeys(folderKeys: readonly string[]): readonly string[];
  getCollapsedFolderKeys(folderKeys: readonly string[]): readonly string[];
  setPendingSourceFiles(hasPendingSourceFiles: boolean): void;
  setVisibleFileIds(visibleFileIds: readonly string[], nearbyFileIds?: readonly string[]): void;
  setViewLayout(viewLayout: ExplorerViewLayout): void;
  toggleViewLayout(): void;
  getPaneInput(): ExplorerPaneInput | null;
  updatePaneInput(input: ExplorerPaneInput): void;
}

export interface ExplorerWorkflowHandler {
  openFolderImport(): void;
  closeFolder(): void;
  closeFile(fileId: string): void;
  deleteFile(fileId: string): void;
}

export interface IExplorerWorkflowService {
  readonly _serviceBrand: undefined;

  registerHandler(handler: ExplorerWorkflowHandler): IDisposable;
  openFolderImport(): void;
  closeFolder(): void;
  closeFile(fileId: string): void;
  deleteFile(fileId: string): void;
}
