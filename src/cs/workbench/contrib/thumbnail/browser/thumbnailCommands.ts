/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { ICommandHandler } from "src/cs/platform/commands/common/commands";
import { IExplorerService } from "src/cs/workbench/contrib/files/browser/files";

export const toggleThumbnailViewHandler: ICommandHandler = accessor => {
  accessor.get(IExplorerService).toggleViewLayout();
};
