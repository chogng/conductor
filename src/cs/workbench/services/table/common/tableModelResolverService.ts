/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, type Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { mark } from "src/cs/base/common/performance";
import type { URI } from "src/cs/base/common/uri";
import {
  InstantiationType,
  registerSingleton,
} from "src/cs/platform/instantiation/common/extensions";
import type { BrandedService } from "src/cs/platform/instantiation/common/instantiation";
import { startPerf } from "src/cs/workbench/common/perf";
import {
  type DataResourceContentSnapshot,
  IDataResourceContentService,
  type IDataResourceContentService as IDataResourceContentServiceType,
} from "src/cs/workbench/services/dataResource/common/dataResourceContentService";
import {
  type TableSource,
} from "src/cs/workbench/services/table/common/table";
import {
  TableModel,
  type ITableModel,
  type TableModelResolvedContent,
} from "src/cs/workbench/services/table/common/model";
import {
  ITableModelService,
  type ITableModelReference,
} from "src/cs/workbench/services/table/common/resolverService";
import {
  ITableFileService,
  type ITableFileService as ITableFileServiceType,
} from "src/cs/workbench/services/tableFile/common/tablefiles";

export class TableModelResolverService extends Disposable implements ITableModelService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeModelEmitter =
    this._register(new Emitter<ITableModel>());
  public readonly onDidChangeModel: Event<ITableModel> =
    this.onDidChangeModelEmitter.event;

  private readonly pendingModelResolves = new Map<string, Promise<void>>();
  private readonly providerModels = new Map<string, TableModel>();
  private readonly references = new Map<string, { count: number; resource: URI }>();
  private readonly materializedProviderContents = new Map<string, DataResourceContentSnapshot>();

  public constructor(
    @IDataResourceContentService private readonly contentService: IDataResourceContentServiceType,
    @ITableFileService private readonly tableFileService: ITableFileServiceType,
  ) {
    super();

    this._register(this.tableFileService.onDidChangeModel(model => {
      this.onDidChangeModelEmitter.fire(model);
    }));
  }

  public canHandleResource(resource: URI): boolean {
    return this.contentService.canHandleResource(resource);
  }

  public async createModelReference(
    resource: URI,
    source?: TableSource | null,
  ): Promise<ITableModelReference> {
    mark("code/willCreateTableModelReference");
    if (!this.canHandleResource(resource)) {
      mark("code/didCreateTableModelReference");
      throw new Error(`Unsupported table file: ${resource.toString()}`);
    }

    const contentReference = await this.contentService.createContentReference(resource);
    const key = resource.toString();
    const reference = this.references.get(key);
    const previousReferenceCount = reference?.count ?? 0;
    this.references.set(key, {
      count: previousReferenceCount + 1,
      resource,
    });
    const provider = contentReference.kind === "provider";
    const endReferencePerf = startPerf("table.modelReference.resolve", {
      branch: provider ? "provider" : "file",
      previousReferenceCount,
      resourceScheme: resource.scheme,
      sourceHasSheet: Boolean(source?.sheetId),
    }, { silent: true });

    try {
      let model: TableModel;
      if (provider) {
        model = this.getOrCreateProviderModel(resource);
        await this.resolveProviderModel(model, contentReference.object);
      } else {
        const fileEditorModel = this.tableFileService.getOrCreateFileEditorModel(resource, source);
        if (contentReference.object.errorMessage) {
          await fileEditorModel.applyResolveError(
            new Error(contentReference.object.errorMessage),
          );
        } else {
          await this.tableFileService.resolveModel(fileEditorModel);
        }
        model = fileEditorModel.model;
      }
      endReferencePerf({
        loadState: model.getSnapshot().loadState.state,
        referenceCount: previousReferenceCount + 1,
        success: model.getSnapshot().loadState.state === "ready",
      });
      mark("code/didCreateTableModelReference");
      return {
        object: model,
        dispose: () => {
          this.releaseModelReference(key);
          contentReference.dispose();
        },
      };
    } catch (error) {
      this.releaseModelReference(key);
      contentReference.dispose();
      endReferencePerf({
        errorName: error instanceof Error ? error.name : "unknown",
        referenceCount: Math.max(0, previousReferenceCount),
        success: false,
      });
      mark("code/didCreateTableModelReference");
      throw error;
    }
  }

  public get(resource: URI | null | undefined): ITableModel | undefined {
    const key = resource?.toString();
    return key
      ? this.providerModels.get(key) ?? this.tableFileService.get(resource)
      : undefined;
  }

  public resolve(resource: URI, source?: TableSource | null): void {
    if (this.contentService.getContentKind(resource) === "file") {
      this.tableFileService.resolve(resource, source);
      return;
    }

    void this.contentService.createContentReference(resource).then(async reference => {
      try {
        await this.resolveProviderModel(
          this.getOrCreateProviderModel(resource),
          reference.object,
        );
      } finally {
        reference.dispose();
      }
    }).catch(() => undefined);
  }

  private releaseModelReference(key: string): void {
    const reference = this.references.get(key);
    const references = (reference?.count ?? 0) - 1;
    if (reference && references > 0) {
      this.references.set(key, {
        count: references,
        resource: reference.resource,
      });
      return;
    }

    this.references.delete(key);
    this.materializedProviderContents.delete(key);
    if (!reference) {
      return;
    }

    const providerModel = this.providerModels.get(key);
    if (providerModel) {
      providerModel.dispose();
      this.providerModels.delete(key);
      this.pendingModelResolves.delete(key);
    }
  }

  private getOrCreateProviderModel(
    resource: URI,
  ): TableModel {
    const key = resource.toString();
    let model = this.providerModels.get(key);
    if (!model) {
      model = this._register(new TableModel(resource));
      this._register(model.onDidChange(changedModel => {
        this.onDidChangeModelEmitter.fire(changedModel);
      }));
      this.providerModels.set(key, model);
    }
    return model;
  }

  private async resolveProviderModel(
    model: TableModel,
    content: DataResourceContentSnapshot,
  ): Promise<void> {
    const snapshot = model.getSnapshot();
    const key = model.resource.toString();
    if (
      snapshot.loadState.state !== "idle" &&
      this.materializedProviderContents.get(key) === content
    ) {
      return;
    }

    const pending = this.pendingModelResolves.get(key);
    if (pending) {
      await pending;
      if (this.materializedProviderContents.get(key) === content) {
        return;
      }
      return this.resolveProviderModel(model, content);
    }

    const pendingResolve = model.resolve({
      resolveContent: async () => {
        if (content.errorMessage) {
          throw new Error(content.errorMessage);
        }
        return toTableModelResolvedContent(content);
      },
    }).finally(() => {
      if (this.pendingModelResolves.get(key) === pendingResolve) {
        this.pendingModelResolves.delete(key);
      }
    });
    this.pendingModelResolves.set(key, pendingResolve);
    await pendingResolve;
    this.materializedProviderContents.set(key, content);
  }

}

const toTableModelResolvedContent = (
  snapshot: DataResourceContentSnapshot,
): TableModelResolvedContent => ({
  content: snapshot.content,
  defaultSheetId: snapshot.defaultSheetId,
  diagnostics: snapshot.diagnostics,
  format: snapshot.format,
  resource: snapshot.resource,
  sheets: snapshot.sheets,
  sourceVersion: snapshot.sourceVersion,
});

registerSingleton(
  ITableModelService,
  TableModelResolverService as unknown as new (...services: BrandedService[]) => ITableModelService,
  InstantiationType.Delayed,
);
