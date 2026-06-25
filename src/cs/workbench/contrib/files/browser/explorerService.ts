/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable, toDisposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  IExplorerService,
  type ExplorerPaneInput,
  type ExplorerFolderExpansionChangeEvent,
  type ExplorerSelectionChangeEvent,
  type ExplorerVisibleFileIdsChangeEvent,
  type ExplorerContext,
  type ExplorerCopyState,
  type ExplorerEditableData,
  type ExplorerRevealMode,
  type ExplorerSelectionKind,
  type ExplorerSelectionTarget,
  type IExplorerView,
  type ExplorerViewLayout,
} from "src/cs/workbench/contrib/files/browser/files";
import {
  getTemplateSelectionTemplateId,
  type TemplateSelection,
} from "src/cs/workbench/services/slice/common/templateSelection";
import {
  createRawTableStatusSignature,
} from "src/cs/workbench/contrib/files/common/rawTableStatusProjection";

export class ExplorerService extends Disposable implements IExplorerService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangePendingSourceFilesEmitter = this._register(new Emitter<boolean>());
  public readonly onDidChangePendingSourceFiles = this.onDidChangePendingSourceFilesEmitter.event;
  private readonly onDidChangeSelectionEmitter = this._register(new Emitter<ExplorerSelectionChangeEvent>());
  public readonly onDidChangeSelection = this.onDidChangeSelectionEmitter.event;
  private readonly onDidChangeHoveredFileEmitter = this._register(new Emitter<{ readonly fileId: string | null }>());
  public readonly onDidChangeHoveredFile = this.onDidChangeHoveredFileEmitter.event;
  private readonly onDidChangeExpandedFolderKeysEmitter = this._register(new Emitter<ExplorerFolderExpansionChangeEvent>());
  public readonly onDidChangeExpandedFolderKeys = this.onDidChangeExpandedFolderKeysEmitter.event;
  private readonly onDidChangeViewLayoutEmitter = this._register(new Emitter<ExplorerViewLayout>());
  public readonly onDidChangeViewLayout = this.onDidChangeViewLayoutEmitter.event;
  private readonly onDidChangeVisibleFileIdsEmitter = this._register(new Emitter<ExplorerVisibleFileIdsChangeEvent>());
  public readonly onDidChangeVisibleFileIds = this.onDidChangeVisibleFileIdsEmitter.event;
  private readonly onDidChangePaneInputEmitter = this._register(new Emitter<void>());
  public readonly onDidChangePaneInput = this.onDidChangePaneInputEmitter.event;

  private currentSelectedFileId: string | null = null;
  private currentSelectedSourceKey: string | null = null;
  private currentHoveredFileId: string | null = null;
  private currentExpandedFolderKeys: readonly string[] = [];
  private knownFolderKeys: readonly string[] = [];
  private currentNearbyFileIds: readonly string[] = [];
  private currentVisibleFileIds: readonly string[] = [];
  private currentViewLayout: ExplorerViewLayout = "tree";
  private currentHasPendingSourceFiles = false;
  private paneInput: ExplorerPaneInput | null = null;
  private readonly views = new Set<IExplorerView>();
  private editable: ExplorerEditableData | null = null;
  private toCopy: ExplorerCopyState = {
    isCut: false,
    resources: [],
  };

  public get selectedRawFileId(): string | null {
    return this.currentSelectedFileId;
  }

  public get selectedRawSourceKey(): string | null {
    return this.currentSelectedSourceKey;
  }

  public get hasPendingSourceFiles(): boolean {
    return this.currentHasPendingSourceFiles;
  }

  public get selectedProcessedFileId(): string | null {
    return this.currentSelectedFileId;
  }

  public get selectedProcessedSourceKey(): string | null {
    return this.currentSelectedSourceKey;
  }

  public get hoveredFileId(): string | null {
    return this.currentHoveredFileId;
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
      hoveredFileId: this.currentHoveredFileId,
      selectedProcessedFileId: this.selectedProcessedFileId,
      selectedProcessedSourceKey: this.selectedProcessedSourceKey,
      selectedRawFileId: this.selectedRawFileId,
      selectedRawSourceKey: this.selectedRawSourceKey,
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

  public select(target: ExplorerSelectionTarget, reveal?: ExplorerRevealMode): string | null {
    const result = this.applySelection(target);
    if (result.accepted && (result.changed || reveal !== undefined)) {
      const { sourceKey: _sourceKey, ...targetWithoutSourceKey } = target;
      const acceptedTarget: ExplorerSelectionTarget = {
        ...targetWithoutSourceKey,
        fileId: result.selectedFileId,
        ...(result.selectedSourceKey ? { sourceKey: result.selectedSourceKey } : {}),
      };
      for (const view of this.views) {
        view.selectResource?.(acceptedTarget, reveal);
      }
    }
    return result.selectedFileId;
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

  public setHoveredFileId(fileId: string | null): void {
    const nextFileId = normalizeExplorerFileId(fileId);
    if (this.currentHoveredFileId === nextFileId) {
      return;
    }

    this.currentHoveredFileId = nextFileId;
    this.onDidChangeHoveredFileEmitter.fire({ fileId: nextFileId });
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

  public setVisibleFileIds(
    visibleFileIds: readonly string[],
    nearbyFileIds: readonly string[] = [],
  ): void {
    const nextVisibleFileIds = getNormalizedExplorerFileIds(visibleFileIds);
    const nextNearbyFileIds = getNormalizedExplorerFileIds(nearbyFileIds)
      .filter(fileId => !nextVisibleFileIds.includes(fileId));
    if (
      areStringArraysEqual(this.currentVisibleFileIds, nextVisibleFileIds) &&
      areStringArraysEqual(this.currentNearbyFileIds, nextNearbyFileIds)
    ) {
      return;
    }

    this.currentVisibleFileIds = nextVisibleFileIds;
    this.currentNearbyFileIds = nextNearbyFileIds;
    this.onDidChangeVisibleFileIdsEmitter.fire({
      nearbyFileIds: nextNearbyFileIds,
      visibleFileIds: nextVisibleFileIds,
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
    readonly selectedFileId: string | null;
    readonly selectedSourceKey: string | null;
  } {
    const nextFileId = normalizeExplorerFileId(target.fileId);
    const nextSourceKey = normalizeExplorerSourceKey(target.sourceKey);
    if (nextFileId && target.candidateFileIds) {
      const candidates = getNormalizedExplorerFileIds(target.candidateFileIds);
      if (!candidates.includes(nextFileId)) {
        return {
          accepted: false,
          changed: false,
          selectedFileId: this.getSelectedFileId(),
          selectedSourceKey: this.currentSelectedSourceKey,
        };
      }
    }
    if (nextSourceKey && target.candidateSourceKeys) {
      const candidates = getNormalizedExplorerSourceKeys(target.candidateSourceKeys);
      if (!candidates.includes(nextSourceKey)) {
        return {
          accepted: false,
          changed: false,
          selectedFileId: this.getSelectedFileId(),
          selectedSourceKey: this.currentSelectedSourceKey,
        };
      }
    }

    const result = this.setSelectedTarget(nextFileId, nextSourceKey);
    this.fireSelectionChange(target.kind, result);
    return {
      accepted: true,
      changed: result.changed,
      selectedFileId: result.selectedFileId,
      selectedSourceKey: result.selectedSourceKey,
    };
  }

  private getSelectedFileId(): string | null {
    return this.currentSelectedFileId;
  }

  private setSelectedTarget(fileId: string | null, sourceKey: string | null): {
    readonly changed: boolean;
    readonly selectedFileId: string | null;
    readonly selectedSourceKey: string | null;
  } {
    const nextFileId = normalizeExplorerFileId(fileId);
    const nextSourceKey = normalizeExplorerSourceKey(sourceKey);
    const currentFileId = this.getSelectedFileId();
    const currentSourceKey = this.currentSelectedSourceKey;
    if (currentFileId === nextFileId && currentSourceKey === nextSourceKey) {
      return {
        changed: false,
        selectedFileId: nextFileId,
        selectedSourceKey: nextSourceKey,
      };
    }

    this.currentSelectedFileId = nextFileId;
    this.currentSelectedSourceKey = nextSourceKey;

    return {
      changed: true,
      selectedFileId: nextFileId,
      selectedSourceKey: nextSourceKey,
    };
  }

  private fireSelectionChange(
    kind: ExplorerSelectionKind,
    result: {
      readonly changed: boolean;
      readonly selectedFileId: string | null;
      readonly selectedSourceKey: string | null;
    },
  ): void {
    if (!result.changed) {
      return;
    }

    this.onDidChangeSelectionEmitter.fire({
      kind,
      selectedFileId: result.selectedFileId,
      ...(result.selectedSourceKey ? { selectedSourceKey: result.selectedSourceKey } : {}),
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
}

registerSingleton(IExplorerService, ExplorerService, InstantiationType.Delayed);

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

const getNormalizedExplorerFileIds = (
  fileIds: readonly string[],
): readonly string[] => {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const fileId of fileIds) {
    const normalized = normalizeExplorerFileId(fileId);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
};

const getNormalizedExplorerSourceKeys = (
  sourceKeys: readonly string[],
): readonly string[] => {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const sourceKey of sourceKeys) {
    const normalized = normalizeExplorerSourceKey(sourceKey);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
};

const normalizeExplorerFileId = (fileId: unknown): string | null => {
  const normalized = String(fileId ?? "").trim();
  return normalized || null;
};

const normalizeExplorerSourceKey = (sourceKey: unknown): string | null => {
  const normalized = String(sourceKey ?? "").trim();
  return normalized || null;
};

const isSameExplorerPaneInput = (
  current: ExplorerPaneInput,
  next: ExplorerPaneInput,
): boolean =>
  current.activePlotType === next.activePlotType &&
  current.mode === next.mode &&
  current.selectedFileId === next.selectedFileId &&
  current.selectedSourceKey === next.selectedSourceKey &&
  current.selectionKind === next.selectionKind &&
  areTemplateSelectionsEqual(
    current.fileTemplateSelectionsByFileId ?? {},
    next.fileTemplateSelectionsByFileId ?? {},
  ) &&
  areExplorerFilesEqual(current.files, next.files) &&
  areExplorerFilesEqual(current.quickAccessFiles ?? [], next.quickAccessFiles ?? []) &&
  areOriginPlotOptionsEqual(current.originOpenPlotOptions, next.originOpenPlotOptions) &&
  areShallowRecordsEqual(current.plotAxisSettings, next.plotAxisSettings) &&
  areProcessedEntriesEqual(current.thumbnailFiles, next.thumbnailFiles) &&
  areThumbnailPlotModelsEqual(
    current.thumbnailPlotModelsByFileId ?? {},
    next.thumbnailPlotModelsByFileId ?? {},
  );

const isSameTemplateSelection = (
  current: TemplateSelection | undefined,
  next: TemplateSelection | undefined,
): boolean => {
  if (current?.kind === "auto" || next?.kind === "auto") {
    return current?.kind === next?.kind;
  }
  if (current?.kind === "inline" || next?.kind === "inline") {
    return current?.kind === "inline" &&
      next?.kind === "inline" &&
      current.template.id === next.template.id &&
      current.template.version === next.template.version;
  }

  return getTemplateSelectionTemplateId(current) === getTemplateSelectionTemplateId(next);
};

const areTemplateSelectionsEqual = (
  current: NonNullable<ExplorerPaneInput["fileTemplateSelectionsByFileId"]>,
  next: NonNullable<ExplorerPaneInput["fileTemplateSelectionsByFileId"]>,
): boolean => {
  const currentKeys = Object.keys(current).sort();
  const nextKeys = Object.keys(next).sort();
  return areStringArraysEqual(currentKeys, nextKeys) &&
    currentKeys.every(key => isSameTemplateSelection(current[key], next[key]));
};

const isSameExplorerEditableData = (
  current: ExplorerEditableData | null,
  next: ExplorerEditableData | null,
): boolean =>
  current?.isEditing === next?.isEditing &&
  current?.resource.kind === next?.resource.kind &&
  current?.resource.fileId === next?.resource.fileId &&
  current?.resource.sourceKey === next?.resource.sourceKey;

const areExplorerFilesEqual = (
  current: ExplorerPaneInput["files"],
  next: ExplorerPaneInput["files"],
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
      file.normalizedCsvPath === nextFile.normalizedCsvPath &&
      file.relativePath === nextFile.relativePath &&
      file.sourceKey === nextFile.sourceKey &&
      file.sourcePath === nextFile.sourcePath &&
      file.sourceStatus === nextFile.sourceStatus &&
      file.sourceStatusMessage === nextFile.sourceStatusMessage &&
      createRawTableStatusSignature(file.rawTableStatus) ===
        createRawTableStatusSignature(nextFile.rawTableStatus) &&
      file.badgeState?.kind === nextFile.badgeState?.kind &&
      file.fileVersion === nextFile.fileVersion &&
      (
        file.badgeState?.kind !== "pending" ||
        nextFile.badgeState?.kind === "pending" &&
          file.badgeState.source === nextFile.badgeState.source &&
          file.badgeState.queueState === nextFile.badgeState.queueState
      ) &&
      (
        file.badgeState?.kind !== "error" ||
        nextFile.badgeState?.kind === "error" &&
          file.badgeState.message === nextFile.badgeState.message
      ) &&
      (
        file.badgeState?.kind !== "ready" ||
        nextFile.badgeState?.kind === "ready" &&
          file.badgeState.label === nextFile.badgeState.label &&
          file.badgeState.confidence === nextFile.badgeState.confidence &&
          file.badgeState.source === nextFile.badgeState.source &&
          file.badgeState.message === nextFile.badgeState.message
      ) &&
      (
        file.badgeState?.kind !== "unknown" ||
        nextFile.badgeState?.kind === "unknown" &&
          file.badgeState.source === nextFile.badgeState.source &&
          file.badgeState.message === nextFile.badgeState.message &&
          file.badgeState.suspectedType === nextFile.badgeState.suspectedType
      ) &&
      file.curveType === nextFile.curveType &&
      file.curveTypeBadgeLabel === nextFile.curveTypeBadgeLabel &&
      file.curveTypeConfidence === nextFile.curveTypeConfidence &&
      file.curveTypeNeedsReview === nextFile.curveTypeNeedsReview &&
      areStringArraysEqual(file.curveTypeReasons ?? [], nextFile.curveTypeReasons ?? []);
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

const areProcessedEntriesEqual = (
  current: ExplorerPaneInput["thumbnailFiles"],
  next: ExplorerPaneInput["thumbnailFiles"],
): boolean =>
  current.length === next.length &&
  current.every((file, index) => {
    const nextFile = next[index];
    return file.fileId === nextFile?.fileId &&
      file.fileName === nextFile.fileName &&
      file.curveFilterKey === nextFile.curveFilterKey &&
      file.curveFilterField === nextFile.curveFilterField &&
      file.curveType === nextFile.curveType &&
      file.curveTypeConfidence === nextFile.curveTypeConfidence &&
      file.curveTypeNeedsReview === nextFile.curveTypeNeedsReview &&
      file.supportsSs === nextFile.supportsSs &&
      file.xAxisRole === nextFile.xAxisRole &&
      file.xAxisRoleSource === nextFile.xAxisRoleSource &&
      file.xUnit === nextFile.xUnit &&
      areStringArraysEqual(file.curveTypeReasons ?? [], nextFile.curveTypeReasons ?? []);
  });

const areThumbnailPlotModelsEqual = (
  current: NonNullable<ExplorerPaneInput["thumbnailPlotModelsByFileId"]>,
  next: NonNullable<ExplorerPaneInput["thumbnailPlotModelsByFileId"]>,
): boolean => {
  const currentKeys = Object.keys(current).sort();
  const nextKeys = Object.keys(next).sort();
  return areStringArraysEqual(currentKeys, nextKeys) &&
    currentKeys.every(key => current[key]?.signature === next[key]?.signature);
};
