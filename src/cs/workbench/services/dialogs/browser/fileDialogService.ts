import type { URI } from "src/cs/base/common/uri";
import {
  IFileDialogService,
  type IFileDialogService as IFileDialogServiceType,
  type IOpenDialogOptions,
} from "src/cs/platform/dialogs/common/dialogs";
import {
  IFileService,
  type IFileService as IFileServiceType,
} from "src/cs/platform/files/common/files";
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
  constructor(
    @IFileService private readonly filesService: IFileServiceType,
  ) {
    super();
  }

  public async showOpenDialog(options: IOpenDialogOptions): Promise<URI[] | undefined> {
    const schema = this.getFileSystemSchema(options);
    if (this.shouldUseSimplified(schema)) {
      return this.showOpenDialogSimplified(schema, options);
    }

    if (options.canSelectFiles && !options.canSelectFolders) {
      return this.showOpenFileDialog(options);
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

    const provider = this.filesService.getProvider("file");
    if (!(provider instanceof HTMLFileSystemProvider)) {
      return undefined;
    }

    return [await provider.registerDirectoryHandle(handle)];
  }

  private async showOpenFileDialog(options: IOpenDialogOptions): Promise<URI[] | undefined> {
    const provider = this.filesService.getProvider("file");
    if (!(provider instanceof HTMLFileSystemProvider)) {
      return undefined;
    }

    const files = await this.pickFiles(options);
    if (!files.length) {
      return undefined;
    }

    return files.map(file => provider.registerFile(file));
  }

  private pickFiles(options: IOpenDialogOptions): Promise<File[]> {
    return new Promise(resolve => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = getAcceptAttribute(options);
      input.multiple = Boolean(options.canSelectMany);
      input.style.display = "none";
      input.addEventListener("change", () => {
        const files = Array.from(input.files ?? []);
        input.remove();
        resolve(files);
      }, { once: true });
      document.body.append(input);
      input.click();
    });
  }
}

registerSingleton(IFileDialogService, FileDialogService, InstantiationType.Delayed);

const getAcceptAttribute = (options: IOpenDialogOptions): string => {
  const extensions = options.filters
    ?.flatMap(filter => filter.extensions)
    .map(extension => extension.startsWith(".") ? extension : `.${extension}`)
    .join(",");

  return extensions || "";
};
