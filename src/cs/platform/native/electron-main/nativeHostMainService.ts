import { BrowserWindow, shell } from "electron";
import { DialogMainService } from "../../dialogs/electron-main/dialogMainService.js";

type NativeOpenDialogResult = {
  readonly canceled: boolean;
  readonly filePaths: readonly string[];
};

type NativeSaveDialogResult = {
  readonly canceled: boolean;
  readonly filePath?: string;
};

type NativeMessageBoxResult = {
  readonly checkboxChecked?: boolean;
  readonly response: number;
};

export class NativeHostMainService {
  constructor(
    private readonly dialogMainService: DialogMainService,
  ) {}

  public showOpenDialogForWindow(
    win: BrowserWindow | null | undefined,
    options: unknown,
  ): Promise<NativeOpenDialogResult> {
    return this.dialogMainService.showOpenDialog(
      options,
      win && !win.isDestroyed() ? win : undefined,
    );
  }

  public showMessageBoxForWindow(
    win: BrowserWindow | null | undefined,
    options: unknown,
  ): Promise<NativeMessageBoxResult> {
    return this.dialogMainService.showMessageBox(
      options,
      win && !win.isDestroyed() ? win : undefined,
    );
  }

  public showSaveDialogForWindow(
    win: BrowserWindow | null | undefined,
    options: unknown,
  ): Promise<NativeSaveDialogResult> {
    return this.dialogMainService.showSaveDialog(
      options,
      win && !win.isDestroyed() ? win : undefined,
    );
  }

  public showItemInFolder(filePath: unknown): void {
    const normalizedPath = typeof filePath === "string" ? filePath.trim() : "";
    if (!normalizedPath) {
      return;
    }

    shell.showItemInFolder(normalizedPath);
  }
}
