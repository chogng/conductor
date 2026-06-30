/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from "src/cs/base/common/async";
import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { extUriBiasedIgnorePathCase } from "src/cs/base/common/resources";
import { URI } from "src/cs/base/common/uri";
import type { IFileChange, IFileService } from "src/cs/platform/files/common/files";

const FOLDER_CHANGE_REACT_DELAY = 500;

type WorkspaceWatchFileService = Pick<IFileService, "onDidFilesChange" | "watch">;

export class WorkspaceWatcher implements IDisposable {
  private readonly store = new DisposableStore();
  private readonly scheduler: RunOnceScheduler;
  private folder: URI | null = null;

  constructor(
    private readonly filesService: WorkspaceWatchFileService,
    private readonly onDidChangeFolder: (folder: URI) => void,
    options: { readonly changeReactDelay?: number } = {},
  ) {
    this.scheduler = new RunOnceScheduler(() => {
      const folder = this.folder;
      if (folder) {
        this.onDidChangeFolder(folder);
      }
    }, options.changeReactDelay ?? FOLDER_CHANGE_REACT_DELAY);
  }

  public isWatching(folder: URI): boolean {
    return Boolean(this.folder && extUriBiasedIgnorePathCase.isEqual(this.folder, folder));
  }

  public watch(folder: URI): void {
    this.clear();

    this.folder = folder;
    this.store.add(this.filesService.watch(folder, { recursive: true }));
    this.store.add(this.filesService.onDidFilesChange(changes => {
      if (this.isAffected(changes)) {
        this.scheduler.schedule();
      }
    }));
  }

  public clear(): void {
    this.folder = null;
    this.scheduler.cancel();
    this.store.clear();
  }

  public dispose(): void {
    this.scheduler.dispose();
    this.store.dispose();
  }

  private isAffected(changes: readonly IFileChange[]): boolean {
    const folder = this.folder;
    if (!folder) {
      return false;
    }

    return changes.some(change => extUriBiasedIgnorePathCase.isEqualOrParent(change.resource, folder));
  }
}
