/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import {
  IUpdateService,
  type DesktopUpdateStatus,
  type IUpdateService as IUpdateServiceType,
} from "src/cs/platform/update/common/update";
import {
  CHECK_FOR_UPDATES_COMMAND_ID,
  DOWNLOAD_UPDATE_COMMAND_ID,
  INSTALL_UPDATE_COMMAND_ID,
  isDesktopUpdateReadyToInstall,
  UPDATE_CHECKING_COMMAND_ID,
  UPDATE_DOWNLOADING_COMMAND_ID,
  UPDATE_INSTALLING_COMMAND_ID,
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
    @IUpdateService private readonly updateService: IUpdateServiceType,
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
      installUpdateCommandId: INSTALL_UPDATE_COMMAND_ID,
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
      return DOWNLOAD_UPDATE_COMMAND_ID;
    case "checking":
      return UPDATE_CHECKING_COMMAND_ID;
    case "downloading":
      return UPDATE_DOWNLOADING_COMMAND_ID;
    case "downloaded":
      return INSTALL_UPDATE_COMMAND_ID;
    case "updating":
      return UPDATE_INSTALLING_COMMAND_ID;
    case "error":
      return canCheckForUpdates ? CHECK_FOR_UPDATES_COMMAND_ID : null;
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
