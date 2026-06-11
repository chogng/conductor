/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { registerAction2 } from "src/cs/platform/actions/common/actions";
import {
  AddFolderAction,
  RemoveFileItemAction,
  RemoveFolderAction,
  RenameFileItemAction,
  SetFileTemplateAction,
  SliceFileWithTemplateAction,
} from "src/cs/workbench/contrib/files/browser/fileActions";

registerAction2(AddFolderAction);
registerAction2(RemoveFolderAction);
registerAction2(RemoveFileItemAction);
registerAction2(RenameFileItemAction);
registerAction2(SetFileTemplateAction);
registerAction2(SliceFileWithTemplateAction);
