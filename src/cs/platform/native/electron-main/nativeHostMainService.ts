import { BrowserWindow, type WebContents } from "electron";
import { DialogMainService } from "../../dialogs/electron-main/dialogMainService.js";

type NativeOpenDialogResult = {
  readonly canceled: boolean;
  readonly filePaths: readonly string[];
};

export class NativeHostMainService {
  constructor(
    private readonly dialogMainService: DialogMainService,
  ) {}

  public showOpenDialog(
    sender: WebContents,
    options: unknown,
  ): Promise<NativeOpenDialogResult> {
    return this.dialogMainService.showOpenDialog(
      options,
      BrowserWindow.fromWebContents(sender) ?? undefined,
    );
  }
}
