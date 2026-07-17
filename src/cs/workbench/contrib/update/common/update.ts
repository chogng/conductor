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

export const CONTEXT_UPDATE_STATE = new RawContextKey<DesktopUpdateState>(
  "updateState",
  DEFAULT_DESKTOP_UPDATE_STATUS.status,
);

export const isDesktopUpdateReadyToInstall = (
  status: DesktopUpdateStatus,
): boolean => status.status === "downloaded";
