/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { URI } from "src/cs/base/common/uri";
import type { IFileDialogService } from "src/cs/platform/dialogs/common/dialogs";
import { HTMLFileSystemProvider } from "src/cs/platform/files/browser/htmlFileSystemProvider";
import {
  detectFolderImportSupport,
  type FolderImportSupport,
} from "src/cs/platform/files/browser/webFileSystemAccess";
import type { IFileService } from "src/cs/platform/files/common/files";
import { localize } from "src/cs/nls";
import { notificationService } from "src/cs/workbench/services/notification/common/notificationService";
import type { IPathService } from "src/cs/workbench/services/path/common/pathService";

export const pickImportFolder = async ({
  dialogsService,
  pathService,
}: {
  readonly dialogsService: IFileDialogService;
  readonly pathService: IPathService;
}): Promise<URI | null> => {
  const folders = await dialogsService.showOpenDialog({
    canSelectFolders: true,
    defaultUri: pathService.userHome({ preferLocal: true }),
    title: localize("import.pickFolderTitle", "Select a folder to import"),
    openLabel: localize("import.openFolderButton", "Open Folder"),
  });
  const folder = folders?.[0] ? URI.revive(folders[0]) : null;
  if (!folder) {
    return null;
  }

  return folder;
};

export const getFolderImportUnsupportedMessage = (
  support: FolderImportSupport,
): string => support.reason === "no-webassembly"
  ? localize(
    "files.importUnsupportedWasm",
    "The current browser environment cannot run the preview component. WebAssembly may be disabled. Open this page in a standalone Chrome or Edge window, then import again.",
  )
  : localize(
    "files.importUnsupportedPicker",
    "The current browser environment does not support folder selection. Open this page in a standalone Chrome or Edge window, then import again.",
  );

export const getFolderImportSupportForFileService = (
  filesService: IFileService,
): FolderImportSupport => {
  const provider = filesService.getProvider("file");
  if (provider instanceof HTMLFileSystemProvider) {
    return detectFolderImportSupport();
  }

  return { reason: null, supported: true };
};

export const canImportFolderWithFileService = (
  filesService: IFileService,
): boolean => {
  const support = getFolderImportSupportForFileService(filesService);
  if (support.supported) {
    return true;
  }

  notificationService.showToast({
    id: "files.importFolderUnsupported",
    message: getFolderImportUnsupportedMessage(support),
    type: "warning",
  });
  return false;
};
