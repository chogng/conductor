/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { WorkbenchMainPart } from "src/cs/workbench/services/layout/browser/layoutService";
import type { ExplorerFileEntry } from "src/cs/workbench/contrib/files/common/explorerModel";
import type { FilesViewLayout } from "src/cs/workbench/contrib/files/common/files";
import type { OriginPlotOptions } from "src/cs/workbench/services/origin/common/originPlotOptions";
import type { PlotType } from "src/cs/workbench/services/plot/common/plot";
import type { PlotMainRenderModelSource } from "src/cs/workbench/services/plot/common/plotModel";
import type { PlotAxisSettings } from "src/cs/workbench/services/plot/common/plotSettings";
import type {
  TemplateResourceSelection,
} from "src/cs/workbench/services/slice/common/templateSelection";

export const IExplorerService = createDecorator<IExplorerService>("explorerService");
export const ExplorerViewId = "workbench.files";

export type ExplorerSelectionKind = WorkbenchMainPart;

export type ExplorerViewLayout = FilesViewLayout;

export type ExplorerThumbnailPlotModel = PlotMainRenderModelSource & {
  readonly signature: string;
};

export type ExplorerResourceState = ExplorerResourceTarget & {
  readonly chartMessage?: string | null;
  readonly chartState?: ExplorerFileEntry["chartState"];
  readonly hasChartData?: boolean;
};

export type ExplorerPaneInput = {
  readonly activePlotType?: PlotType;
  readonly mode: WorkbenchMainPart;
  readonly originOpenPlotOptions?: OriginPlotOptions;
  readonly plotAxisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
  readonly resourceStates?: readonly ExplorerResourceState[];
  readonly selectedResource: URI | null;
  readonly selectedSheetId?: string | null;
  readonly selectionKind: ExplorerSelectionKind;
  readonly templateSelections?: readonly TemplateResourceSelection[];
  readonly thumbnailPlotModelsByFileId?: Readonly<Record<string, ExplorerThumbnailPlotModel>>;
};

export type ExplorerSelectionChangeEvent = {
  readonly kind: ExplorerSelectionKind;
  readonly selectedResource: URI | null;
  readonly selectedSheetId?: string | null;
};

export type ExplorerFolderExpansionChangeEvent = {
  readonly expandedFolderKeys: readonly string[];
};

export type ExplorerVisibleTargetsChangeEvent = {
  readonly nearbyTargets: readonly ExplorerResourceTarget[];
  readonly visibleTargets: readonly ExplorerResourceTarget[];
};

export type ExplorerHoveredResourceChangeEvent = {
  readonly target: ExplorerResourceTarget | null;
};

export type ExplorerSelectionTarget = {
  readonly kind: ExplorerSelectionKind;
  readonly resource: URI | null;
  readonly candidateResources?: readonly ExplorerResourceTarget[];
  readonly sheetId?: string | null;
};

export type ExplorerRevealMode = boolean | "force";

export type ExplorerContext = {
  readonly selectedResource: URI | null;
  readonly selectedSheetId: string | null;
  readonly hoveredResource: ExplorerResourceTarget | null;
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

export type ExplorerResourceTarget = {
  readonly resource: URI | null;
  readonly sheetId?: string | null;
};

export interface IExplorerView {
  selectResource?(target: ExplorerSelectionTarget, reveal?: ExplorerRevealMode): void;
  refresh?(): void;
}

export interface IExplorerService {
  readonly _serviceBrand: undefined;

  readonly hasPendingSourceFiles: boolean;
  readonly files: readonly ExplorerFileEntry[];
  readonly selectedResource: URI | null;
  readonly selectedSheetId: string | null;
  readonly hoveredResource: ExplorerResourceTarget | null;
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
  select(target: ExplorerSelectionTarget, reveal?: ExplorerRevealMode): ExplorerResourceTarget | null;
  setEditable(data: ExplorerEditableData | null): void;
  setToCopy(resources: readonly ExplorerSelectionTarget[], isCut: boolean): void;
  applyBulkEdit(): Promise<void>;
  refresh(): Promise<void>;
  replaceFiles(files: readonly ExplorerFileEntry[]): void;
  appendFiles(files: readonly ExplorerFileEntry[]): readonly ExplorerFileEntry[];
  removeFiles(fileIds: readonly string[]): readonly ExplorerFileEntry[];
  renameFile(fileId: string, fileName: string): void;
  setHoveredResource(target: ExplorerResourceTarget | null): void;
  setExpandedFolderKeys(folderKeys: readonly string[]): void;
  reconcileExpandedFolderKeys(folderKeys: readonly string[]): readonly string[];
  getCollapsedFolderKeys(folderKeys: readonly string[]): readonly string[];
  setPendingSourceFiles(hasPendingSourceFiles: boolean): void;
  setVisibleTargets(visibleTargets: readonly ExplorerResourceTarget[], nearbyTargets?: readonly ExplorerResourceTarget[]): void;
  setViewLayout(viewLayout: ExplorerViewLayout): void;
  toggleViewLayout(): void;
  getPaneInput(): ExplorerPaneInput | null;
  updatePaneInput(input: ExplorerPaneInput): void;
}
