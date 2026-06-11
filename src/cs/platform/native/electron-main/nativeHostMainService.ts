import { BrowserWindow, shell } from "electron";
import { DialogMainService } from "../../dialogs/electron-main/dialogMainService.js";

type NativeOpenDialogResult = {
  readonly canceled: boolean;
  readonly filePaths: readonly string[];
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

  public showItemInFolder(filePath: unknown): void {
    const normalizedPath = typeof filePath === "string" ? filePath.trim() : "";
    if (!normalizedPath) {
      return;
    }

    shell.showItemInFolder(normalizedPath);
  }
}
