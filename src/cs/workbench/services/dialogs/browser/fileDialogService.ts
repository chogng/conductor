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

type DirectoryInputElement = HTMLInputElement & {
  webkitdirectory: boolean;
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

    const provider = this.filesService.getProvider("file");
    if (!(provider instanceof HTMLFileSystemProvider)) {
      return undefined;
    }

    const activeWindow = globalThis.window as FilePickerWindow | undefined;
    const picker = activeWindow?.showDirectoryPicker;
    if (activeWindow && WebFileSystemAccess.supported(activeWindow) && typeof picker === "function") {
      try {
        const handle = await this.pickDirectoryHandle(picker);
        return handle ? [await provider.registerDirectoryHandle(handle)] : undefined;
      } catch (error) {
        if (isDirectoryPickerCancel(error)) {
          return undefined;
        }

        if (!isInterceptedFileChooserError(error)) {
          throw error;
        }
      }
    }

    if (!this.canPickDirectoryInput()) {
      return undefined;
    }

    const files = await this.pickDirectoryInputFiles();
    if (files.length === 0) {
      return undefined;
    }

    return [await provider.registerDirectoryInputFiles(files)];
  }

  private async pickDirectoryHandle(
    picker: NonNullable<FilePickerWindow["showDirectoryPicker"]>,
  ): Promise<FileSystemDirectoryHandle | undefined> {
    const handle = await picker({
      startIn: "documents",
    });

    if (!WebFileSystemAccess.isFileSystemDirectoryHandle(handle)) {
      return undefined;
    }

    return handle;
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

  private canPickDirectoryInput(): boolean {
    if (typeof document === "undefined") {
      return false;
    }

    const input = document.createElement("input");
    return "webkitdirectory" in input;
  }

  private pickDirectoryInputFiles(): Promise<File[]> {
    return new Promise(resolve => {
      const input = document.createElement("input") as DirectoryInputElement;
      let settled = false;
      const complete = (files: File[]): void => {
        if (settled) {
          return;
        }

        settled = true;
        input.remove();
        resolve(files);
      };

      input.type = "file";
      input.multiple = true;
      input.webkitdirectory = true;
      input.style.display = "none";
      const collectFiles = (): void => {
        const files = Array.from(input.files ?? []);
        if (files.length === 0) {
          return;
        }

        complete(files);
      };

      input.addEventListener("input", collectFiles, { once: true });
      input.addEventListener("change", collectFiles, { once: true });
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

function isDirectoryPickerCancel(error: unknown): boolean {
  return error instanceof Error &&
    error.name === "AbortError" &&
    !isInterceptedFileChooserError(error);
}

function isInterceptedFileChooserError(error: unknown): boolean {
  return error instanceof Error &&
    error.name === "AbortError" &&
    error.message.includes("Page.setInterceptFileChooserDialog");
}
