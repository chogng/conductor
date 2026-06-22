/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import {
  IWorkbenchUpdateService,
  isDesktopUpdateReadyToInstall,
  UpdateCommandId,
  type IWorkbenchUpdateService as IWorkbenchUpdateServiceType,
} from "src/cs/workbench/contrib/update/common/update";
import { getUpdateTooltipText } from "src/cs/workbench/contrib/update/browser/updateTooltip";
import {
  ITitleService,
  type ITitleService as ITitleServiceType,
} from "src/cs/workbench/services/title/browser/titleService";

/**
 * Projects the workbench update service state into the Conductor titlebar.
 * The update service owns state; the titlebar entry only renders its snapshot.
 */
export class UpdateTitleBarEntry extends Disposable {
  public constructor(
    @IWorkbenchUpdateService private readonly updateService: IWorkbenchUpdateServiceType,
    @ITitleService private readonly titleService: ITitleServiceType,
  ) {
    super();

    this._register(this.updateService.onDidChangeStatus(() => this.syncTitlebarState()));
    this.syncTitlebarState();
  }

  private syncTitlebarState(): void {
    const status = this.updateService.getStatus();
    const isReadyToInstall = isDesktopUpdateReadyToInstall(status);
    this.titleService.patchTitlebarState({
      installUpdateCommandId: UpdateCommandId.install,
      isUpdateReadyToInstall: isReadyToInstall,
      updateTooltip: isReadyToInstall
        ? getUpdateTooltipText(status, this.updateService.canCheckForUpdates())
        : null,
      updateVersion: isReadyToInstall ? status.version : null,
    });
  }
}
