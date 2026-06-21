/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import { Action2 } from "src/cs/platform/actions/common/actions";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import {
  ADD_FOLDER_ACTION_ID,
  CLOSE_FOLDER_ACTION_ID,
  REMOVE_FILE_ITEM_COMMAND_ID,
  RENAME_FILE_ITEM_COMMAND_ID,
  SET_FILE_TEMPLATE_COMMAND_ID,
  SLICE_FILE_WITH_TEMPLATE_COMMAND_ID,
} from "src/cs/workbench/contrib/files/common/files";
import {
  addFolderHandler,
  closeFolderHandler,
  removeFileItemHandler,
  renameFileItemHandler,
  setFileTemplateHandler,
  sliceFileWithTemplateHandler,
} from "src/cs/workbench/contrib/files/browser/fileCommands";

export class AddFolderAction extends Action2 {
  public constructor() {
    super({
      id: ADD_FOLDER_ACTION_ID,
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
      id: CLOSE_FOLDER_ACTION_ID,
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

export class RemoveFileItemAction extends Action2 {
  public constructor() {
    super({
      id: REMOVE_FILE_ITEM_COMMAND_ID,
      title: localize("files.item.delete", "Delete"),
      metadata: {
        description: localize("files.actions.removeFileItem", "Remove an imported file from the Explorer."),
      },
    });
  }

  public run(accessor: ServicesAccessor, fileId: unknown): void {
    removeFileItemHandler(accessor, fileId);
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

  public run(accessor: ServicesAccessor, fileId: unknown): void {
    renameFileItemHandler(accessor, fileId);
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

  public run(accessor: ServicesAccessor, fileId: unknown, selection: unknown): void {
    setFileTemplateHandler(accessor, fileId, selection);
  }
}

export class SliceFileWithTemplateAction extends Action2 {
  public constructor() {
    super({
      id: SLICE_FILE_WITH_TEMPLATE_COMMAND_ID,
      title: localize("files.item.sliceWithTemplate", "Slice with Template"),
      metadata: {
        description: localize("files.actions.sliceFileWithTemplate", "Slice an imported file with a template."),
      },
    });
  }

  public run(accessor: ServicesAccessor, fileId: unknown): void {
    sliceFileWithTemplateHandler(accessor, fileId);
  }
}
