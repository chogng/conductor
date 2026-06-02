import {
  dialog,
  type BrowserWindow,
  type FileFilter,
  type OpenDialogOptions,
  type OpenDialogReturnValue,
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
