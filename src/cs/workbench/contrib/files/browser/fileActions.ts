/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import { Action2 } from "src/cs/platform/actions/common/actions";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import {
  addFolderHandler,
  closeFileItemHandler,
  closeFolderHandler,
  deleteFileItemHandler,
  renameFileItemHandler,
  setFileTemplateHandler,
} from "src/cs/workbench/contrib/files/browser/fileCommands";

export const ADD_FOLDER_COMMAND_ID = "files.addFolder";
export const CLOSE_FOLDER_COMMAND_ID = "files.closeFolder";
export const CLOSE_FILE_ITEM_COMMAND_ID = "files.item.close";
export const DELETE_FILE_ITEM_COMMAND_ID = "files.item.delete";
export const RENAME_FILE_ITEM_COMMAND_ID = "files.item.rename";
export const SET_FILE_TEMPLATE_COMMAND_ID = "files.item.setTemplate";

export class AddFolderAction extends Action2 {
  public constructor() {
    super({
      id: ADD_FOLDER_COMMAND_ID,
      title: localize("files.addFolder", "Add Folder"),
      metadata: {
        description: localize("files.actions.addFolder", "Open the Explorer folder import workflow."),
      },
    });
  }

  public run(accessor: ServicesAccessor): void {
    addFolderHandler(accessor);
  }
}

export class CloseFolderAction extends Action2 {
  public constructor() {
    super({
      id: CLOSE_FOLDER_COMMAND_ID,
      title: localize("files.closeFolder", "Close Folder"),
      metadata: {
        description: localize("files.actions.closeFolder", "Close the imported folder and stop any pending import work."),
      },
    });
  }

  public run(accessor: ServicesAccessor): void {
    closeFolderHandler(accessor);
  }
}

export class CloseFileItemAction extends Action2 {
  public constructor() {
    super({
      id: CLOSE_FILE_ITEM_COMMAND_ID,
      title: localize("files.item.close", "Close"),
      metadata: {
        description: localize("files.actions.closeFileItem", "Close an imported file in the Explorer."),
      },
    });
  }

  public run(accessor: ServicesAccessor, target: unknown): void {
    closeFileItemHandler(accessor, target);
  }
}

export class DeleteFileItemAction extends Action2 {
  public constructor() {
    super({
      id: DELETE_FILE_ITEM_COMMAND_ID,
      title: localize("files.item.delete", "Delete"),
      metadata: {
        description: localize("files.actions.deleteFileItem", "Move an imported file to the system trash."),
      },
    });
  }

  public run(accessor: ServicesAccessor, target: unknown): void {
    deleteFileItemHandler(accessor, target);
  }
}

export class RenameFileItemAction extends Action2 {
  public constructor() {
    super({
      id: RENAME_FILE_ITEM_COMMAND_ID,
      title: localize("files.item.rename", "Rename"),
      metadata: {
        description: localize("files.actions.renameFileItem", "Rename an imported file in the Explorer."),
      },
    });
  }

  public run(accessor: ServicesAccessor, target: unknown): void {
    renameFileItemHandler(accessor, target);
  }
}

export class SetFileTemplateAction extends Action2 {
  public constructor() {
    super({
      id: SET_FILE_TEMPLATE_COMMAND_ID,
      title: localize("files.item.setTemplate", "Set with Template"),
      metadata: {
        description: localize("files.actions.setFileTemplate", "Set a template selection for an imported file."),
      },
    });
  }

  public run(accessor: ServicesAccessor, target: unknown, selection: unknown): void {
    setFileTemplateHandler(accessor, target, selection);
  }
}
