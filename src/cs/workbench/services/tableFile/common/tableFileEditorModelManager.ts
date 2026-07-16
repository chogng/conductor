/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, type Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import {
  FileChangeType,
  IFileService,
  type IFileChange,
} from "src/cs/platform/files/common/files";
import {
  TableFileEditorModel,
  type TableFileEditorModelResolvedContent,
  type TableFileEditorModelResolveOptions,
} from "src/cs/workbench/services/tableFile/common/tableFileEditorModel";
import {
  type ITableModel,
  type TableModelResolvedContent,
  type TableModel,
} from "src/cs/workbench/services/table/common/model";
import {
  type TableSource,
} from "src/cs/workbench/services/table/common/table";
import type { ITableStructureParserService } from "src/cs/workbench/services/table/common/tableStructureParserService";
import type { TableFileResolvedContent } from "src/cs/workbench/services/tableFile/common/tablefiles";

export type TableFileEditorModelManagerResolveOptions = TableFileEditorModelResolveOptions & {
  readonly force?: boolean;
};

export class TableFileEditorModelManager extends Disposable {
  private readonly onDidChangeModelEmitter =
    this._register(new Emitter<ITableModel>());
  public readonly onDidChangeModel: Event<ITableModel> =
    this.onDidChangeModelEmitter.event;
  private readonly onDidChangeContentEmitter =
    this._register(new Emitter<URI>());
  public readonly onDidChangeContent: Event<URI> =
    this.onDidChangeContentEmitter.event;

  private readonly fileEditorModels = new Map<string, TableFileEditorModel>();
  private readonly contentGenerations = new Map<string, number>();
  private readonly contentVersions = new Map<string, number>();
  private readonly pendingContentResolves = new Map<string, Promise<TableFileResolvedContent>>();
  private readonly pendingResolves = new Map<string, Promise<void>>();
  private readonly resolvedContents = new Map<string, TableFileResolvedContent>();

  public constructor(
    private readonly tableStructureParserService: ITableStructureParserService,
    @IFileService private readonly fileService: IFileService,
  ) {
    super();
    this._register(this.fileService.onDidFilesChange(changes => {
      this.onDidFilesChange(changes);
    }));
  }

  public get(resource: URI | null | undefined): ITableModel | undefined {
    const cacheKey = getModelCacheKey(resource);
    return cacheKey ? this.fileEditorModels.get(cacheKey)?.model : undefined;
  }

  public getResolvedContent(
    resource: URI | null | undefined,
  ): TableFileResolvedContent | undefined {
    const cacheKey = getModelCacheKey(resource);
    return cacheKey ? this.resolvedContents.get(cacheKey) : undefined;
  }

  public resolve(resource: URI, source?: TableSource | null): void {
    const model = this.getOrCreateFileEditorModel(resource, source);
    void this.resolveModel(model);
  }

  public async resolveModel(
    model: TableFileEditorModel,
    options: TableFileEditorModelManagerResolveOptions = {},
  ): Promise<void> {
    const { force } = options;
    if (!force && model.model.getSnapshot().loadState.state === "ready") {
      return;
    }

    const cacheKey = getModelCacheKey(model.resource);
    if (!cacheKey) {
      throw new Error("Cannot resolve a table model without a resource.");
    }

    const pending = this.pendingResolves.get(cacheKey);
    if (pending) {
      await pending;
      return;
    }

    const pendingResolve = this.resolveContent(model, options)
      .then(resolved => model.applyResolvedContent(resolved.content))
      .catch(error => model.applyResolveError(error))
      .finally(() => {
        if (this.pendingResolves.get(cacheKey) === pendingResolve) {
          this.pendingResolves.delete(cacheKey);
        }
      });
    this.pendingResolves.set(cacheKey, pendingResolve);
    await pendingResolve;
  }

