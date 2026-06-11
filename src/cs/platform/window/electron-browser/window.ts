import { ipcRenderer } from "src/cs/base/parts/sandbox/electron-browser/globals";
import { nativeHostBootstrapIpcChannels } from "src/cs/base/parts/sandbox/common/sandboxTypes";
import {
  NativeWindowCommand,
  type NativeWindowCommandId,
} from "src/cs/platform/window/common/window";

function sendNativeWindowCommand(command: NativeWindowCommandId): void {
  ipcRenderer.send(nativeHostBootstrapIpcChannels.windowCommand, { command });
}

export function toggleDevTools(): void {
  sendNativeWindowCommand(NativeWindowCommand.toggleDevTools);
}
