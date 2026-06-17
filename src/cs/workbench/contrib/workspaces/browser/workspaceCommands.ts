import { URI } from "src/cs/base/common/uri";
import {
  CommandsRegistry,
  type ICommandHandler,
} from "src/cs/platform/commands/common/commands";
import { IFileDialogService } from "src/cs/platform/dialogs/common/dialogs";
import { IFileService } from "src/cs/platform/files/common/files";
import {
  IStorageService,
  StorageScope,
  StorageTarget,
} from "src/cs/platform/storage/common/storage";
import { INotificationService } from "src/cs/workbench/services/notification/common/notificationService";
import { IPathService } from "src/cs/workbench/services/path/common/pathService";
import {
  canImportFolderWithFileService,
  pickImportFolder,
} from "src/cs/workbench/contrib/files/browser/fileImportExport";
import { ADD_WORKSPACE_FOLDER_COMMAND_ID } from "src/cs/workbench/services/workspaces/common/workspaces";

const LAST_SELECTED_WORKSPACE_FOLDER_STORAGE_KEY = "workspaces.lastSelectedFolder";

export const addWorkspaceFolderHandler: ICommandHandler<[], Promise<URI | null>> = async (accessor) => {
  const dialogsService = accessor.get(IFileDialogService);
  const filesService = accessor.get(IFileService);
  const notificationService = accessor.get(INotificationService);
  const pathService = accessor.get(IPathService);
  const storageService = accessor.get(IStorageService);

  if (!canImportFolderWithFileService(
    filesService,
    notificationService,
  )) {
    return null;
  }

  const folder = await pickImportFolder({
    defaultUri: resolveDefaultWorkspaceFolderUri(pathService, storageService),
    dialogsService,
    pathService,
  });

  if (folder) {
    storageService.store(
      LAST_SELECTED_WORKSPACE_FOLDER_STORAGE_KEY,
      folder.toString(),
      StorageScope.PROFILE,
      StorageTarget.USER,
    );
  }

  return folder;
};

function resolveDefaultWorkspaceFolderUri(
  pathService: IPathService,
  storageService: IStorageService,
): URI {
  const storedFolder = getStoredLastSelectedWorkspaceFolder(storageService);
  if (storedFolder) {
    return storedFolder;
  }

  return pathService.userHome({ preferLocal: true });
}

function getStoredLastSelectedWorkspaceFolder(storageService: IStorageService): URI | null {
  const storedValue = storageService.get(
    LAST_SELECTED_WORKSPACE_FOLDER_STORAGE_KEY,
    StorageScope.PROFILE,
  )?.trim();
  if (!storedValue) {
    return null;
  }

  try {
    return URI.parse(storedValue);
  } catch {
    return null;
  }
}

CommandsRegistry.registerCommand({
  id: ADD_WORKSPACE_FOLDER_COMMAND_ID,
  handler: addWorkspaceFolderHandler,
});
