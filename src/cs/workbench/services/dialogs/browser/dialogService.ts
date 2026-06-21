/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import {
  IDialogService,
  type IConfirmation,
  type IConfirmationResult,
  type IDialogService as IDialogServiceType,
} from "src/cs/platform/dialogs/common/dialogs";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";

export class BrowserDialogService extends Disposable implements IDialogServiceType {
  public declare readonly _serviceBrand: undefined;

  private readonly onWillShowDialogEmitter = this._register(new Emitter<void>());
  private readonly onDidShowDialogEmitter = this._register(new Emitter<void>());

  public readonly onWillShowDialog = this.onWillShowDialogEmitter.event;
  public readonly onDidShowDialog = this.onDidShowDialogEmitter.event;

  public async confirm(confirmation: IConfirmation): Promise<IConfirmationResult> {
    this.onWillShowDialogEmitter.fire();
    try {
      const message = confirmation.detail
        ? `${confirmation.message}\n\n${confirmation.detail}`
        : confirmation.message;
      return {
        checkboxChecked: confirmation.checkbox?.checked,
        confirmed: window.confirm(message),
      };
    } finally {
      this.onDidShowDialogEmitter.fire();
    }
  }
}

registerSingleton(IDialogService, BrowserDialogService, InstantiationType.Delayed);