  public async resolveContent(
    model: TableFileEditorModel,
    options: TableFileEditorModelManagerResolveOptions = {},
  ): Promise<TableFileResolvedContent> {
    const { force, ...resolveOptions } = options;
    const cacheKey = getModelCacheKey(model.resource);
    if (!cacheKey) {
      throw new Error("Cannot resolve table content without a resource.");
    }

    if (!force) {
      const resolved = this.resolvedContents.get(cacheKey);
      if (resolved) {
        return resolved;
      }
      const pending = this.pendingContentResolves.get(cacheKey);
      if (pending) {
        return pending;
      }
    }

    const generation = this.getContentGeneration(cacheKey);
    let pendingResolve: Promise<TableFileResolvedContent>;
    pendingResolve = model.resolveContent(resolveOptions)
      .then(
        (resolved): TableFileResolvedContent | Promise<TableFileResolvedContent> => {
          if (this.fileEditorModels.get(cacheKey) !== model) {
            throw new Error("The table content resolution was released.");
          }
          if (this.getContentGeneration(cacheKey) !== generation) {
            return this.resolveCurrentContentAfterStaleResult({
              cacheKey,
              model,
              pendingResolve,
              resolveOptions,
            });
          }
          return this.acceptResolvedContent(cacheKey, model, resolved);
        },
        (error): Promise<TableFileResolvedContent> => {
          if (this.fileEditorModels.get(cacheKey) !== model) {
            throw error;
          }
          if (this.getContentGeneration(cacheKey) !== generation) {
            return this.resolveCurrentContentAfterStaleResult({
              cacheKey,
              model,
              pendingResolve,
              resolveOptions,
            });
          }
          model.acceptResolveError(error);
          throw error;
        },
      )
      .finally(() => {
        if (this.pendingContentResolves.get(cacheKey) === pendingResolve) {
          this.pendingContentResolves.delete(cacheKey);
        }
      });
    this.pendingContentResolves.set(cacheKey, pendingResolve);
    return pendingResolve;
  }

  public async reload(resource: URI): Promise<void> {
    const cacheKey = getModelCacheKey(resource);
    if (!cacheKey) {
      throw new Error("Cannot reload a table model without a resource.");
    }

    const model = this.fileEditorModels.get(cacheKey);
    if (model) {
      await this.resolveModel(model, { force: true });
    }
  }

  public remove(resource: URI): void {
    const cacheKey = getModelCacheKey(resource);
    if (!cacheKey) {
      return;
    }

    const model = this.fileEditorModels.get(cacheKey);
    if (!model) {
      return;
    }

    model.dispose();
    this.fileEditorModels.delete(cacheKey);
    this.pendingContentResolves.delete(cacheKey);
    this.pendingResolves.delete(cacheKey);
    this.resolvedContents.delete(cacheKey);
    this.contentGenerations.delete(cacheKey);
    this.contentVersions.delete(cacheKey);
  }

  public getOrCreateModel(resource: URI, source?: TableSource | null): TableModel {
    return this.getOrCreateFileEditorModel(resource, source).model;
  }

  public getOrCreateFileEditorModel(
    resource: URI,
    source?: TableSource | null,
  ): TableFileEditorModel {
    const cacheKey = getModelCacheKey(resource);
    if (!cacheKey) {
      throw new Error("Cannot resolve a table model without a resource.");
    }

    let model = this.fileEditorModels.get(cacheKey);
    if (!model) {
      model = this._register(new TableFileEditorModel(
        resource,
        this.fileService,
        this.tableStructureParserService,
      ));
      const createdModel = model;
      this._register(createdModel.onDidChangeState(() => {
        this.onDidChangeModelEmitter.fire(createdModel.model);
      }));
      this._register(createdModel.onDidResolveContent(resolved => {
        this.cacheResolvedContent(cacheKey, resolved);
      }));
      this._register(createdModel.model.onDidChange(changedModel => {
        this.onDidChangeModelEmitter.fire(changedModel);
      }));
      this.fileEditorModels.set(cacheKey, createdModel);
    }
    return model;
  }

