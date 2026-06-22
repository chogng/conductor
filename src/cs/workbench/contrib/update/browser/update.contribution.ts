/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import {
  IContextKeyService,
  type IContextKey,
} from "src/cs/platform/contextkey/common/contextkey";
import {
  IInstantiationService,
  type IInstantiationService as IInstantiationServiceType,
} from "src/cs/platform/instantiation/common/instantiation";
import {
  registerWorkbenchContribution2,
  WorkbenchPhase,
  type IWorkbenchContribution,
} from "src/cs/workbench/common/contributions";
import {
  CONTEXT_UPDATE_STATE,
  IWorkbenchUpdateService,
  UpdateContributionId,
  type DesktopUpdateState,
  type IWorkbenchUpdateService as IWorkbenchUpdateServiceType,
} from "src/cs/workbench/contrib/update/common/update";
import { registerDeveloperUpdateCommand, registerUpdateCommands } from "src/cs/workbench/contrib/update/browser/update";
import { ReleaseNotesEditor } from "src/cs/workbench/contrib/update/browser/releaseNotesEditor";
import { UpdateTitleBarEntry } from "src/cs/workbench/contrib/update/browser/updateTitleBarEntry";

registerDeveloperUpdateCommand();

export class UpdateContribution extends Disposable implements IWorkbenchContribution {
  private readonly updateStateContextKey: IContextKey<DesktopUpdateState>;

  public constructor(
    @IWorkbenchUpdateService private readonly updateService: IWorkbenchUpdateServiceType,
    @IContextKeyService contextKeyService: IContextKeyService,
    @IInstantiationService instantiationService: IInstantiationServiceType,
  ) {
    super();

    this.updateStateContextKey = CONTEXT_UPDATE_STATE.bindTo(contextKeyService);
    const releaseNotesEditor = this._register(instantiationService.createInstance(ReleaseNotesEditor));
    this._register(registerUpdateCommands(releaseNotesEditor));
    this._register(instantiationService.createInstance(UpdateTitleBarEntry));
    this._register(this.updateService.onDidChangeStatus(() => this.syncUpdateState()));
    this.syncUpdateState();
  }

  private syncUpdateState(): void {
    const status = this.updateService.getStatus();
    this.updateStateContextKey.set(status.status);
  }
}

registerWorkbenchContribution2(
  UpdateContributionId,
  UpdateContribution,
  WorkbenchPhase.AfterRestored,
);
