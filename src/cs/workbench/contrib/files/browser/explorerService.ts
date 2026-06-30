/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable, toDisposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  IExplorerService,
  type ExplorerPaneInput,
  type ExplorerFolderExpansionChangeEvent,
  type ExplorerHoveredResourceChangeEvent,
  type ExplorerResourceState,
  type ExplorerSelectionChangeEvent,
  type ExplorerVisibleTargetsChangeEvent,
  type ExplorerContext,
  type ExplorerCopyState,
  type ExplorerEditableData,
  type ExplorerRevealMode,
  type ExplorerResourceTarget,
  type ExplorerSelectionKind,
  type ExplorerSelectionTarget,
  type IExplorerView,
  type ExplorerViewLayout,
} from "src/cs/workbench/contrib/files/browser/files";
import {
  areTemplateTargetSelectionsEqual,
} from "src/cs/workbench/services/slice/common/templateSelection";
import {
  filterNewExplorerFiles,
  getExplorerResourceIdentityKey,
  mergeExplorerCommittedFiles,
  type ExplorerFileEntry,
} from "src/cs/workbench/contrib/files/common/explorerModel";

export class ExplorerService extends Disposable implements IExplorerService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangePendingSourceFilesEmitter = this._register(new Emitter<boolean>());
  public readonly onDidChangePendingSourceFiles = this.onDidChangePendingSourceFilesEmitter.event;
  private readonly onDidChangeSelectionEmitter = this._register(new Emitter<ExplorerSelectionChangeEvent>());
  public readonly onDidChangeSelection = this.onDidChangeSelectionEmitter.event;
  private readonly onDidChangeHoveredResourceEmitter = this._register(new Emitter<ExplorerHoveredResourceChangeEvent>());
  public readonly onDidChangeHoveredResource = this.onDidChangeHoveredResourceEmitter.event;
  private readonly onDidChangeExpandedFolderKeysEmitter = this._register(new Emitter<ExplorerFolderExpansionChangeEvent>());
  public readonly onDidChangeExpandedFolderKeys = this.onDidChangeExpandedFolderKeysEmitter.event;
  private readonly onDidChangeFilesEmitter = this._register(new Emitter<void>());
  public readonly onDidChangeFiles = this.onDidChangeFilesEmitter.event;
  private readonly onDidChangeViewLayoutEmitter = this._register(new Emitter<ExplorerViewLayout>());
  public readonly onDidChangeViewLayout = this.onDidChangeViewLayoutEmitter.event;
  private readonly onDidChangeVisibleTargetsEmitter = this._register(new Emitter<ExplorerVisibleTargetsChangeEvent>());
  public readonly onDidChangeVisibleTargets = this.onDidChangeVisibleTargetsEmitter.event;
  private readonly onDidChangePaneInputEmitter = this._register(new Emitter<void>());
  public readonly onDidChangePaneInput = this.onDidChangePaneInputEmitter.event;

  private currentSelectedResource: URI | null = null;
  private currentSelectedSheetId: string | null = null;
  private currentHoveredResource: ExplorerResourceTarget | null = null;
  private currentExpandedFolderKeys: readonly string[] = [];
  private knownFolderKeys: readonly string[] = [];
  private currentNearbyTargets: readonly ExplorerResourceTarget[] = [];
  private currentVisibleTargets: readonly ExplorerResourceTarget[] = [];
  private currentViewLayout: ExplorerViewLayout = "tree";
  private currentHasPendingSourceFiles = false;
  private currentFiles: ExplorerFileEntry[] = [];
  private paneInput: ExplorerPaneInput | null = null;
  private readonly views = new Set<IExplorerView>();
  private editable: ExplorerEditableData | null = null;
  private toCopy: ExplorerCopyState = {
    isCut: false,
    resources: [],
  };

  public get selectedResource(): URI | null {
    return this.currentSelectedResource;
  }

  public get selectedSheetId(): string | null {
    return this.currentSelectedSheetId;
  }

  public get hasPendingSourceFiles(): boolean {
    return this.currentHasPendingSourceFiles;
  }

  public get files(): readonly ExplorerFileEntry[] {
    return this.currentFiles;
  }

  public get hoveredResource(): ExplorerResourceTarget | null {
    return this.currentHoveredResource;
  }

  public get expandedFolderKeys(): readonly string[] {
    return this.currentExpandedFolderKeys;
  }

  public get viewLayout(): ExplorerViewLayout {
    return this.currentViewLayout;
  }

  public getContext(): ExplorerContext {
    return {
      editable: this.editable,
      expandedFolderKeys: this.currentExpandedFolderKeys,
      hoveredResource: this.currentHoveredResource,
      selectedResource: this.selectedResource,
      selectedSheetId: this.selectedSheetId,
      toCopy: this.toCopy,
      viewLayout: this.currentViewLayout,
    };
  }

  public registerView(view: IExplorerView) {
    this.views.add(view);
    return toDisposable(() => {
      this.views.delete(view);
    });
  }

  public select(target: ExplorerSelectionTarget, reveal?: ExplorerRevealMode): ExplorerResourceTarget | null {
    const result = this.applySelection(target);
    if (result.accepted && (result.changed || reveal !== undefined)) {
      const { sheetId: _sheetId, ...targetWithoutSheetId } = target;
      const acceptedTarget: ExplorerSelectionTarget = {
        ...targetWithoutSheetId,
        resource: result.selectedResource,
        ...(result.selectedSheetId ? { sheetId: result.selectedSheetId } : {}),
      };
      for (const view of this.views) {
        view.selectResource?.(acceptedTarget, reveal);
      }
    }
    return result.selectedResource
      ? {
          resource: result.selectedResource,
          ...(result.selectedSheetId ? { sheetId: result.selectedSheetId } : {}),
        }
      : null;
  }

  public setEditable(data: ExplorerEditableData | null): void {
    if (isSameExplorerEditableData(this.editable, data)) {
      return;
    }

    this.editable = data;
    this.onDidChangePaneInputEmitter.fire(undefined);
  }

  public setToCopy(resources: readonly ExplorerSelectionTarget[], isCut: boolean): void {
    this.toCopy = {
      isCut,
      resources: [...resources],
    };
  }

  public async applyBulkEdit(): Promise<void> {
    this.setEditable(null);
    this.setToCopy([], false);
  }

  public async refresh(): Promise<void> {
    for (const view of this.views) {
      view.refresh?.();
    }
  }

  public replaceFiles(files: readonly ExplorerFileEntry[]): void {
    this.setFiles(files);
  }

  public appendFiles(files: readonly ExplorerFileEntry[]): readonly ExplorerFileEntry[] {
    const importedFiles = filterNewExplorerFiles(files, this.currentFiles);
    if (!importedFiles.length) {
      return [];
    }

    this.setFiles(mergeExplorerCommittedFiles(this.currentFiles, importedFiles));
    return importedFiles;
  }

  public removeFiles(fileIds: readonly string[]): readonly ExplorerFileEntry[] {
    const removedFileIds = new Set(
      fileIds
        .map(normalizeExplorerFileId)
        .filter((fileId): fileId is string => Boolean(fileId)),
    );
    if (!removedFileIds.size) {
      return [];
    }

    const removedFiles: ExplorerFileEntry[] = [];
    const remainingFiles: ExplorerFileEntry[] = [];
    for (const file of this.currentFiles) {
      const fileId = normalizeExplorerFileId(file.fileId);
      if (fileId && removedFileIds.has(fileId)) {
        removedFiles.push(file);
      } else {
        remainingFiles.push(file);
      }
    }
    if (!removedFiles.length) {
      return [];
    }

    this.setFiles(remainingFiles);
    return removedFiles;
  }

  public renameFile(fileId: string, fileName: string): void {
    const normalizedFileId = normalizeExplorerFileId(fileId);
    const normalizedFileName = String(fileName ?? "").trim();
    if (!normalizedFileId || !normalizedFileName) {
      return;
    }

    let changed = false;
    const nextFiles = this.currentFiles.map(file => {
      if (normalizeExplorerFileId(file.fileId) !== normalizedFileId) {
        return file;
      }

      changed = changed || file.fileName !== normalizedFileName;
      return file.fileName === normalizedFileName
        ? file
        : { ...file, fileName: normalizedFileName };
    });
    if (changed) {
      this.setFiles(nextFiles);
    }
  }

  public setHoveredResource(target: ExplorerResourceTarget | null): void {
    const nextTarget = normalizeExplorerResourceTarget(target);
    if (areExplorerResourceTargetsEqual(this.currentHoveredResource, nextTarget)) {
      return;
    }

    this.currentHoveredResource = nextTarget;
    this.onDidChangeHoveredResourceEmitter.fire({ target: nextTarget });
  }

  public setExpandedFolderKeys(folderKeys: readonly string[]): void {
    this.applyExpandedFolderKeys(normalizeExplorerFolderKeys(folderKeys));
  }

  public reconcileExpandedFolderKeys(folderKeys: readonly string[]): readonly string[] {
    const nextKnownFolderKeys = normalizeExplorerFolderKeys(folderKeys);
    const previousKnownFolderKeys = new Set(this.knownFolderKeys);
    const expandedFolderKeys = new Set(this.currentExpandedFolderKeys);
    for (const folderKey of nextKnownFolderKeys) {
      if (!previousKnownFolderKeys.has(folderKey)) {
        expandedFolderKeys.add(folderKey);
      }
    }

    this.knownFolderKeys = nextKnownFolderKeys;
    this.applyExpandedFolderKeys(
      nextKnownFolderKeys.filter(folderKey => expandedFolderKeys.has(folderKey)),
    );
    return this.currentExpandedFolderKeys;
  }

  public getCollapsedFolderKeys(folderKeys: readonly string[]): readonly string[] {
    const expandedFolderKeys = new Set(this.currentExpandedFolderKeys);
    return normalizeExplorerFolderKeys(folderKeys)
      .filter(folderKey => !expandedFolderKeys.has(folderKey));
  }

  public setPendingSourceFiles(hasPendingSourceFiles: boolean): void {
    const next = Boolean(hasPendingSourceFiles);
    if (this.currentHasPendingSourceFiles === next) {
      return;
    }

    this.currentHasPendingSourceFiles = next;
    this.onDidChangePendingSourceFilesEmitter.fire(next);
  }

  public setVisibleTargets(
    visibleTargets: readonly ExplorerResourceTarget[],
    nearbyTargets: readonly ExplorerResourceTarget[] = [],
  ): void {
    const nextVisibleTargets = normalizeExplorerResourceTargets(visibleTargets);
    const visibleTargetKeys = new Set(nextVisibleTargets.map(getRequiredExplorerResourceIdentityKey));
    const nextNearbyTargets = normalizeExplorerResourceTargets(nearbyTargets)
      .filter(target => !visibleTargetKeys.has(getRequiredExplorerResourceIdentityKey(target)));
    if (
      areExplorerResourceTargetArraysEqual(this.currentVisibleTargets, nextVisibleTargets) &&
      areExplorerResourceTargetArraysEqual(this.currentNearbyTargets, nextNearbyTargets)
    ) {
      return;
    }

    this.currentVisibleTargets = nextVisibleTargets;
    this.currentNearbyTargets = nextNearbyTargets;
    this.onDidChangeVisibleTargetsEmitter.fire({
      nearbyTargets: nextNearbyTargets,
      visibleTargets: nextVisibleTargets,
    });
  }

  public setViewLayout(viewLayout: ExplorerViewLayout): void {
    if (this.currentViewLayout === viewLayout) {
      return;
    }

    this.currentViewLayout = viewLayout;
    this.onDidChangeViewLayoutEmitter.fire(viewLayout);
  }

  public toggleViewLayout(): void {
    this.setViewLayout(this.currentViewLayout === "thumbnail" ? "tree" : "thumbnail");
  }

  public getPaneInput(): ExplorerPaneInput | null {
    return this.paneInput;
  }

  public updatePaneInput(input: ExplorerPaneInput): void {
    if (this.paneInput && isSameExplorerPaneInput(this.paneInput, input)) {
      return;
    }

    this.paneInput = input;
    this.onDidChangePaneInputEmitter.fire(undefined);
  }

  private applySelection(target: ExplorerSelectionTarget): {
    readonly accepted: boolean;
    readonly changed: boolean;
    readonly selectedResource: URI | null;
    readonly selectedSheetId: string | null;
  } {
    const nextResource = normalizeExplorerResource(target.resource);
    const nextSheetId = normalizeExplorerSheetId(target.sheetId);
    if (nextResource && target.candidateResources) {
      const candidates = new Set(target.candidateResources.map(getExplorerResourceIdentityKey).filter(Boolean));
      if (!candidates.has(getExplorerResourceIdentityKey({ resource: nextResource, sheetId: nextSheetId }))) {
        return {
          accepted: false,
          changed: false,
          selectedResource: this.getSelectedResource(),
          selectedSheetId: this.currentSelectedSheetId,
        };
      }
    }

    const result = this.setSelectedTarget(nextResource, nextSheetId);
    this.fireSelectionChange(target.kind, result);
    return {
      accepted: true,
      changed: result.changed,
      selectedResource: result.selectedResource,
      selectedSheetId: result.selectedSheetId,
    };
  }

  private getSelectedResource(): URI | null {
    return this.currentSelectedResource;
  }

  private setSelectedTarget(resource: URI | null, sheetId: string | null): {
    readonly changed: boolean;
    readonly selectedResource: URI | null;
    readonly selectedSheetId: string | null;
  } {
    const nextResource = normalizeExplorerResource(resource);
    const nextSheetId = normalizeExplorerSheetId(sheetId);
    const currentResource = this.getSelectedResource();
    const currentSheetId = this.currentSelectedSheetId;
    if (
      areExplorerResourcesEqual(currentResource, nextResource) &&
      currentSheetId === nextSheetId
    ) {
      return {
        changed: false,
        selectedResource: nextResource,
        selectedSheetId: nextSheetId,
      };
    }

    this.currentSelectedResource = nextResource;
    this.currentSelectedSheetId = nextSheetId;
    this.updatePaneInputSelection();

    return {
      changed: true,
      selectedResource: nextResource,
      selectedSheetId: nextSheetId,
    };
  }

  private fireSelectionChange(
    kind: ExplorerSelectionKind,
    result: {
      readonly changed: boolean;
      readonly selectedResource: URI | null;
      readonly selectedSheetId: string | null;
    },
  ): void {
    if (!result.changed) {
      return;
    }

    this.onDidChangeSelectionEmitter.fire({
      kind,
      selectedResource: result.selectedResource,
      ...(result.selectedSheetId ? { selectedSheetId: result.selectedSheetId } : {}),
    });
  }

  private applyExpandedFolderKeys(folderKeys: readonly string[]): void {
    if (areStringArraysEqual(this.currentExpandedFolderKeys, folderKeys)) {
      return;
    }

    this.currentExpandedFolderKeys = [...folderKeys];
    this.onDidChangeExpandedFolderKeysEmitter.fire({
      expandedFolderKeys: this.currentExpandedFolderKeys,
    });
  }

  private setFiles(files: readonly ExplorerFileEntry[]): void {
    const nextFiles = [...files];
    if (areExplorerFilesEqual(this.currentFiles, nextFiles)) {
      return;
    }

    this.currentFiles = nextFiles;
    this.onDidChangeFilesEmitter.fire(undefined);
  }

  private updatePaneInputSelection(): void {
    if (!this.paneInput) {
      return;
    }

    this.updatePaneInput({
      ...this.paneInput,
      selectedResource: this.currentSelectedResource,
      selectedSheetId: this.currentSelectedSheetId,
    });
  }
}

