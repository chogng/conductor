import { Disposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import {
  type IFileDialogService,
  type IOpenDialogOptions,
  type ISaveDialogOptions,
} from "src/cs/platform/dialogs/common/dialogs";

const FILE_SCHEME = "file";

export abstract class AbstractFileDialogService extends Disposable implements IFileDialogService {
  public declare readonly _serviceBrand: undefined;

  protected getFileSystemSchema(options: { readonly defaultUri?: URI }): string {
    return options.defaultUri?.scheme || FILE_SCHEME;
  }

  protected addFileSchemaIfNeeded(schema: string): string[] {
    return schema === FILE_SCHEME ? [schema] : [schema, FILE_SCHEME];
  }

  protected shouldUseSimplified(schema: string): boolean {
    return schema !== FILE_SCHEME;
  }

  protected showOpenDialogSimplified(
    _schema: string,
    _options: IOpenDialogOptions,
  ): Promise<URI[] | undefined> {
    return Promise.resolve(undefined);
  }

  public abstract showOpenDialog(options: IOpenDialogOptions): Promise<URI[] | undefined>;

  public canSaveFile(): boolean {
    return false;
  }

  public showSaveDialog(_options: ISaveDialogOptions): Promise<URI | undefined> {
    return Promise.resolve(undefined);
  }
}
