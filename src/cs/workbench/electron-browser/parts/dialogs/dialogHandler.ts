/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  AbstractDialogHandler,
  type IConfirmation,
  type IConfirmationResult,
} from "src/cs/platform/dialogs/common/dialogs";
import { INativeHostService, type INativeHostService as INativeHostServiceType } from "src/cs/platform/native/common/native";

export class NativeDialogHandler extends AbstractDialogHandler {
  public constructor(
    @INativeHostService private readonly nativeHostService: INativeHostServiceType,
  ) {
    super();
  }

  public async confirm(confirmation: IConfirmation): Promise<IConfirmationResult> {
    const buttons = this.getConfirmationButtons(confirmation);
    const { response, checkboxChecked } = await this.nativeHostService.showMessageBox({
      buttons,
      cancelId: buttons.length - 1,
      checkboxChecked: confirmation.checkbox?.checked,
      checkboxLabel: confirmation.checkbox?.label,
      detail: confirmation.detail,
      message: confirmation.message,
      title: confirmation.title,
      type: this.getDialogType(confirmation.type) ?? "question",
    });

    return { checkboxChecked, confirmed: response === 0 };
  }
}
