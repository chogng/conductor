import type { CancellationToken } from "src/cs/base/common/async";
import type { URI } from "src/cs/base/common/uri";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";

export const IFileDialogService = createDecorator<IFileDialogService>("fileDialogService");

export type DialogType = "none" | "info" | "error" | "question" | "warning";

export interface IDialogArgs {
  readonly confirmArgs?: IConfirmDialogArgs;
  readonly inputArgs?: IInputDialogArgs;
  readonly promptArgs?: IPromptDialogArgs;
}

export interface IBaseDialogOptions {
  readonly type?: DialogType;
  readonly title?: string;
  readonly message: string;
  readonly detail?: string;
  readonly checkbox?: ICheckbox;
  readonly custom?: boolean | ICustomDialogOptions;
  readonly token?: CancellationToken;
}

export interface ICustomDialogOptions {
  readonly disableCloseAction?: boolean;
}

export interface IConfirmDialogArgs {
  readonly confirmation: IConfirmation;
}

export interface IConfirmation extends IBaseDialogOptions {
  readonly primaryButton?: string;
  readonly cancelButton?: string;
}

export interface IConfirmationResult extends ICheckboxResult {
  readonly confirmed: boolean;
}

export interface IInputDialogArgs {
  readonly input: IInput;
}

export interface IInput extends IConfirmation {
  readonly inputs: readonly IInputElement[];
  readonly primaryButton?: string;
}

export interface IInputElement {
  readonly type?: "text" | "password";
  readonly value?: string;
  readonly placeholder?: string;
}

export interface IInputResult extends IConfirmationResult {
  readonly values?: readonly string[];
}

export interface IPromptDialogArgs {
  readonly prompt: IPrompt<unknown>;
}

export interface IPromptBaseButton<T> {
  run(checkbox: ICheckboxResult): T | Promise<T>;
}

export interface IPromptButton<T> extends IPromptBaseButton<T> {
  readonly label: string;
}

export interface IPromptCancelButton<T> extends IPromptBaseButton<T> {
  readonly label?: string;
}

export interface IPrompt<T> extends IBaseDialogOptions {
  readonly buttons?: readonly IPromptButton<T>[];
  readonly cancelButton?: IPromptCancelButton<T> | true | string;
}

export interface IPromptResult<T> extends ICheckboxResult {
  readonly result?: T;
}

export interface IAsyncPromptResult<T> extends ICheckboxResult {
  readonly result?: Promise<T>;
}

export type IDialogResult = IConfirmationResult | IInputResult | IAsyncPromptResult<unknown>;

export interface ICheckbox {
  readonly label: string;
  readonly checked?: boolean;
}

export interface ICheckboxResult {
  readonly checkboxChecked?: boolean;
}

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
