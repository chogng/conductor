/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable, toDisposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  IExplorerService,
  type ExplorerFolderExpansionChangeEvent,
  type ExplorerHoveredResourceChangeEvent,
  type ExplorerSelectionChangeEvent,
  type ExplorerVisibleTargetsChangeEvent,
  type ExplorerContext,
  type ExplorerCopyState,
  type ExplorerEditableData,
  type ExplorerRevealMode,
  type IExplorerView,
  type ExplorerViewLayout,
} from "src/cs/workbench/contrib/files/browser/files";
import {
  filterNewExplorerFiles,
  getExplorerFileResourceIdentity,
  getExplorerResourceIdentityKey,
  mergeExplorerCommittedFiles,
  type ExplorerFileEntry,
  type ExplorerResourceIdentity,
} from "src/cs/workbench/contrib/files/common/explorerModel";

export class ExplorerService extends Disposable implements IExplorerService {
  public declare readonly _serviceBrand: undefined;

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
  private readonly onDidChangeContextEmitter = this._register(new Emitter<void>());
  public readonly onDidChangeContext = this.onDidChangeContextEmitter.event;

  private currentSelectedResource: URI | null = null;
  private currentSelectedSheetId: string | null = null;
  private currentHoveredResource: ExplorerResourceIdentity | null = null;
  private currentExpandedFolderKeys: readonly string[] = [];
  private knownFolderKeys: readonly string[] = [];
  private currentNearbyTargets: readonly ExplorerResourceIdentity[] = [];
  private currentVisibleTargets: readonly ExplorerResourceIdentity[] = [];
  private currentViewLayout: ExplorerViewLayout = "tree";
  private currentIsImportingSources = false;
  private currentFiles: ExplorerFileEntry[] = [];
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

  public get isImportingSources(): boolean {
    return this.currentIsImportingSources;
  }

  public get files(): readonly ExplorerFileEntry[] {
    return this.currentFiles;
  }

