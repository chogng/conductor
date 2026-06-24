/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  IExplorerWorkflowService,
  type ExplorerWorkflowHandler,
} from "src/cs/workbench/contrib/files/browser/files";

export class ExplorerWorkflowService extends Disposable implements IExplorerWorkflowService {
  public declare readonly _serviceBrand: undefined;

  private readonly handlers = new Set<ExplorerWorkflowHandler>();

  public registerHandler(handler: ExplorerWorkflowHandler) {
    this.handlers.add(handler);
    return toDisposable(() => {
      this.handlers.delete(handler);
    });
  }

  public openFolderImport(): void {
    this.getActiveHandler()?.openFolderImport();
  }

  public closeFolder(): void {
    this.getActiveHandler()?.closeFolder();
  }

  public closeFile(fileId: string): void {
    const normalizedFileId = normalizeExplorerWorkflowFileId(fileId);
    if (!normalizedFileId) {
      return;
    }

    this.getActiveHandler()?.closeFile(normalizedFileId);
  }

  public deleteFile(fileId: string): void {
    const normalizedFileId = normalizeExplorerWorkflowFileId(fileId);
    if (!normalizedFileId) {
      return;
    }

    this.getActiveHandler()?.deleteFile(normalizedFileId);
  }

  private getActiveHandler(): ExplorerWorkflowHandler | null {
    let activeHandler: ExplorerWorkflowHandler | null = null;
    for (const handler of this.handlers) {
      activeHandler = handler;
    }

    return activeHandler;
  }
}

registerSingleton(IExplorerWorkflowService, ExplorerWorkflowService, InstantiationType.Delayed);

function normalizeExplorerWorkflowFileId(fileId: unknown): string | null {
  const normalized = String(fileId ?? "").trim();
  return normalized || null;
}
