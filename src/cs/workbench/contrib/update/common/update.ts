/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { RawContextKey } from "src/cs/platform/contextkey/common/contextkey";
import {
  DEFAULT_DESKTOP_UPDATE_STATUS,
  type DesktopUpdateState,
  type DesktopUpdateStatus,
} from "src/cs/platform/update/common/update";

export const UpdateContributionId = "workbench.contrib.update";

export const APPLY_UPDATE_COMMAND_ID = "_update.applyupdate";
export const CHECK_FOR_UPDATES_COMMAND_ID = "update.check";
export const UPDATE_CHECKING_COMMAND_ID = "update.checking";
export const DOWNLOAD_UPDATE_COMMAND_ID = "update.downloadNow";
export const UPDATE_DOWNLOADING_COMMAND_ID = "update.downloading";
export const INSTALL_UPDATE_COMMAND_ID = "update.install";
export const RESTART_TO_UPDATE_COMMAND_ID = "update.restart";
export const SHOW_CURRENT_RELEASE_NOTES_COMMAND_ID = "update.showCurrentReleaseNotes";
export const GET_UPDATE_STATE_COMMAND_ID = "_update.state";
export const UPDATE_INSTALLING_COMMAND_ID = "update.updating";

export const CONTEXT_UPDATE_STATE = new RawContextKey<DesktopUpdateState>(
  "updateState",
  DEFAULT_DESKTOP_UPDATE_STATUS.status,
);

export const isDesktopUpdateReadyToInstall = (
  status: DesktopUpdateStatus,
): boolean => status.status === "downloaded";
