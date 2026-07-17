/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { registerAction2 } from "src/cs/platform/actions/common/actions";
import {
  AddFolderAction,
  CloseFileItemAction,
  CloseFolderAction,
  DeleteFileItemAction,
  ReevaluateAllFileReviewsAction,
  ReevaluateFileReviewAction,
  RenameFileItemAction,
  SetFileTemplateAction,
} from "src/cs/workbench/contrib/files/browser/fileActions";

registerAction2(AddFolderAction);
registerAction2(CloseFolderAction);
registerAction2(CloseFileItemAction);
registerAction2(DeleteFileItemAction);
registerAction2(ReevaluateAllFileReviewsAction);
registerAction2(ReevaluateFileReviewAction);
registerAction2(RenameFileItemAction);
registerAction2(SetFileTemplateAction);
