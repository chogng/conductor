/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { WorkbenchMainPart } from "src/cs/workbench/services/layout/browser/layoutService";
import type {
  ExplorerFileEntry,
  ExplorerResourceIdentity,
} from "src/cs/workbench/contrib/files/common/explorerModel";
import type { FilesViewLayout } from "src/cs/workbench/contrib/files/common/files";
import type { OriginPlotOptions } from "src/cs/workbench/services/origin/common/originPlotOptions";
import type { PlotType } from "src/cs/workbench/services/plot/common/plot";
import type { PlotMainRenderModelSource } from "src/cs/workbench/services/plot/common/plotModel";
import type { PlotAxisSettings } from "src/cs/workbench/services/plot/common/plotSettings";
import type {
  TemplateResourceSelection,
} from "src/cs/workbench/services/slice/common/templateSelection";

export const IExplorerService = createDecorator<IExplorerService>("explorerService");
export const ExplorerViewContainerId = "workbench.viewContainer.files";
export const ExplorerViewId = "workbench.files";

export type ExplorerViewLayout = FilesViewLayout;

export type ExplorerThumbnailPlotModel = PlotMainRenderModelSource & {
  readonly signature: string;
};

export type ExplorerPaneInput = {
  readonly activePlotType?: PlotType;
  readonly mode: WorkbenchMainPart;
  readonly originOpenPlotOptions?: OriginPlotOptions;
  readonly plotAxisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
  readonly selectedResource: URI | null;
  readonly selectedSheetId?: string | null;
  readonly selectionKind: WorkbenchMainPart;
  readonly templateSelections?: readonly TemplateResourceSelection[];
  readonly thumbnailPlotModelsByFileId?: Readonly<Record<string, ExplorerThumbnailPlotModel>>;
};

export type ExplorerSelectionChangeEvent = {
  readonly kind: WorkbenchMainPart;
  readonly selectedResource: URI | null;
  readonly selectedSheetId?: string | null;
};

export type ExplorerFolderExpansionChangeEvent = {
  readonly expandedFolderKeys: readonly string[];
};

export type ExplorerVisibleTargetsChangeEvent = {
  readonly nearbyTargets: readonly ExplorerResourceIdentity[];
  readonly visibleTargets: readonly ExplorerResourceIdentity[];
};

export type ExplorerHoveredResourceChangeEvent = {
  readonly resource: ExplorerResourceIdentity | null;
};

export type ExplorerRevealMode = boolean | "force";

export type ExplorerContext = {
  readonly selectedResource: URI | null;
  readonly selectedSheetId: string | null;
  readonly hoveredResource: ExplorerResourceIdentity | null;
  readonly expandedFolderKeys: readonly string[];
  readonly viewLayout: ExplorerViewLayout;
  readonly editable: ExplorerEditableData | null;
  readonly toCopy: ExplorerCopyState;
};

export type ExplorerEditableData = {
  readonly resource: ExplorerResourceIdentity;
  readonly isEditing: boolean;
};

export type ExplorerCopyState = {
  readonly resources: readonly ExplorerResourceIdentity[];
  readonly isCut: boolean;
};

export interface IExplorerView {
  selectResource?(resource: URI | null, reveal?: ExplorerRevealMode, sheetId?: string | null): void;
  refresh?(): void;
}

export interface IExplorerService {
  readonly _serviceBrand: undefined;

  readonly hasPendingSourceFiles: boolean;
  readonly files: readonly ExplorerFileEntry[];
  readonly selectedResource: URI | null;
  readonly selectedSheetId: string | null;
  readonly hoveredResource: ExplorerResourceIdentity | null;
  readonly expandedFolderKeys: readonly string[];
  readonly viewLayout: ExplorerViewLayout;
  readonly onDidChangePendingSourceFiles: Event<boolean>;
  readonly onDidChangeSelection: Event<ExplorerSelectionChangeEvent>;
  readonly onDidChangeHoveredResource: Event<ExplorerHoveredResourceChangeEvent>;
  readonly onDidChangeExpandedFolderKeys: Event<ExplorerFolderExpansionChangeEvent>;
  readonly onDidChangeFiles: Event<void>;
  readonly onDidChangeViewLayout: Event<ExplorerViewLayout>;
  readonly onDidChangeVisibleTargets: Event<ExplorerVisibleTargetsChangeEvent>;
  readonly onDidChangePaneInput: Event<void>;

  getContext(): ExplorerContext;
  registerView(view: IExplorerView): IDisposable;
  select(resource: URI | null, reveal?: ExplorerRevealMode, sheetId?: string | null): ExplorerResourceIdentity | null;
  setEditable(data: ExplorerEditableData | null): void;
  setToCopy(resources: readonly ExplorerResourceIdentity[], isCut: boolean): void;
  applyBulkEdit(): Promise<void>;
  refresh(): Promise<void>;
  replaceFiles(files: readonly ExplorerFileEntry[]): void;
  appendFiles(files: readonly ExplorerFileEntry[]): readonly ExplorerFileEntry[];
  removeFiles(fileIds: readonly string[]): readonly ExplorerFileEntry[];
  renameFile(fileId: string, fileName: string): void;
  setHoveredResource(resource: ExplorerResourceIdentity | null): void;
  setExpandedFolderKeys(folderKeys: readonly string[]): void;
  reconcileExpandedFolderKeys(folderKeys: readonly string[]): readonly string[];
  getCollapsedFolderKeys(folderKeys: readonly string[]): readonly string[];
  setPendingSourceFiles(hasPendingSourceFiles: boolean): void;
  setVisibleTargets(visibleTargets: readonly ExplorerResourceIdentity[], nearbyTargets?: readonly ExplorerResourceIdentity[]): void;
  setViewLayout(viewLayout: ExplorerViewLayout): void;
  toggleViewLayout(): void;
  getPaneInput(): ExplorerPaneInput | null;
  updatePaneInput(input: ExplorerPaneInput): void;
}
