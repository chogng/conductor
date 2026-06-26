/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, type Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import {
  InstantiationType,
  registerSingleton,
} from "src/cs/platform/instantiation/common/extensions";
import type { BrandedService } from "src/cs/platform/instantiation/common/instantiation";
import {
  type TableSource,
} from "src/cs/workbench/services/table/common/table";
import {
  TableModel,
  type ITableModel,
  type TableModelResolvedContent,
} from "src/cs/workbench/services/table/common/model";
import {
  type ITableModelContentProvider,
  ITableModelService,
  type ITableModelReference,
  type TableModelContentProviderResult,
} from "src/cs/workbench/services/table/common/resolverService";
import {
  ITableFileService,
  type ITableFileService as ITableFileServiceType,
} from "src/cs/workbench/services/tablefile/common/tablefiles";

export class TableModelResolverService extends Disposable implements ITableModelService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeModelEmitter =
    this._register(new Emitter<ITableModel>());
  public readonly onDidChangeModel: Event<ITableModel> =
    this.onDidChangeModelEmitter.event;

  private readonly contentProviders: ITableModelContentProvider[] = [];
  private readonly pendingProviderResolves = new Map<string, Promise<void>>();
  private readonly providerModels = new Map<string, TableModel>();
  private readonly references = new Map<string, { count: number; resource: URI }>();

  public constructor(
    @ITableFileService private readonly tableFileService: ITableFileServiceType,
  ) {
    super();

    this._register(this.tableFileService.onDidChangeModel(model => {
      this.onDidChangeModelEmitter.fire(model);
    }));
  }

  public canHandleResource(resource: URI): boolean {
    return this.tableFileService.canHandleResource(resource) || Boolean(this.findContentProvider(resource));
  }

  public registerContentProvider(provider: ITableModelContentProvider): { dispose(): void } {
    this.contentProviders.push(provider);
    return {
      dispose: () => {
        const index = this.contentProviders.indexOf(provider);
        if (index >= 0) {
          this.contentProviders.splice(index, 1);
        }
        provider.dispose();
      },
    };
  }

  public async createModelReference(
    resource: URI,
    source?: TableSource | null,
  ): Promise<ITableModelReference> {
    if (!this.canHandleResource(resource)) {
      throw new Error(`Unsupported table file: ${resource.toString()}`);
    }

    const key = resource.toString();
    const reference = this.references.get(key);
    this.references.set(key, {
      count: (reference?.count ?? 0) + 1,
      resource,
    });

    const provider = this.findContentProvider(resource);
    if (provider) {
      const model = this.getOrCreateProviderModel(resource, source);
      await this.resolveProviderModel(model, provider, source);
      return {
        object: model,
        dispose: () => {
          this.releaseModelReference(key);
        },
      };
    }

    const fileEditorModel = this.tableFileService.getOrCreateFileEditorModel(resource, source);
    await this.tableFileService.resolveModel(fileEditorModel);

    return {
      object: fileEditorModel.model,
      dispose: () => {
        this.releaseModelReference(key);
      },
    };
  }

  public get(resource: URI | null | undefined): ITableModel | undefined {
    const key = resource?.toString();
    return key
      ? this.providerModels.get(key) ?? this.tableFileService.get(resource)
      : undefined;
  }

  public resolve(resource: URI, source?: TableSource | null): void {
    const provider = this.findContentProvider(resource);
    if (provider) {
      void this.resolveProviderModel(this.getOrCreateProviderModel(resource, source), provider, source);
      return;
    }

    this.tableFileService.resolve(resource, source);
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
    if (!reference) {
      return;
    }

    const providerModel = this.providerModels.get(key);
    if (providerModel) {
      providerModel.dispose();
      this.providerModels.delete(key);
      this.pendingProviderResolves.delete(key);
      return;
    }

    this.tableFileService.remove(reference.resource);
  }

  private findContentProvider(resource: URI): ITableModelContentProvider | null {
    return this.contentProviders.find(provider => provider.canHandleResource(resource)) ?? null;
  }

  private getOrCreateProviderModel(
    resource: URI,
    source?: TableSource | null,
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
    provider: ITableModelContentProvider,
    source?: TableSource | null,
  ): Promise<void> {
    if (model.getSnapshot().loadState.state === "ready") {
      return;
    }

    const key = model.resource.toString();
    const pending = this.pendingProviderResolves.get(key);
    if (pending) {
      await pending;
      return;
    }

    const pendingResolve = model.resolve({
      resolveContent: async () => {
        const result = await provider.resolveTableModel(model.resource, source);
        return toProviderResolvedContent(result);
      },
    }).finally(() => {
      if (this.pendingProviderResolves.get(key) === pendingResolve) {
        this.pendingProviderResolves.delete(key);
      }
    });
    this.pendingProviderResolves.set(key, pendingResolve);
    await pendingResolve;
  }

}

const toProviderResolvedContent = (
  result: TableModelContentProviderResult,
): TableModelResolvedContent => ({
  content: result.content,
  format: result.format ?? null,
  sheets: result.sheets,
  sourceVersion: result.sourceVersion,
});

registerSingleton(
  ITableModelService,
  TableModelResolverService as unknown as new (...services: BrandedService[]) => ITableModelService,
  InstantiationType.Delayed,
);
