/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { ExplorerViewLayout } from "src/cs/workbench/contrib/files/common/explorer";

export const FilesViewId = "workbench.files";
export const ADD_FOLDER_ACTION_ID = "files.addFolder";
export const MORE_ACTIONS_ACTION_ID = "files.moreActions";
export const REMOVE_FOLDER_ACTION_ID = "files.removeFolder";
export const TOGGLE_THUMBNAIL_VIEW_ACTION_ID = "files.toggleThumbnailView";
export const REMOVE_FILE_ITEM_COMMAND_ID = "files.item.delete";
export const RENAME_FILE_ITEM_COMMAND_ID = "files.item.rename";
export const SET_FILE_TEMPLATE_COMMAND_ID = "files.item.setTemplate";
export const SLICE_FILE_WITH_TEMPLATE_COMMAND_ID = "files.item.sliceWithTemplate";

export type FilesViewLayout = ExplorerViewLayout;
