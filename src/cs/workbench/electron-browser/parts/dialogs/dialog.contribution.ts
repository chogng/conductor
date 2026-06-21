/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import {
  IDialogService,
  type IConfirmation,
  type IConfirmationResult,
  type IDialogHandler,
  type IDialogService as IDialogServiceType,
} from "src/cs/platform/dialogs/common/dialogs";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { IInstantiationService, type IInstantiationService as IInstantiationServiceType } from "src/cs/platform/instantiation/common/instantiation";
import { NativeDialogHandler } from "src/cs/workbench/electron-browser/parts/dialogs/dialogHandler";

class NativeDialogService extends Disposable implements IDialogServiceType {
  public declare readonly _serviceBrand: undefined;

  private readonly onWillShowDialogEmitter = this._register(new Emitter<void>());
  private readonly onDidShowDialogEmitter = this._register(new Emitter<void>());
  private readonly handler: IDialogHandler;

  public readonly onWillShowDialog = this.onWillShowDialogEmitter.event;
  public readonly onDidShowDialog = this.onDidShowDialogEmitter.event;

  public constructor(
    @IInstantiationService instantiationService: IInstantiationServiceType,
  ) {
    super();
    this.handler = instantiationService.createInstance(NativeDialogHandler);
  }

  public async confirm(confirmation: IConfirmation): Promise<IConfirmationResult> {
    this.onWillShowDialogEmitter.fire();
    try {
      return await this.handler.confirm(confirmation);
    } finally {
      this.onDidShowDialogEmitter.fire();
    }
  }
}

registerSingleton(IDialogService, NativeDialogService, InstantiationType.Delayed);
