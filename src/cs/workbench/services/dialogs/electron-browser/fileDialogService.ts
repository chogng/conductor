import type { URI } from "src/cs/base/common/uri";
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

registerSingleton(IFileDialogService, FileDialogService, InstantiationType.Delayed);