  public get hoveredResource(): ExplorerResourceIdentity | null {
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

  public select(resource: URI | null, reveal?: ExplorerRevealMode, sheetId?: string | null): ExplorerResourceIdentity | null {
    const result = this.applySelection(resource, sheetId);
    if (result.changed || reveal !== undefined) {
      for (const view of this.views) {
        view.selectResource?.(result.selectedResource, reveal, result.selectedSheetId);
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
    this.onDidChangeContextEmitter.fire(undefined);
  }

  public setToCopy(resources: readonly ExplorerResourceIdentity[], isCut: boolean): void {
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

  public setHoveredResource(resource: ExplorerResourceIdentity | null): void {
    const nextResource = normalizeExplorerResourceIdentity(resource);
    if (areExplorerResourceIdentitiesEqual(this.currentHoveredResource, nextResource)) {
      return;
    }

    this.currentHoveredResource = nextResource;
    this.onDidChangeHoveredResourceEmitter.fire({ resource: nextResource });
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

  public setImportingSources(isImportingSources: boolean): void {
    const nextIsImportingSources = Boolean(isImportingSources);
    if (this.currentIsImportingSources === nextIsImportingSources) {
      return;
    }

    this.currentIsImportingSources = nextIsImportingSources;
    this.onDidChangeContextEmitter.fire(undefined);
  }

  public setVisibleTargets(
    visibleTargets: readonly ExplorerResourceIdentity[],
    nearbyTargets: readonly ExplorerResourceIdentity[] = [],
  ): void {
    const nextVisibleTargets = normalizeExplorerResourceIdentities(visibleTargets);
    const visibleTargetKeys = new Set(nextVisibleTargets.map(getRequiredExplorerResourceIdentityKey));
    const nextNearbyTargets = normalizeExplorerResourceIdentities(nearbyTargets)
      .filter(target => !visibleTargetKeys.has(getRequiredExplorerResourceIdentityKey(target)));
    if (
      areExplorerResourceIdentityArraysEqual(this.currentVisibleTargets, nextVisibleTargets) &&
      areExplorerResourceIdentityArraysEqual(this.currentNearbyTargets, nextNearbyTargets)
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

  private applySelection(resource: URI | null | undefined, sheetId: string | null | undefined): {
    readonly changed: boolean;
    readonly selectedResource: URI | null;
    readonly selectedSheetId: string | null;
  } {
    const result = this.setSelectedTarget(
      normalizeExplorerResource(resource),
      normalizeExplorerSheetId(sheetId),
    );
    this.fireSelectionChange(result);
    return {
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

    return {
      changed: true,
      selectedResource: nextResource,
      selectedSheetId: nextSheetId,
    };
  }

  private fireSelectionChange(
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
    const selectedKey = getExplorerResourceIdentityKey({
      resource: this.currentSelectedResource,
      sheetId: this.currentSelectedSheetId,
    });
    const hasSelectedFile = selectedKey
      ? nextFiles.some(file =>
          getExplorerResourceIdentityKey(getExplorerFileResourceIdentity(file)) === selectedKey)
      : false;
    if (hasSelectedFile) {
      return;
    }

    const firstResource = getExplorerFileResourceIdentity(nextFiles[0] ?? null);
    this.select(firstResource?.resource ?? null, undefined, firstResource?.sheetId ?? null);
  }
}

registerSingleton(IExplorerService, ExplorerService, InstantiationType.Delayed);

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

const normalizeExplorerResourceIdentities = (
  identities: readonly ExplorerResourceIdentity[],
): readonly ExplorerResourceIdentity[] => {
  const result: ExplorerResourceIdentity[] = [];
  const seen = new Set<string>();
  for (const identity of identities) {
    const normalized = normalizeExplorerResourceIdentity(identity);
    const key = getExplorerResourceIdentityKey(normalized);
    if (!normalized || !key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result;
};

const getRequiredExplorerResourceIdentityKey = (identity: ExplorerResourceIdentity): string =>
  getExplorerResourceIdentityKey(identity) ?? "";

const areExplorerResourceIdentityArraysEqual = (
  current: readonly ExplorerResourceIdentity[],
  next: readonly ExplorerResourceIdentity[],
): boolean =>
  current.length === next.length &&
  current.every((identity, index) =>
    areExplorerResourceIdentitiesEqual(identity, next[index] ?? null));

const normalizeExplorerResource = (resource: URI | null | undefined): URI | null =>
  resource ? URI.revive(resource) ?? null : null;

const normalizeExplorerResourceIdentity = (
  identity: { readonly resource?: URI | null; readonly sheetId?: string | null } | null | undefined,
): ExplorerResourceIdentity | null => {
  const resource = normalizeExplorerResource(identity?.resource);
  if (!resource) {
    return null;
  }

  const sheetId = normalizeExplorerSheetId(identity?.sheetId);
  return {
    resource,
    ...(sheetId ? { sheetId } : {}),
  };
};

const normalizeExplorerSheetId = (sheetId: unknown): string | null => {
  const normalized = String(sheetId ?? "").trim();
  return normalized || null;
};

const isSameExplorerEditableData = (
  current: ExplorerEditableData | null,
  next: ExplorerEditableData | null,
): boolean =>
  current?.isEditing === next?.isEditing &&
  areExplorerResourceIdentitiesEqual(current?.resource ?? null, next?.resource ?? null);

const areExplorerFilesEqual = (
  current: readonly ExplorerFileEntry[],
  next: readonly ExplorerFileEntry[],
): boolean =>
  current.length === next.length &&
  current.every((file, index) => {
    const nextFile = next[index];
    return file.chartMessage === nextFile?.chartMessage &&
      file.chartState === nextFile.chartState &&
      file.contentHash === nextFile.contentHash &&
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
      file.fileVersion === nextFile.fileVersion;
  });

const areExplorerResourcesEqual = (
  current: URI | null | undefined,
  next: URI | null | undefined,
): boolean => {
  if (current === next) {
    return true;
  }
  if (!current || !next) {
    return false;
  }
  return URI.revive(current).toString() === URI.revive(next).toString();
};

const areExplorerResourceIdentitiesEqual = (
  current: ExplorerResourceIdentity | null,
  next: ExplorerResourceIdentity | null,
): boolean =>
  areExplorerResourcesEqual(current?.resource, next?.resource) &&
  normalizeExplorerSheetId(current?.sheetId) === normalizeExplorerSheetId(next?.sheetId);