registerSingleton(IExplorerService, ExplorerService, InstantiationType.Delayed);

const EMPTY_EXPLORER_PANE_INPUT: ExplorerPaneInput = {
  mode: "table",
  selectedResource: null,
  selectedSheetId: null,
  selectionKind: "table",
};

const normalizeExplorerFileId = (value: unknown): string | null => {
  const normalized = String(value ?? "").trim();
  return normalized || null;
};

function normalizeExplorerFolderKeys(folderKeys: readonly string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const folderKey of folderKeys) {
    const normalized = String(folderKey ?? "").trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function areStringArraysEqual(
  first: readonly string[],
  second: readonly string[],
): boolean {
  if (first.length !== second.length) {
    return false;
  }

  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) {
      return false;
    }
  }

  return true;
}

const normalizeExplorerResourceTargets = (
  targets: readonly ExplorerResourceTarget[],
): readonly ExplorerResourceTarget[] => {
  const result: ExplorerResourceTarget[] = [];
  const seen = new Set<string>();
  for (const target of targets) {
    const normalized = normalizeExplorerResourceTarget(target);
    const key = getExplorerResourceIdentityKey(normalized);
    if (!normalized || !key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result;
};

const getRequiredExplorerResourceIdentityKey = (target: ExplorerResourceTarget): string =>
  getExplorerResourceIdentityKey(target) ?? "";

const areExplorerResourceTargetArraysEqual = (
  current: readonly ExplorerResourceTarget[],
  next: readonly ExplorerResourceTarget[],
): boolean =>
  current.length === next.length &&
  current.every((target, index) =>
    areExplorerResourceTargetsEqual(target, next[index] ?? null));

const normalizeExplorerResource = (resource: URI | null | undefined): URI | null =>
  resource ? URI.revive(resource) ?? null : null;

const normalizeExplorerResourceTarget = (
  target: ExplorerResourceTarget | null | undefined,
): ExplorerResourceTarget | null => {
  const resource = normalizeExplorerResource(target?.resource);
  if (!resource) {
    return null;
  }

  const sheetId = normalizeExplorerSheetId(target?.sheetId);
  return {
    resource,
    ...(sheetId ? { sheetId } : {}),
  };
};

const normalizeExplorerSheetId = (sheetId: unknown): string | null => {
  const normalized = String(sheetId ?? "").trim();
  return normalized || null;
};

const isSameExplorerPaneInput = (
  current: ExplorerPaneInput,
  next: ExplorerPaneInput,
): boolean =>
  current.activePlotType === next.activePlotType &&
  current.mode === next.mode &&
  areExplorerResourcesEqual(current.selectedResource, next.selectedResource) &&
  current.selectedSheetId === next.selectedSheetId &&
  current.selectionKind === next.selectionKind &&
  areTemplateTargetSelectionsEqual(
    current.templateSelections ?? [],
    next.templateSelections ?? [],
  ) &&
  areExplorerResourceStatesEqual(current.resourceStates ?? [], next.resourceStates ?? []) &&
  areOriginPlotOptionsEqual(current.originOpenPlotOptions, next.originOpenPlotOptions) &&
  areShallowRecordsEqual(current.plotAxisSettings, next.plotAxisSettings) &&
  areThumbnailPlotModelsEqual(
    current.thumbnailPlotModelsByFileId ?? {},
    next.thumbnailPlotModelsByFileId ?? {},
  );

const isSameExplorerEditableData = (
  current: ExplorerEditableData | null,
  next: ExplorerEditableData | null,
): boolean =>
  current?.isEditing === next?.isEditing &&
  current?.resource.kind === next?.resource.kind &&
  areExplorerResourcesEqual(current?.resource.resource, next?.resource.resource) &&
  current?.resource.sheetId === next?.resource.sheetId;

const areExplorerFilesEqual = (
  current: readonly ExplorerFileEntry[],
  next: readonly ExplorerFileEntry[],
): boolean =>
  current.length === next.length &&
  current.every((file, index) => {
    const nextFile = next[index];
    return file.chartMessage === nextFile?.chartMessage &&
      file.chartState === nextFile.chartState &&
      file.fileId === nextFile.fileId &&
      file.fileName === nextFile.fileName &&
      file.hasChartData === nextFile.hasChartData &&
      file.itemKey === nextFile.itemKey &&
      file.localImport === nextFile.localImport &&
      file.normalizedCsvPath === nextFile.normalizedCsvPath &&
      file.relativePath === nextFile.relativePath &&
      areExplorerResourcesEqual(file.resource, nextFile.resource) &&
      file.sheetId === nextFile.sheetId &&
      file.sheetName === nextFile.sheetName &&
      file.sourcePath === nextFile.sourcePath &&
      file.sourceStatus === nextFile.sourceStatus &&
      file.sourceStatusMessage === nextFile.sourceStatusMessage &&
      file.fileVersion === nextFile.fileVersion;
  });

const areExplorerResourcesEqual = (
  current: ExplorerFileEntry["resource"],
  next: ExplorerFileEntry["resource"],
): boolean => {
  if (current === next) {
    return true;
  }
  if (!current || !next) {
    return false;
  }

  return URI.revive(current)?.toString() === URI.revive(next)?.toString();
};

const areExplorerResourceTargetsEqual = (
  current: ExplorerResourceTarget | null,
  next: ExplorerResourceTarget | null,
): boolean =>
  areExplorerResourcesEqual(current?.resource, next?.resource) &&
  normalizeExplorerSheetId(current?.sheetId) === normalizeExplorerSheetId(next?.sheetId);

const areExplorerResourceStatesEqual = (
  current: readonly ExplorerResourceState[],
  next: readonly ExplorerResourceState[],
): boolean =>
  current.length === next.length &&
  current.every((state, index) => {
    const nextState = next[index];
    return state.chartMessage === nextState?.chartMessage &&
      state.chartState === nextState?.chartState &&
      state.hasChartData === nextState?.hasChartData &&
      areExplorerResourceTargetsEqual(state, nextState ?? null);
  });

const areOriginPlotOptionsEqual = (
  current: ExplorerPaneInput["originOpenPlotOptions"],
  next: ExplorerPaneInput["originOpenPlotOptions"],
): boolean =>
  current?.command === next?.command &&
  current?.legendFontSize === next?.legendFontSize &&
  current?.lineWidth === next?.lineWidth &&
  current?.type === next?.type &&
  current?.xyPairs === next?.xyPairs &&
  areStringArraysEqual(current?.postCommands ?? [], next?.postCommands ?? []);

const areShallowRecordsEqual = (
  current: ExplorerPaneInput["plotAxisSettings"],
  next: ExplorerPaneInput["plotAxisSettings"],
): boolean => {
  if (current === next) {
    return true;
  }
  if (!current || !next) {
    return false;
  }

  const currentKeys = Object.keys(current).sort();
  const nextKeys = Object.keys(next).sort();
  const currentRecord = current as Record<string, unknown>;
  const nextRecord = next as Record<string, unknown>;
  return areStringArraysEqual(currentKeys, nextKeys) &&
    currentKeys.every(key => Object.is(currentRecord[key], nextRecord[key]));
};

const areThumbnailPlotModelsEqual = (
  current: NonNullable<ExplorerPaneInput["thumbnailPlotModelsByFileId"]>,
  next: NonNullable<ExplorerPaneInput["thumbnailPlotModelsByFileId"]>,
): boolean => {
  const currentKeys = Object.keys(current).sort();
  const nextKeys = Object.keys(next).sort();
  return areStringArraysEqual(currentKeys, nextKeys) &&
    currentKeys.every(key => current[key]?.signature === next[key]?.signature);
};
