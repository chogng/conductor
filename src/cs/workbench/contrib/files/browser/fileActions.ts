/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import { Action2, registerAction2 } from "src/cs/platform/actions/common/actions";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import {
  ADD_FOLDER_ACTION_ID,
  REMOVE_FILE_ITEM_COMMAND_ID,
  REMOVE_FOLDER_ACTION_ID,
  RENAME_FILE_ITEM_COMMAND_ID,
  SET_FILE_TEMPLATE_COMMAND_ID,
  SLICE_FILE_WITH_TEMPLATE_COMMAND_ID,
} from "src/cs/workbench/contrib/files/common/files";
import {
  addFolderHandler,
  removeFileItemHandler,
  removeFolderHandler,
  renameFileItemHandler,
  setFileTemplateHandler,
  sliceFileWithTemplateHandler,
} from "src/cs/workbench/contrib/files/browser/fileCommands";
import { notificationService } from "src/cs/workbench/services/notification/common/notificationService";

export const showCreateFolderUnsupported = (): void => {
  notificationService.showToast({
    id: "files.createFolderUnsupported",
    message: localize(
      "files.createFolderUnsupported",
      "The current import list does not support creating empty folders yet.",
    ),
    type: "info",
  });
};

function registerFileActions(): void {
  registerAction2(class AddFolderAction extends Action2 {
    public constructor() {
      super({
        id: ADD_FOLDER_ACTION_ID,
        title: localize("files.addFolder", "Add Folder"),
      });
    }

    public run(accessor: ServicesAccessor): void {
      addFolderHandler(accessor);
    }
  });

  registerAction2(class RemoveFolderAction extends Action2 {
    public constructor() {
      super({
        id: REMOVE_FOLDER_ACTION_ID,
        title: localize("files.removeFolder", "Remove Folder"),
      });
    }

    public run(accessor: ServicesAccessor): void {
      removeFolderHandler(accessor);
    }
  });

  registerAction2(class RemoveFileItemAction extends Action2 {
    public constructor() {
      super({
        id: REMOVE_FILE_ITEM_COMMAND_ID,
        title: localize("files.item.delete", "Delete"),
      });
    }

    public run(accessor: ServicesAccessor, fileId: unknown): void {
      removeFileItemHandler(accessor, fileId);
    }
  });

  registerAction2(class RenameFileItemAction extends Action2 {
    public constructor() {
      super({
        id: RENAME_FILE_ITEM_COMMAND_ID,
        title: localize("files.item.rename", "Rename"),
      });
    }

    public run(accessor: ServicesAccessor, fileId: unknown): void {
      renameFileItemHandler(accessor, fileId);
    }
  });

  registerAction2(class SetFileTemplateAction extends Action2 {
    public constructor() {
      super({
        id: SET_FILE_TEMPLATE_COMMAND_ID,
        title: localize("files.item.setTemplate", "Set with Template"),
      });
    }

    public run(accessor: ServicesAccessor, fileId: unknown, selection: unknown): void {
      setFileTemplateHandler(accessor, fileId, selection);
    }
  });

  registerAction2(class SliceFileWithTemplateAction extends Action2 {
    public constructor() {
      super({
        id: SLICE_FILE_WITH_TEMPLATE_COMMAND_ID,
        title: localize("files.item.sliceWithTemplate", "Slice with Template"),
      });
    }

    public run(accessor: ServicesAccessor, fileId: unknown, selection: unknown): void {
      sliceFileWithTemplateHandler(accessor, fileId, selection);
    }
  });
}

registerFileActions();
