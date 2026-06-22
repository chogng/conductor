/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import {
  IWorkbenchUpdateService,
  isDesktopUpdateReadyToInstall,
  UpdateCommandId,
  type DesktopUpdateStatus,
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
    const canCheckForUpdates = this.updateService.canCheckForUpdates();
    const isVisible = isDesktopUpdateVisibleInTitlebar(status);
    const isReadyToInstall = isDesktopUpdateReadyToInstall(status);
    this.titleService.patchTitlebarState({
      installUpdateCommandId: UpdateCommandId.install,
      updateCommandId: isVisible
        ? getDesktopUpdateTitlebarCommandId(status, canCheckForUpdates)
        : null,
      isUpdateReadyToInstall: isReadyToInstall,
      isUpdateVisible: isVisible,
      updateLabel: isVisible ? getDesktopUpdateTitlebarLabel(status) : null,
      updateProgressPercent: isVisible ? getDesktopUpdateTitlebarProgressPercent(status) : null,
      updateTooltip: isVisible
        ? getUpdateTooltipText(status, canCheckForUpdates)
        : null,
      updateVersion: isVisible ? status.version : null,
    });
  }
}

const isDesktopUpdateVisibleInTitlebar = (status: DesktopUpdateStatus): boolean =>
  status.status !== "idle" &&
  status.status !== "disabled" &&
  status.status !== "unsupported";

const getDesktopUpdateTitlebarCommandId = (
  status: DesktopUpdateStatus,
  canCheckForUpdates: boolean,
): string | null => {
  switch (status.status) {
    case "available":
      return UpdateCommandId.downloadNow;
    case "checking":
      return UpdateCommandId.checking;
    case "downloading":
      return UpdateCommandId.downloading;
    case "downloaded":
      return UpdateCommandId.install;
    case "updating":
      return UpdateCommandId.updating;
    case "error":
      return canCheckForUpdates ? UpdateCommandId.check : null;
    case "idle":
    case "disabled":
    case "unsupported":
      return null;
  }
};

const getDesktopUpdateTitlebarLabel = (status: DesktopUpdateStatus): string => {
  switch (status.status) {
    case "available":
      return localize("update.titlebar.download", "Download");
    case "checking":
      return localize("update.titlebar.checking", "Checking...");
    case "downloading":
      return status.progressPercent === null
        ? localize("update.titlebar.downloading", "Downloading...")
        : localize("update.titlebar.downloadingProgress", "{percent}%", {
            percent: status.progressPercent,
          });
    case "downloaded":
      return localize("update.titlebar.install", "Install");
    case "updating":
      return localize("update.titlebar.installing", "Installing...");
    case "error":
      return localize("update.titlebar.error", "Update Error");
    case "idle":
    case "disabled":
    case "unsupported":
      return localize("menu.update.available", "Update");
  }
};

const getDesktopUpdateTitlebarProgressPercent = (
  status: DesktopUpdateStatus,
): number | null =>
  status.status === "downloading" ? status.progressPercent : null;
