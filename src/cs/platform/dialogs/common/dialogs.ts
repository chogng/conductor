import type { URI } from "src/cs/base/common/uri";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";

export const IFileDialogService = createDecorator<IFileDialogService>("fileDialogService");

export type FileFilter = {
  readonly extensions: readonly string[];
  readonly name: string;
};

export type IOpenDialogOptions = {
  readonly canSelectFiles?: boolean;
  readonly canSelectFolders?: boolean;
  readonly canSelectMany?: boolean;
  readonly defaultUri?: URI;
  readonly filters?: readonly FileFilter[];
  readonly openLabel?: string;
  readonly title?: string;
};

export interface IFileDialogService {
  readonly _serviceBrand: undefined;

  showOpenDialog(options: IOpenDialogOptions): Promise<URI[] | undefined>;
}
