import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import type { WorkbenchMainPart } from "src/cs/workbench/common/contextkeys";
import {
  IWorkbenchViewModeService,
  type IWorkbenchViewModeService as IWorkbenchViewModeServiceType,
} from "src/cs/workbench/services/views/common/workbenchViewModeService";

export class WorkbenchViewModeService extends Disposable implements IWorkbenchViewModeServiceType {
  declare readonly _serviceBrand: undefined;

  private readonly onDidChangeViewModeEmitter = this._register(new Emitter<WorkbenchMainPart>());
  public readonly onDidChangeViewMode = this.onDidChangeViewModeEmitter.event;

  private currentViewMode: WorkbenchMainPart = "table";

  public get viewMode(): WorkbenchMainPart {
    return this.currentViewMode;
  }

  public setViewMode(viewMode: WorkbenchMainPart): void {
    if (this.currentViewMode === viewMode) {
      return;
    }

    this.currentViewMode = viewMode;
    this.onDidChangeViewModeEmitter.fire(viewMode);
  }
}

registerSingleton(IWorkbenchViewModeService, WorkbenchViewModeService, InstantiationType.Delayed);