  private onDidFilesChange(changes: readonly IFileChange[]): void {
    for (const model of this.fileEditorModels.values()) {
      const resourceChanges = changes.filter(change =>
        change.resource.toString() === model.resource.toString()
      );
      let hadResolvedContent = false;
      if (resourceChanges.length) {
        const cacheKey = getModelCacheKey(model.resource);
        if (cacheKey) {
          hadResolvedContent = this.resolvedContents.has(cacheKey) ||
            this.pendingContentResolves.has(cacheKey);
          this.invalidateResolvedContent(cacheKey);
        }
        this.onDidChangeContentEmitter.fire(model.resource);
      }
      if (resourceChanges.some(change => change.type === FileChangeType.DELETED)) {
        model.markOrphaned(true);
        continue;
      }

      if (resourceChanges.some(isAddedFileChange)) {
        model.markOrphaned(false);
      }

      if (resourceChanges.some(isReloadingFileChange)) {
        if (model.isDirty() || model.isSaving()) {
          model.markConflict();
          continue;
        }
        if (model.model.getSnapshot().loadState.state === "idle") {
          if (hadResolvedContent) {
            void this.resolveContent(model, { force: true }).catch(() => undefined);
          }
          continue;
        }
        void this.resolveModel(model, { force: true }).catch(() => undefined);
      }
    }
  }

  private acceptResolvedContent(
    cacheKey: string,
    model: TableFileEditorModel,
    resolvedContent: TableFileEditorModelResolvedContent,
  ): TableFileResolvedContent {
    model.acceptResolvedContent(resolvedContent);
    const resolved = this.resolvedContents.get(cacheKey);
    if (!resolved) {
      throw new Error("The accepted table content was not cached.");
    }
    return resolved;
  }

  private cacheResolvedContent(
    cacheKey: string,
    resolvedContent: TableFileEditorModelResolvedContent,
  ): void {
    const previous = this.resolvedContents.get(cacheKey);
    const resolved = {
      content: resolvedContent.content,
      version: (this.contentVersions.get(cacheKey) ?? 0) + 1,
    };
    this.contentVersions.set(cacheKey, resolved.version);
    this.resolvedContents.set(cacheKey, resolved);
    if (previous) {
      this.onDidChangeContentEmitter.fire(resolvedContent.content.resource);
    }
  }

  private resolveCurrentContentAfterStaleResult({
    cacheKey,
    model,
    pendingResolve,
    resolveOptions,
  }: {
    readonly cacheKey: string;
    readonly model: TableFileEditorModel;
    readonly pendingResolve: Promise<TableFileResolvedContent>;
    readonly resolveOptions: TableFileEditorModelResolveOptions;
  }): Promise<TableFileResolvedContent> {
    const current = this.resolvedContents.get(cacheKey);
    if (current) {
      return Promise.resolve(current);
    }
    const currentPending = this.pendingContentResolves.get(cacheKey);
    if (currentPending && currentPending !== pendingResolve) {
      return currentPending;
    }
    return this.resolveContent(model, {
      ...resolveOptions,
      force: true,
    });
  }

  private getContentGeneration(cacheKey: string): number {
    return this.contentGenerations.get(cacheKey) ?? 0;
  }

  private invalidateResolvedContent(cacheKey: string): void {
    this.contentGenerations.set(cacheKey, this.getContentGeneration(cacheKey) + 1);
    this.resolvedContents.delete(cacheKey);
  }
}

const getModelCacheKey = (resource: URI | null | undefined): string | null => {
  const cacheKey = resource?.toString()?.trim() ?? "";
  return cacheKey || null;
};

const isAddedFileChange = (change: IFileChange): boolean =>
  change.type === FileChangeType.ADDED;

const isReloadingFileChange = (change: IFileChange): boolean =>
  change.type === FileChangeType.UPDATED || change.type === FileChangeType.ADDED;
