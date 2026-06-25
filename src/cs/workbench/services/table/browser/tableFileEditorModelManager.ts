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
  IFileConverterBackendService,
  type IFileConverterBackendService as IFileConverterBackendServiceType,
} from "src/cs/workbench/services/files/common/fileConverterBackend";
import {
  TableFileEditorModel,
  TableModel,
} from "src/cs/workbench/services/table/common/tableFileEditorModel";
import {
  toTableSourceKey,
  type TableSource,
} from "src/cs/workbench/services/table/common/table";
import {
  type ITableModel,
  type TableModelPreviewInput,
} from "src/cs/workbench/services/table/common/tableModel";
import { TableFileEditorModelContentResolver } from "src/cs/workbench/services/table/browser/tableFileEditorModelContentResolver";

export class TableFileEditorModelManager extends Disposable {
  private readonly onDidChangeModelEmitter =
    this._register(new Emitter<ITableModel>());
  public readonly onDidChangeModel: Event<ITableModel> =
    this.onDidChangeModelEmitter.event;

  private readonly fileEditorModels = new Map<string, TableFileEditorModel>();
  private readonly pendingResolves = new Map<string, Promise<void>>();
  private readonly contentResolver: TableFileEditorModelContentResolver;

  public constructor(
    @IFileService private readonly fileService: IFileService,
    @IFileConverterBackendService private readonly fileConverterBackendService: IFileConverterBackendServiceType,
  ) {
    super();
    this.contentResolver = new TableFileEditorModelContentResolver(
      this.fileService,
      this.fileConverterBackendService,
    );
    this._register(this.fileService.onDidFilesChange(changes => {
      this.onDidFilesChange(changes);
    }));
  }

  public get(resource: URI | null | undefined): ITableModel | undefined {
    const key = getResourceKey(resource);
    return key ? this.fileEditorModels.get(key)?.model : undefined;
  }

  public getPreviewInput(source: TableSource | null | undefined): TableModelPreviewInput | null {
    const model = this.get(source?.resource);
    return model instanceof TableModel
      ? model.getPreviewInput(source)
      : model?.getSnapshot().previewInput ?? null;
  }

  public resolve(resource: URI, source?: TableSource | null): void {
    const model = this.getOrCreateFileEditorModel(resource, source);
    void this.resolveModel(model);
  }

  public async resolveModel(
    model: TableFileEditorModel,
    options: { readonly force?: boolean } = {},
  ): Promise<void> {
    if (!options.force && model.model.getSnapshot().loadState.state === "ready") {
      return;
    }

    const key = model.resource.toString();
    const pending = this.pendingResolves.get(key);
    if (pending) {
      await pending;
      return;
    }

    const pendingResolve = model.resolve().finally(() => {
      if (this.pendingResolves.get(key) === pendingResolve) {
        this.pendingResolves.delete(key);
      }
    });
    this.pendingResolves.set(key, pendingResolve);
    await pendingResolve;
  }

  public async reload(resource: URI): Promise<void> {
    const key = getResourceKey(resource);
    if (!key) {
      throw new Error("Cannot reload a table model without a resource.");
    }

    const model = this.fileEditorModels.get(key);
    if (model) {
      await this.resolveModel(model, { force: true });
    }
  }

  public remove(resource: URI): void {
    const key = getResourceKey(resource);
    if (!key) {
      return;
    }

    const model = this.fileEditorModels.get(key);
    if (!model) {
      return;
    }

    model.dispose();
    this.fileEditorModels.delete(key);
    this.pendingResolves.delete(key);
  }

  public getOrCreateModel(resource: URI, source?: TableSource | null): TableModel {
    return this.getOrCreateFileEditorModel(resource, source).model;
  }

  public getOrCreateFileEditorModel(
    resource: URI,
    source?: TableSource | null,
  ): TableFileEditorModel {
    const key = getResourceKey(resource);
    if (!key) {
      throw new Error("Cannot resolve a table model without a resource.");
    }

    let model = this.fileEditorModels.get(key);
    if (!model) {
      model = this._register(new TableFileEditorModel(
        resource,
        toTableSourceKey(source ?? { resource }),
        this.fileService,
        this.contentResolver,
      ));
      const createdModel = model;
      this._register(createdModel.onDidChangeState(() => {
        this.onDidChangeModelEmitter.fire(createdModel.model);
      }));
      this._register(createdModel.model.onDidChange(changedModel => {
        this.onDidChangeModelEmitter.fire(changedModel);
      }));
      this.fileEditorModels.set(key, createdModel);
    }
    return model;
  }

  private onDidFilesChange(changes: readonly IFileChange[]): void {
    for (const model of this.fileEditorModels.values()) {
      const resourceChanges = changes.filter(change =>
        change.resource.toString() === model.resource.toString()
      );
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
        void this.resolveModel(model, { force: true });
      }
    }
  }
}

const getResourceKey = (resource: URI | null | undefined): string | null => {
  const key = resource?.toString()?.trim() ?? "";
  return key || null;
};

const isAddedFileChange = (change: IFileChange): boolean =>
  change.type === FileChangeType.ADDED;

const isReloadingFileChange = (change: IFileChange): boolean =>
  change.type === FileChangeType.UPDATED || change.type === FileChangeType.ADDED;
