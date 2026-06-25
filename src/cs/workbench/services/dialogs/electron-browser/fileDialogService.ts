import type { URI } from "src/cs/base/common/uri";
import {
  IFileDialogService,
  type IFileDialogService as IFileDialogServiceType,
  type IOpenDialogOptions,
  type ISaveDialogOptions,
} from "src/cs/platform/dialogs/common/dialogs";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  INativeHostService,
  type INativeHostService as INativeHostServiceType,
  type INativeOpenDialogOptions,
  type INativeSaveDialogOptions,
  type NativeOpenDialogProperty,
} from "src/cs/platform/native/common/native";
import { AbstractFileDialogService } from "src/cs/workbench/services/dialogs/browser/abstractFileDialogService";
import {
  IPathService,
  type IPathService as IPathServiceType,
} from "src/cs/workbench/services/path/common/pathService";

export class FileDialogService extends AbstractFileDialogService implements IFileDialogServiceType {
  constructor(
    @INativeHostService private readonly nativeHost: INativeHostServiceType,
    @IPathService private readonly pathService: IPathServiceType,
  ) {
    super();
  }

  public async showOpenDialog(options: IOpenDialogOptions): Promise<URI[] | undefined> {
    const result = await this.nativeHost.showOpenDialog(this.toNativeOpenDialogOptions(options));
    if (result.canceled || result.filePaths.length === 0) {
      return undefined;
    }

    return Promise.all(result.filePaths.map(path => this.pathService.fileURI(path)));
  }

  public override canSaveFile(): boolean {
    return true;
  }

  public async showSaveDialog(options: ISaveDialogOptions): Promise<URI | undefined> {
    const result = await this.nativeHost.showSaveDialog(this.toNativeSaveDialogOptions(options));
    if (result.canceled || !result.filePath) {
      return undefined;
    }

    return this.pathService.fileURI(result.filePath);
  }

  private toNativeOpenDialogOptions(options: IOpenDialogOptions): INativeOpenDialogOptions {
    const properties: NativeOpenDialogProperty[] = ["createDirectory"];

    if (options.canSelectFiles) {
      properties.push("openFile");
    }

    if (options.canSelectFolders) {
      properties.push("openDirectory");
    }

    if (options.canSelectMany) {
      properties.push("multiSelections");
    }

    return {
      buttonLabel: options.openLabel,
      defaultPath: options.defaultUri?.fsPath,
      filters: options.filters,
      properties,
      title: options.title,
    };
  }

  private toNativeSaveDialogOptions(options: ISaveDialogOptions): INativeSaveDialogOptions {
    return {
      buttonLabel: options.saveLabel,
      defaultPath: options.defaultUri?.fsPath,
      filters: options.filters,
      title: options.title,
    };
  }
}

registerSingleton(IFileDialogService, FileDialogService, InstantiationType.Delayed);
