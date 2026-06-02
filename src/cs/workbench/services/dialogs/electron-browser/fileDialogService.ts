import { Disposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import {
  IFileDialogService,
  type IFileDialogService as IFileDialogServiceType,
  type IOpenDialogOptions,
} from "src/cs/platform/dialogs/common/dialogs";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  INativeHostService,
  type INativeHostService as INativeHostServiceType,
  type INativeOpenDialogOptions,
  type NativeOpenDialogProperty,
} from "src/cs/platform/native/common/native";
import { nativeHostService } from "src/cs/platform/native/electron-browser/nativeHostService";

export class FileDialogService extends Disposable implements IFileDialogServiceType {
  public declare readonly _serviceBrand: undefined;

  constructor(
    @INativeHostService private readonly nativeHost: INativeHostServiceType,
  ) {
    super();
  }

  public async showOpenDialog(options: IOpenDialogOptions): Promise<URI[] | undefined> {
    const result = await this.nativeHost.showOpenDialog(this.toNativeOpenDialogOptions(options));
    return result.canceled || result.filePaths.length === 0
      ? undefined
      : result.filePaths.map(path => URI.file(path));
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
}

export const fileDialogService = new FileDialogService(nativeHostService);

registerSingleton(IFileDialogService, FileDialogService, InstantiationType.Delayed);
