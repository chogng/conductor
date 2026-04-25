import { assertOriginExePath } from "./core.js";
import type { BaseWindow, OpenDialogOptions, dialog as electronDialog } from "electron";

export async function pickOriginExecutable({
  dialog,
  ownerWindow,
  defaultPath,
}: {
  dialog: typeof electronDialog;
  ownerWindow?: BaseWindow | null;
  defaultPath?: string | null;
}): Promise<string | null> {
  const dialogOptions: OpenDialogOptions = {
    title: "Select Origin executable",
    defaultPath: defaultPath || undefined,
    properties: ["openFile"],
    filters: [
      { name: "Origin executable", extensions: ["exe"] },
      { name: "All Files", extensions: ["*"] },
    ],
  };
  const result = ownerWindow
    ? await dialog.showOpenDialog(ownerWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);

  if (result.canceled || !Array.isArray(result.filePaths) || result.filePaths.length === 0) {
    return null;
  }

  return assertOriginExePath(result.filePaths[0]);
}

