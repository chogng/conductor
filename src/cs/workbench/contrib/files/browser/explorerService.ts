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
  type ExplorerContext,
  type ExplorerCopyState,
  type ExplorerEditableData,
  type ExplorerFileRemovalRequest,
  type ExplorerRevealMode,
  type ExplorerSelectionKind,
  type ExplorerSelectionTarget,
  type IExplorerView,
  type ExplorerViewLayout,
} from "src/cs/workbench/contrib/files/browser/files";

export class ExplorerService extends Disposable implements IExplorerService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeSelectionEmitter = this._register(new Emitter<ExplorerSelectionChangeEvent>());
  public readonly onDidChangeSelection = this.onDidChangeSelectionEmitter.event;
  private readonly onDidChangeExpandedFolderKeysEmitter = this._register(new Emitter<ExplorerFolderExpansionChangeEvent>());
  public readonly onDidChangeExpandedFolderKeys = this.onDidChangeExpandedFolderKeysEmitter.event;
  private readonly onDidChangeViewLayoutEmitter = this._register(new Emitter<ExplorerViewLayout>());
  public readonly onDidChangeViewLayout = this.onDidChangeViewLayoutEmitter.event;
  private readonly onDidChangePaneInputEmitter = this._register(new Emitter<ExplorerPaneInput | null>());
  public readonly onDidChangePaneInput = this.onDidChangePaneInputEmitter.event;
  private readonly onDidRequestFolderImportEmitter = this._register(new Emitter<void>());
  public readonly onDidRequestFolderImport = this.onDidRequestFolderImportEmitter.event;
  private readonly onDidRequestSelectedFolderRemovalEmitter = this._register(new Emitter<void>());
  public readonly onDidRequestSelectedFolderRemoval = this.onDidRequestSelectedFolderRemovalEmitter.event;
  private readonly onDidRequestFileRemovalEmitter = this._register(new Emitter<ExplorerFileRemovalRequest>());
  public readonly onDidRequestFileRemoval = this.onDidRequestFileRemovalEmitter.event;

  private currentRawFileId: string | null = null;
  private currentProcessedFileId: string | null = null;
  private currentExpandedFolderKeys: readonly string[] = [];
  private knownFolderKeys: readonly string[] = [];
  private currentViewLayout: ExplorerViewLayout = "tree";
  private paneInput: ExplorerPaneInput | null = null;
  private readonly views = new Set<IExplorerView>();
  private editable: ExplorerEditableData | null = null;
  private toCopy: ExplorerCopyState = {
    isCut: false,
    resources: [],
  };

  public get selectedRawFileId(): string | null {
    return this.getSelectedFileId("table");
  }

  public get selectedProcessedFileId(): string | null {
    return this.getSelectedFileId("chart");
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
      selectedProcessedFileId: this.selectedProcessedFileId,
      selectedRawFileId: this.selectedRawFileId,
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
    const selectedFileId = this.applySelection(target);
    for (const view of this.views) {
      view.selectResource?.(target, reveal);
    }
    return selectedFileId;
  }

  public setEditable(data: ExplorerEditableData | null): void {
    this.editable = data;
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

  public requestFolderImport(): void {
    this.onDidRequestFolderImportEmitter.fire();
  }

  public requestSelectedFolderRemoval(): void {
    this.onDidRequestSelectedFolderRemovalEmitter.fire();
  }

  public requestFileRemoval(fileId: string): void {
    const normalizedFileId = normalizeExplorerFileId(fileId);
    if (!normalizedFileId) {
      return;
    }

    this.onDidRequestFileRemovalEmitter.fire({ fileId: normalizedFileId });
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
    this.paneInput = input;
    this.onDidChangePaneInputEmitter.fire(input);
  }

  private applySelection(target: ExplorerSelectionTarget): string | null {
    const nextFileId = normalizeExplorerFileId(target.fileId);
    if (nextFileId && target.candidateFileIds) {
      const candidates = getNormalizedExplorerFileIds(target.candidateFileIds);
      if (!candidates.includes(nextFileId)) {
        return this.getSelectedFileId(target.kind);
      }
    }

    const result = this.setSelectedFileId(target.kind, nextFileId);
    this.fireSelectionChange(target.kind, result);
    return result.selectedFileId;
  }

  private getSelectedFileId(kind: ExplorerSelectionKind): string | null {
    return kind === "table"
      ? this.currentRawFileId
      : this.currentProcessedFileId;
  }

  private setSelectedFileId(kind: ExplorerSelectionKind, fileId: string | null): {
    readonly changed: boolean;
    readonly selectedFileId: string | null;
  } {
    const nextFileId = normalizeExplorerFileId(fileId);
    const currentFileId = this.getSelectedFileId(kind);
    if (currentFileId === nextFileId) {
      return {
        changed: false,
        selectedFileId: nextFileId,
      };
    }

    if (kind === "table") {
      this.currentRawFileId = nextFileId;
    } else {
      this.currentProcessedFileId = nextFileId;
    }

    return {
      changed: true,
      selectedFileId: nextFileId,
    };
  }

  private fireSelectionChange(
    kind: ExplorerSelectionKind,
    result: { readonly changed: boolean; readonly selectedFileId: string | null },
  ): void {
    if (!result.changed) {
      return;
    }

    this.onDidChangeSelectionEmitter.fire({
      kind,
      selectedFileId: result.selectedFileId,
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

const normalizeExplorerFileId = (fileId: unknown): string | null => {
  const normalized = String(fileId ?? "").trim();
  return normalized || null;
};
