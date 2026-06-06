import type { URI } from "src/cs/base/common/uri";
import {
  CommandsRegistry,
  type ICommandHandler,
} from "src/cs/platform/commands/common/commands";
import { IFileDialogService } from "src/cs/platform/dialogs/common/dialogs";
import { IFileService } from "src/cs/platform/files/common/files";
import { IPathService } from "src/cs/workbench/services/path/common/pathService";
import { IMPORT_FOLDER_COMMAND_ID } from "src/cs/workbench/contrib/files/common/files";
import {
  canImportFolderWithFileService,
  pickImportFolder,
} from "src/cs/workbench/contrib/files/browser/fileCommands";

export const importFolderHandler: ICommandHandler<[], Promise<URI | null>> = async (accessor) => {
  const filesService = accessor.get(IFileService);
  if (!canImportFolderWithFileService(filesService)) {
    return null;
  }

  return pickImportFolder({
    dialogsService: accessor.get(IFileDialogService),
    pathService: accessor.get(IPathService),
  });
};

CommandsRegistry.registerCommand({
  id: IMPORT_FOLDER_COMMAND_ID,
  handler: importFolderHandler,
});
