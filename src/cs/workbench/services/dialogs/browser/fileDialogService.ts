import type { URI } from "src/cs/base/common/uri";
import { getMediaOrTextMime, Mimes } from "src/cs/base/common/mime";
import {
  IFileDialogService,
  type IFileDialogService as IFileDialogServiceType,
  type IOpenDialogOptions,
  type ISaveDialogOptions,
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
  type FileSystemFileHandle,
} from "src/cs/platform/files/browser/webFileSystemAccess";
import { AbstractFileDialogService } from "src/cs/workbench/services/dialogs/browser/abstractFileDialogService";

type FilePickerWindow = Window & typeof globalThis & {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: "read" | "readwrite";
    startIn?: string;
  }) => Promise<FileSystemDirectoryHandle>;
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    types?: readonly {
      readonly accept: Record<string, readonly string[]>;
      readonly description: string;
    }[];
  }) => Promise<readonly FileSystemFileHandle[]>;
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: readonly {
      readonly accept: Record<string, readonly string[]>;
      readonly description: string;
    }[];
  }) => Promise<FileSystemFileHandle>;
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
        if (isPickerCancel(error)) {
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

  public override canSaveFile(): boolean {
    const activeWindow = globalThis.window as FilePickerWindow | undefined;
    return Boolean(activeWindow && WebFileSystemAccess.canSaveFile(activeWindow));
  }

  public override async showSaveDialog(options: ISaveDialogOptions): Promise<URI | undefined> {
    const schema = this.getFileSystemSchema(options);
    if (this.shouldUseSimplified(schema)) {
      return undefined;
    }

    const provider = this.filesService.getProvider("file");
    if (!(provider instanceof HTMLFileSystemProvider)) {
      return undefined;
    }

    const activeWindow = globalThis.window as FilePickerWindow | undefined;
    const picker = activeWindow?.showSaveFilePicker;
    if (!activeWindow || !WebFileSystemAccess.canSaveFile(activeWindow) || typeof picker !== "function") {
      return undefined;
    }

    try {
      const handle = await picker({
        suggestedName: getDefaultSaveFileName(options),
        types: getSaveFileTypes(options),
      });
      return WebFileSystemAccess.isFileSystemFileHandle(handle)
        ? provider.registerFileHandle(handle)
        : undefined;
    } catch (error) {
      if (isPickerCancel(error)) {
        return undefined;
      }

      if (!isInterceptedFileChooserError(error)) {
        throw error;
      }
    }

    return undefined;
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

    const activeWindow = globalThis.window as FilePickerWindow | undefined;
    const picker = activeWindow?.showOpenFilePicker;
    if (typeof picker === "function") {
      try {
        const handles = await picker({
          multiple: Boolean(options.canSelectMany),
          types: getOpenFileTypes(options),
        });
        const resources = await Promise.all(
          handles
            .filter(WebFileSystemAccess.isFileSystemFileHandle)
            .map(handle => provider.registerFileHandle(handle)),
        );
        return resources.length ? resources : undefined;
      } catch (error) {
        if (isPickerCancel(error)) {
          return undefined;
        }

        if (!isInterceptedFileChooserError(error)) {
          throw error;
        }
      }
    }

    const files = await this.pickFiles(options);
    if (!files.length) {
      return undefined;
    }

    const resources = await Promise.all(
      files.map(file =>
        provider.registerFileHandle(WebFileSystemAccess.createFileHandle(file))
      ),
    );
    return resources.length ? resources : undefined;
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

function getOpenFileTypes(
  options: IOpenDialogOptions,
): readonly { readonly accept: Record<string, readonly string[]>; readonly description: string }[] | undefined {
  return getSaveFileTypes({
    filters: options.filters,
  });
}

function getDefaultSaveFileName(options: ISaveDialogOptions): string | undefined {
  const path = options.defaultUri?.path.replace(/\\/g, "/");
  if (!path) {
    return undefined;
  }

  return path.slice(path.lastIndexOf("/") + 1) || undefined;
}

function getSaveFileTypes(
  options: ISaveDialogOptions,
): readonly { readonly accept: Record<string, readonly string[]>; readonly description: string }[] | undefined {
  if (!options.filters?.length) {
    return undefined;
  }

  const types = options.filters
    .map(filter => ({
      description: filter.name,
      accept: getSaveFileAccept(filter.extensions),
    }))
    .filter(type => Object.keys(type.accept).length > 0);

  return types.length ? types : undefined;
}

function getSaveFileAccept(extensions: readonly string[]): Record<string, readonly string[]> {
  const accept: Record<string, string[]> = {};
  for (const extension of extensions) {
    const normalizedExtension = normalizePickerExtension(extension);
    if (!normalizedExtension) {
      continue;
    }

    const mime = getMediaOrTextMime(`file${normalizedExtension}`) ?? Mimes.binary;
    accept[mime] ??= [];
    accept[mime].push(normalizedExtension);
  }

  return accept;
}

function normalizePickerExtension(extension: string): string {
  if (extension === "*") {
    return "";
  }

  return extension.startsWith(".") ? extension : `.${extension}`;
}

function isPickerCancel(error: unknown): boolean {
  return error instanceof Error &&
    error.name === "AbortError" &&
    !isInterceptedFileChooserError(error);
}

function isInterceptedFileChooserError(error: unknown): boolean {
  return error instanceof Error &&
    error.name === "AbortError" &&
    error.message.includes("Page.setInterceptFileChooserDialog");
}
