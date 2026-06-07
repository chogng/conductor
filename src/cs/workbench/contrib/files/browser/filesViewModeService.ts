import { Emitter, type Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { FilesViewMode } from "src/cs/workbench/contrib/files/common/files";

export const IFilesViewModeService = createDecorator<IFilesViewModeService>("filesViewModeService");

export interface IFilesViewModeService {
  readonly _serviceBrand: undefined;

  readonly onDidChangeViewMode: Event<FilesViewMode>;
  readonly viewMode: FilesViewMode;

  setViewMode(viewMode: FilesViewMode): void;
  toggleViewMode(): void;
}

export class FilesViewModeService extends Disposable implements IFilesViewModeService {
  declare readonly _serviceBrand: undefined;

  private readonly onDidChangeViewModeEmitter = this._register(new Emitter<FilesViewMode>());
  public readonly onDidChangeViewMode = this.onDidChangeViewModeEmitter.event;

  private currentViewMode: FilesViewMode = "tree";

  public get viewMode(): FilesViewMode {
    return this.currentViewMode;
  }

  public setViewMode(viewMode: FilesViewMode): void {
    if (this.currentViewMode === viewMode) {
      return;
    }

    this.currentViewMode = viewMode;
    this.onDidChangeViewModeEmitter.fire(viewMode);
  }

  public toggleViewMode(): void {
    this.setViewMode(this.currentViewMode === "thumbnail" ? "tree" : "thumbnail");
  }
}

registerSingleton(IFilesViewModeService, FilesViewModeService, InstantiationType.Delayed);
