import {
  HelpWindowOpenChannel,
  type HelpWindowKind,
} from "src/cs/workbench/contrib/help/common/helpWindow";

type HelpWindowIpcRenderer = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
};

const getIpcRenderer = (): HelpWindowIpcRenderer | null => {
  const conductor = (
    globalThis.window as Window & {
      conductor?: { ipcRenderer?: HelpWindowIpcRenderer };
    }
  ).conductor;

  return typeof conductor?.ipcRenderer?.invoke === "function"
    ? conductor.ipcRenderer
    : null;
};

export class BrowserHelpWindowService {
  public canOpenHelpWindow(): boolean {
    return Boolean(getIpcRenderer());
  }

  public async openHelpWindow(kind: HelpWindowKind): Promise<void> {
    const ipcRenderer = getIpcRenderer();
    if (!ipcRenderer) {
      return;
    }

    await ipcRenderer.invoke(HelpWindowOpenChannel, { kind });
  }
}
