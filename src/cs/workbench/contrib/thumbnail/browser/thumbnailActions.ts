/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import { Action2, registerAction2 } from "src/cs/platform/actions/common/actions";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import { toggleThumbnailViewHandler } from "src/cs/workbench/contrib/thumbnail/browser/thumbnailCommands";

export const TOGGLE_THUMBNAIL_VIEW_COMMAND_ID = "files.toggleThumbnailView";

function registerThumbnailActions(): void {
  registerAction2(class ToggleThumbnailViewAction extends Action2 {
    public constructor() {
      super({
        id: TOGGLE_THUMBNAIL_VIEW_COMMAND_ID,
        title: localize("files.thumbnailView", "Thumbnail"),
      });
    }

    public run(accessor: ServicesAccessor): void {
      toggleThumbnailViewHandler(accessor);
    }
  });
}

registerThumbnailActions();
