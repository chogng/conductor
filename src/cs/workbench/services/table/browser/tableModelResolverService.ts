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
import { IFileService } from "src/cs/platform/files/common/files";
import {
  IFileConverterBackendService,
  type IFileConverterBackendService as IFileConverterBackendServiceType,
} from "src/cs/workbench/services/files/common/fileConverterBackend";
import { TableFileEditorModelManager } from "src/cs/workbench/services/table/browser/tableFileEditorModelManager";
import {
  toTableSourceKey,
  type TableSource,
} from "src/cs/workbench/services/table/common/table";
import type {
  ITableModel,
  TableModelContentSnapshot,
  TableModelLoadState,
  TableModelPreviewInput,
  TableModelSheetSnapshot,
  TableModelSnapshot,
} from "src/cs/workbench/services/table/common/tableModel";
import {
  type ITableModelContentProvider,
  ITableModelService,
  type ITableModelReference,
  type TableModelContentProviderResult,
} from "src/cs/workbench/services/table/common/resolverService";
import {
  tableFileFormatService,
  type TableFileFormat,
} from "src/cs/workbench/services/table/common/tableFileFormat";

class ProvidedTableModel extends Disposable implements ITableModel {
  private readonly onDidChangeEmitter = this._register(new Emitter<ITableModel>());
  public readonly onDidChange: Event<ITableModel> = this.onDidChangeEmitter.event;

  private content: TableModelContentSnapshot | null = null;
  private format: TableFileFormat | null = null;
  private loadState: TableModelLoadState = { state: "idle", message: "" };
  private previewInput: TableModelPreviewInput | null = null;
  private sheets: readonly TableModelSheetSnapshot[] = [];
  private sourceVersion = 0;
  private version = 0;

  public constructor(
    public readonly resource: URI,
    public readonly sourceKey: string,
    private readonly provider: ITableModelContentProvider,
  ) {
    super();
  }

  public getPreviewInput(_source?: TableSource | null): TableModelPreviewInput | null {
    return this.previewInput;
  }

  public getSnapshot(): TableModelSnapshot {
    return {
      content: this.content,
      format: this.format,
      loadState: this.loadState,
      resource: this.resource,
      previewInput: this.previewInput,
      sheets: this.sheets,
      sourceKey: this.sourceKey,
      sourceVersion: this.sourceVersion,
      version: this.version,
    };
  }

  public async resolve(source?: TableSource | null): Promise<void> {
    this.loadState = { state: "loading", message: "" };
    this.onDidChangeEmitter.fire(this);
    try {
      this.applyProviderResult(await this.provider.resolveTableModel(this.resource, source));
      this.loadState = { state: "ready", message: "" };
    } catch (error) {
      this.content = null;
      this.previewInput = null;
      this.sheets = [];
      this.loadState = { state: "error", message: getErrorMessage(error) };
    }

    this.version += 1;
    this.onDidChangeEmitter.fire(this);
  }

  private applyProviderResult(result: TableModelContentProviderResult): void {
    this.content = result.content;
    this.format = result.format ?? null;
    this.previewInput = result.previewInput ?? null;
    this.sheets = result.sheets ?? (result.content ? [{
      content: result.content,
      sheetId: this.sourceKey,
      sheetName: null,
      sourceKey: this.sourceKey,
    }] : []);
    this.sourceVersion = normalizeResourceSourceVersion(result.sourceVersion);
  }
}

export class TableModelResolverService extends Disposable implements ITableModelService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeModelEmitter =
    this._register(new Emitter<ITableModel>());
  public readonly onDidChangeModel: Event<ITableModel> =
    this.onDidChangeModelEmitter.event;

  private readonly tableFileEditorModelManager: TableFileEditorModelManager;

  private readonly contentProviders: ITableModelContentProvider[] = [];
  private readonly pendingProviderResolves = new Map<string, Promise<void>>();
  private readonly providerModels = new Map<string, ProvidedTableModel>();
  private readonly references = new Map<string, { count: number; resource: URI }>();

  public constructor(
    @IFileService fileService: IFileService,
    @IFileConverterBackendService fileConverterBackendService: IFileConverterBackendServiceType,
  ) {
    super();

    this.tableFileEditorModelManager = this._register(new TableFileEditorModelManager(
      fileService,
      fileConverterBackendService,
    ));
    this._register(this.tableFileEditorModelManager.onDidChangeModel(model => {
      this.onDidChangeModelEmitter.fire(model);
    }));
  }

  public canHandleResource(resource: URI): boolean {
    return tableFileFormatService.canHandle(resource) || Boolean(this.findContentProvider(resource));
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
      const model = this.getOrCreateProviderModel(resource, provider, source);
      await this.resolveProviderModel(model, source);
      return {
        object: model,
        dispose: () => {
          this.releaseModelReference(key);
        },
      };
    }

    const fileEditorModel = this.tableFileEditorModelManager.getOrCreateFileEditorModel(resource, source);
    await this.tableFileEditorModelManager.resolveModel(fileEditorModel);

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
      ? this.providerModels.get(key) ?? this.tableFileEditorModelManager.get(resource)
      : undefined;
  }

  public getPreviewInput(source: TableSource | null | undefined): TableModelPreviewInput | null {
    const key = source?.resource?.toString();
    if (key) {
      const providerInput = this.providerModels.get(key)?.getPreviewInput(source);
      if (providerInput) {
        return providerInput;
      }
    }

    return this.tableFileEditorModelManager.getPreviewInput(source);
  }

  public resolve(resource: URI, source?: TableSource | null): void {
    const provider = this.findContentProvider(resource);
    if (provider) {
      void this.resolveProviderModel(this.getOrCreateProviderModel(resource, provider, source), source);
      return;
    }

    this.tableFileEditorModelManager.resolve(resource, source);
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

    this.tableFileEditorModelManager.remove(reference.resource);
  }

  private findContentProvider(resource: URI): ITableModelContentProvider | null {
    return this.contentProviders.find(provider => provider.canHandleResource(resource)) ?? null;
  }

  private getOrCreateProviderModel(
    resource: URI,
    provider: ITableModelContentProvider,
    source?: TableSource | null,
  ): ProvidedTableModel {
    const key = resource.toString();
    let model = this.providerModels.get(key);
    if (!model) {
      model = this._register(new ProvidedTableModel(
        resource,
        toTableSourceKey(source ?? { resource }),
        provider,
      ));
      this._register(model.onDidChange(changedModel => {
        this.onDidChangeModelEmitter.fire(changedModel);
      }));
      this.providerModels.set(key, model);
    }
    return model;
  }

  private async resolveProviderModel(
    model: ProvidedTableModel,
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

    const pendingResolve = model.resolve(source).finally(() => {
      if (this.pendingProviderResolves.get(key) === pendingResolve) {
        this.pendingProviderResolves.delete(key);
      }
    });
    this.pendingProviderResolves.set(key, pendingResolve);
    await pendingResolve;
  }
}

const normalizeResourceSourceVersion = (value: unknown): number =>
  Math.max(0, Math.floor(Number(value) || 0));

const getErrorMessage = (error: unknown): string =>
  error instanceof Error && error.message.trim()
    ? error.message
    : "The table model provider could not resolve the resource.";

registerSingleton(
  ITableModelService,
  TableModelResolverService as unknown as new (...services: BrandedService[]) => ITableModelService,
  InstantiationType.Delayed,
);
