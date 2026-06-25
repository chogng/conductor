import {
  dialog,
  type BrowserWindow,
  type FileFilter,
  type MessageBoxOptions,
  type MessageBoxReturnValue,
  type OpenDialogOptions,
  type OpenDialogReturnValue,
  type SaveDialogOptions,
  type SaveDialogReturnValue,
} from "electron";

const allowedOpenDialogProperties = new Set([
  "openFile",
  "openDirectory",
  "multiSelections",
  "showHiddenFiles",
  "createDirectory",
  "promptToCreate",
  "noResolveAliases",
  "treatPackageAsDirectory",
  "dontAddToRecent",
]);

export class DialogMainService {
  public async showOpenDialog(
    options: unknown,
    window?: BrowserWindow,
  ): Promise<OpenDialogReturnValue> {
    const normalizedOptions = this.normalizeOpenDialogOptions(options);
    return window
      ? dialog.showOpenDialog(window, normalizedOptions)
      : dialog.showOpenDialog(normalizedOptions);
  }

  public async showMessageBox(
    options: unknown,
    window?: BrowserWindow,
  ): Promise<MessageBoxReturnValue> {
    const normalizedOptions = this.normalizeMessageBoxOptions(options);
    return window
      ? dialog.showMessageBox(window, normalizedOptions)
      : dialog.showMessageBox(normalizedOptions);
  }

  public async showSaveDialog(
    options: unknown,
    window?: BrowserWindow,
  ): Promise<SaveDialogReturnValue> {
    const normalizedOptions = this.normalizeSaveDialogOptions(options);
    return window
      ? dialog.showSaveDialog(window, normalizedOptions)
      : dialog.showSaveDialog(normalizedOptions);
  }

  private normalizeOpenDialogOptions(options: unknown): OpenDialogOptions {
    const record =
      options && typeof options === "object" && !Array.isArray(options)
        ? options as Record<string, unknown>
        : {};
    const properties = Array.isArray(record.properties)
      ? record.properties.filter(property =>
        typeof property === "string" && allowedOpenDialogProperties.has(property),
      )
      : [];

    return {
      buttonLabel: typeof record.buttonLabel === "string" ? record.buttonLabel : undefined,
      defaultPath: typeof record.defaultPath === "string" ? record.defaultPath : undefined,
      filters: this.normalizeFilters(record.filters),
      properties,
      title: typeof record.title === "string" ? record.title : undefined,
    };
  }

  private normalizeMessageBoxOptions(options: unknown): MessageBoxOptions {
    const record =
      options && typeof options === "object" && !Array.isArray(options)
        ? options as Record<string, unknown>
        : {};
    const buttons = Array.isArray(record.buttons)
      ? record.buttons.filter((button): button is string => typeof button === "string")
      : undefined;

    return {
      buttons,
      cancelId: typeof record.cancelId === "number" ? record.cancelId : undefined,
      checkboxChecked: typeof record.checkboxChecked === "boolean"
        ? record.checkboxChecked
        : undefined,
      checkboxLabel: typeof record.checkboxLabel === "string" ? record.checkboxLabel : undefined,
      detail: typeof record.detail === "string" ? record.detail : undefined,
      message: typeof record.message === "string" ? record.message : "",
      title: typeof record.title === "string" ? record.title : undefined,
      type: isMessageBoxType(record.type) ? record.type : "none",
    };
  }

  private normalizeSaveDialogOptions(options: unknown): SaveDialogOptions {
    const record =
      options && typeof options === "object" && !Array.isArray(options)
        ? options as Record<string, unknown>
        : {};

    return {
      buttonLabel: typeof record.buttonLabel === "string" ? record.buttonLabel : undefined,
      defaultPath: typeof record.defaultPath === "string" ? record.defaultPath : undefined,
      filters: this.normalizeFilters(record.filters),
      title: typeof record.title === "string" ? record.title : undefined,
    };
  }

  private normalizeFilters(value: unknown): FileFilter[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }

    return value
      .filter(filter =>
        filter &&
        typeof filter === "object" &&
        typeof (filter as { name?: unknown }).name === "string" &&
        Array.isArray((filter as { extensions?: unknown }).extensions),
      )
      .map(filter => {
        const record = filter as { extensions: unknown[]; name: string };
        return {
          name: record.name,
          extensions: record.extensions.filter(
            (extension): extension is string => typeof extension === "string",
          ),
        };
      });
  }
}

function isMessageBoxType(value: unknown): value is NonNullable<MessageBoxOptions["type"]> {
  return value === "none" ||
    value === "info" ||
    value === "error" ||
    value === "question" ||
    value === "warning";
}
