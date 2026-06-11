import {
  nativeHostIpcChannels,
  nativeWindowCommands,
  type NativeWindowCommand,
} from "src/cs/platform/native/common/nativeIpc";
import { localize } from "src/cs/nls";
import { Action2, registerAction2 } from "src/cs/platform/actions/common/actions";

type WindowIpcRenderer = {
  send(channel: string, ...args: readonly unknown[]): void;
};

export const WindowCommandId = {
  minimizeWindow: "workbench.action.minimizeWindow",
  toggleMaximizeWindow: "workbench.action.toggleMaximizeWindow",
  closeWindow: "workbench.action.closeWindow",
} as const;

const getWindowIpcRenderer = (): WindowIpcRenderer | undefined => {
  const conductor = window.conductor as
    | { ipcRenderer?: WindowIpcRenderer }
    | undefined;

  return conductor?.ipcRenderer;
};

const sendWindowCommand = (command: NativeWindowCommand): void => {
  getWindowIpcRenderer()?.send(nativeHostIpcChannels.windowCommand, { command });
};

export const toggleDevTools = (): void => {
  sendWindowCommand(nativeWindowCommands.toggleDevTools);
};

export const reloadWindow = (): void => {
  sendWindowCommand(nativeWindowCommands.reloadWindow);
};

export const closeWindow = (): void => {
  sendWindowCommand(nativeWindowCommands.closeWindow);
};

export const minimizeWindow = (): void => {
  sendWindowCommand(nativeWindowCommands.minimizeWindow);
};

export const toggleWindowMaximized = (): void => {
  sendWindowCommand(nativeWindowCommands.toggleWindowMaximized);
};

export const installWindowDeveloperKeybindings = (): (() => void) => {
  const listener = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.metaKey) return;

    const key = String(event.key || "").toLowerCase();
    if (key !== "f12" && !(event.ctrlKey && event.shiftKey && key === "i")) {
      return;
    }

    event.preventDefault();
    toggleDevTools();
  };

  window.addEventListener("keydown", listener);
  return () => window.removeEventListener("keydown", listener);
};

class MinimizeWindowAction extends Action2 {
  public constructor() {
    super({
      id: WindowCommandId.minimizeWindow,
      title: localize("menu_window_minimize", "Minimize Window"),
      metadata: {
        description: localize("window.minimizeWindowDescription", "Minimize the current window."),
      },
    });
  }

  public run(): void {
    minimizeWindow();
  }
}

class ToggleMaximizeWindowAction extends Action2 {
  public constructor() {
    super({
      id: WindowCommandId.toggleMaximizeWindow,
      title: localize("menu_window_maximize", "Maximize / Restore"),
      metadata: {
        description: localize("window.toggleMaximizeWindowDescription", "Maximize or restore the current window."),
      },
    });
  }

  public run(): void {
    toggleWindowMaximized();
  }
}

class CloseWindowAction extends Action2 {
  public constructor() {
    super({
      id: WindowCommandId.closeWindow,
      title: localize("menu_window_close", "Close Window"),
      metadata: {
        description: localize("window.closeWindowDescription", "Close the current window."),
      },
    });
  }

  public run(): void {
    closeWindow();
  }
}

registerAction2(MinimizeWindowAction);
registerAction2(ToggleMaximizeWindowAction);
registerAction2(CloseWindowAction);
