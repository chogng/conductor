import type { ContextBridge, IpcRenderer, WebUtils } from "electron";

import {
  workbenchBootstrapIpcChannels,
  type ISandboxConfiguration,
} from "../src/cs/base/parts/sandbox/common/sandboxTypes.js";
import { nativeHostIpcChannels } from "../src/cs/platform/native/common/nativeIpc.js";
import { workbenchIpcChannels } from "../src/cs/workbench/common/ipcChannels.js";

type IpcListener = (event: Electron.IpcRendererEvent, ...args: unknown[]) => void;

const allowedChannels = new Set<string>([
  ...Object.values(workbenchBootstrapIpcChannels),
  ...Object.values(nativeHostIpcChannels),
  ...Object.values(workbenchIpcChannels),
  "desktop-command",
]);

function validateIpcChannel(channel: string): true {
  if (!allowedChannels.has(channel)) {
    throw new Error(`Unsupported IPC channel '${channel}'.`);
  }

  return true;
}

export function exposeConductorGlobals(
  contextBridge: ContextBridge,
  ipcRenderer: IpcRenderer,
  webUtils: WebUtils,
  configuration: ISandboxConfiguration,
): void {
  contextBridge.exposeInMainWorld("conductor", {
    ipcRenderer: {
      send(channel: string, ...args: unknown[]): void {
        validateIpcChannel(channel);
        ipcRenderer.send(channel, ...args);
      },

      sendSync(channel: string, ...args: unknown[]): unknown {
        validateIpcChannel(channel);
        return ipcRenderer.sendSync(channel, ...args);
      },

      invoke(channel: string, ...args: unknown[]): Promise<unknown> {
        validateIpcChannel(channel);
        return ipcRenderer.invoke(channel, ...args);
      },

      on(channel: string, listener: IpcListener): void {
        validateIpcChannel(channel);
        ipcRenderer.on(channel, listener);
      },

      removeListener(channel: string, listener: IpcListener): void {
        validateIpcChannel(channel);
        ipcRenderer.removeListener(channel, listener);
      },
    },
    webUtils: {
      getPathForFile(file: File) {
        try {
          return webUtils.getPathForFile(file);
        } catch {
          return "";
        }
      },
    },
    context: {
      configuration(): ISandboxConfiguration {
        return configuration;
      },

      async resolveConfiguration(): Promise<ISandboxConfiguration> {
        return configuration;
      },
    },
  });
}
