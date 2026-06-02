import type { URI } from "src/cs/base/common/uri";
import {
  IFileDialogService,
  type IFileDialogService as IFileDialogServiceType,
  type IOpenDialogOptions,
} from "src/cs/platform/dialogs/common/dialogs";
import { fileService } from "src/cs/platform/files/browser/fileService";
import { HTMLFileSystemProvider } from "src/cs/platform/files/browser/htmlFileSystemProvider";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  WebFileSystemAccess,
  type FileSystemDirectoryHandle,
} from "src/cs/platform/files/browser/webFileSystemAccess";
import { AbstractFileDialogService } from "src/cs/workbench/services/dialogs/browser/abstractFileDialogService";

type FilePickerWindow = Window & typeof globalThis & {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: "read" | "readwrite";
    startIn?: string;
  }) => Promise<FileSystemDirectoryHandle>;
};

export class FileDialogService extends AbstractFileDialogService implements IFileDialogServiceType {
  public async showOpenDialog(options: IOpenDialogOptions): Promise<URI[] | undefined> {
    const schema = this.getFileSystemSchema(options);
    if (this.shouldUseSimplified(schema)) {
      return this.showOpenDialogSimplified(schema, options);
    }

    if (!options.canSelectFolders || options.canSelectFiles) {
      return undefined;
    }

    const activeWindow = globalThis.window as FilePickerWindow | undefined;
    const picker = activeWindow?.showDirectoryPicker;
    if (!activeWindow || !WebFileSystemAccess.supported(activeWindow) || typeof picker !== "function") {
      return undefined;
    }

    const handle = await picker({
      id: "conductor-import-folder",
      mode: "read",
    });

    if (!WebFileSystemAccess.isFileSystemDirectoryHandle(handle)) {
      return undefined;
    }

    const provider = fileService.getProvider("file");
    if (!(provider instanceof HTMLFileSystemProvider)) {
      return undefined;
    }

    return [provider.registerDirectoryHandle(handle)];
  }
}

registerSingleton(IFileDialogService, FileDialogService, InstantiationType.Delayed);
