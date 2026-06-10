/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable, toDisposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  IExplorerService,
  type ExplorerFolderExpansionChangeEvent,
  type ExplorerSelectionChangeEvent,
  type ExplorerContext,
  type ExplorerFileRemovalRequest,
  type ExplorerRevealMode,
  type ExplorerSelectionKind,
  type ExplorerSelectionRemoval,
  type ExplorerSelectionRequest,
  type ExplorerSelectionTarget,
  type ExplorerSessionSelection,
  type ExplorerSessionSelectionInput,
  type IExplorerView,
  type ExplorerViewLayout,
  type IExplorerService as IExplorerServiceType,
} from "src/cs/workbench/contrib/files/common/explorer";
import type { ExplorerPaneInput } from "src/cs/workbench/contrib/files/common/explorerPaneViewInput";
import { ExplorerSelectionStore } from "src/cs/workbench/contrib/files/common/explorerSelection";

export class ExplorerService extends Disposable implements IExplorerServiceType {
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

  private readonly selectionStore = new ExplorerSelectionStore();
  private currentExpandedFolderKeys: readonly string[] = [];
  private knownFolderKeys: readonly string[] = [];
  private currentViewLayout: ExplorerViewLayout = "tree";
  private paneInput: ExplorerPaneInput | null = null;
  private readonly views = new Set<IExplorerView>();

  public get selectedRawFileId(): string | null {
    return this.selectionStore.getSelectedFileId("raw");
  }

  public get selectedProcessedFileId(): string | null {
    return this.selectionStore.getSelectedFileId("analysis");
  }

  public get expandedFolderKeys(): readonly string[] {
    return this.currentExpandedFolderKeys;
  }

  public get viewLayout(): ExplorerViewLayout {
    return this.currentViewLayout;
  }

  public getContext(): ExplorerContext {
    return {
      expandedFolderKeys: this.currentExpandedFolderKeys,
      selectedProcessedFileId: this.selectedProcessedFileId,
      selectedRawFileId: this.selectedRawFileId,
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
    const result = this.setSelection({
      candidateFileIds: target.candidateFileIds,
      kind: target.kind,
      selectedFileId: target.fileId,
    });
    for (const view of this.views) {
      view.selectResource?.(target, reveal);
    }
    return result.selectedFileId;
  }

  public clearSelection(kind: ExplorerSelectionKind): void {
    this.fireSelectionChange(kind, this.selectionStore.clearSelection(kind));
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

  public reconcileSelection(kind: ExplorerSelectionKind, fileIds: readonly string[]): string | null {
    const result = this.selectionStore.reconcileSelection(kind, fileIds);
    this.fireSelectionChange(kind, result);
    return result.selectedFileId;
  }

  public getCollapsedFolderKeys(folderKeys: readonly string[]): readonly string[] {
    const expandedFolderKeys = new Set(this.currentExpandedFolderKeys);
    return normalizeExplorerFolderKeys(folderKeys)
      .filter(folderKey => !expandedFolderKeys.has(folderKey));
  }

  public removeFileIdsFromSelection(selection: ExplorerSelectionRemoval): string | null {
    const result = this.selectionStore.removeFileIdsFromSelection(selection);
    this.fireSelectionChange(selection.kind, result);
    return result.selectedFileId;
  }

  public requestFolderImport(): void {
    this.onDidRequestFolderImportEmitter.fire();
  }

  public requestSelectedFolderRemoval(): void {
    this.onDidRequestSelectedFolderRemovalEmitter.fire();
  }

  public requestFileRemoval(fileId: string): void {
    const normalizedFileId = this.selectionStore.normalizeFileId(fileId);
    if (!normalizedFileId) {
      return;
    }

    this.onDidRequestFileRemovalEmitter.fire({ fileId: normalizedFileId });
  }

  public setSelectedRawFileId(fileId: string | null): void {
    this.select({ kind: "raw", fileId });
  }

  public setSelectedProcessedFileId(fileId: string | null): void {
    this.select({ kind: "analysis", fileId });
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

  public resolveSelectedRawFileId(fileIds: readonly string[]): string | null {
    return this.resolveSelectedFileId("raw", fileIds);
  }

  public resolveSelectedProcessedFileId(fileIds: readonly string[]): string | null {
    return this.resolveSelectedFileId("analysis", fileIds);
  }

  public reconcileSelectedRawFileId(fileIds: readonly string[]): string | null {
    return this.reconcileSelection("raw", fileIds);
  }

  public reconcileSelectedProcessedFileId(fileIds: readonly string[]): string | null {
    return this.reconcileSelection("analysis", fileIds);
  }

  public resolveSelectedFileId(kind: ExplorerSelectionKind, fileIds: readonly string[]): string | null {
    return this.selectionStore.resolveSelectedFileId(kind, fileIds);
  }

  public resolveSessionSelection(input: ExplorerSessionSelectionInput): ExplorerSessionSelection {
    return {
      selectedProcessedFileId: this.resolveSelectedProcessedFileId(input.processedFileIds),
      selectedRawFileId: this.resolveSelectedRawFileId(input.rawFileIds),
    };
  }

  public reconcileSessionSelection(input: ExplorerSessionSelectionInput): ExplorerSessionSelection {
    return {
      selectedProcessedFileId: this.reconcileSelectedProcessedFileId(input.processedFileIds),
      selectedRawFileId: this.reconcileSelectedRawFileId(input.rawFileIds),
    };
  }

  public getPaneInput(): ExplorerPaneInput | null {
    return this.paneInput;
  }

  public updatePaneInput(input: ExplorerPaneInput): void {
    this.paneInput = input;
    this.onDidChangePaneInputEmitter.fire(input);
  }

  private setSelection(selection: ExplorerSelectionRequest): string | null {
    const result = this.selectionStore.setSelection(selection);
    this.fireSelectionChange(selection.kind, result);
    return result.selectedFileId;
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
