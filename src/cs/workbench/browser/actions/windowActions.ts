import {
  nativeHostIpcChannels,
  nativeWindowCommands,
  type NativeWindowCommand,
} from "src/cs/platform/native/common/nativeIpc";

type WindowIpcRenderer = {
  send(channel: string, ...args: readonly unknown[]): void;
};

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
