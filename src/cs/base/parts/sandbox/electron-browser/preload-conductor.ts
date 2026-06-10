/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { ContextBridge, IpcRenderer, WebUtils } from "electron";

import {
  type ISandboxConfiguration,
} from "../common/sandboxTypes.js";

type IpcListener = (event: Electron.IpcRendererEvent, ...args: unknown[]) => void;

function validateIpcChannel(channel: string): true {
  if (!channel?.startsWith("conductor:")) {
    throw new Error(`Unsupported IPC channel '${channel}'.`);
  }

  return true;
}

interface PreloadIpcRenderer {
  send(channel: string, ...args: unknown[]): void;
  sendSync(channel: string, ...args: unknown[]): unknown;
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: IpcListener): PreloadIpcRenderer;
  once(channel: string, listener: IpcListener): PreloadIpcRenderer;
  removeListener(channel: string, listener: IpcListener): PreloadIpcRenderer;
}

export function exposeConductorGlobals(
  contextBridge: ContextBridge,
  ipcRenderer: IpcRenderer,
  webUtils: WebUtils,
  configuration: ISandboxConfiguration,
): void {
  const conductorIpcRenderer: PreloadIpcRenderer = {
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

    on(channel: string, listener: IpcListener): PreloadIpcRenderer {
      validateIpcChannel(channel);
      ipcRenderer.on(channel, listener);
      return conductorIpcRenderer;
    },

    once(channel: string, listener: IpcListener): PreloadIpcRenderer {
      validateIpcChannel(channel);
      ipcRenderer.once(channel, listener);
      return conductorIpcRenderer;
    },

    removeListener(channel: string, listener: IpcListener): PreloadIpcRenderer {
      validateIpcChannel(channel);
      ipcRenderer.removeListener(channel, listener);
      return conductorIpcRenderer;
    },
  };

  contextBridge.exposeInMainWorld("conductor", {
    ipcRenderer: conductorIpcRenderer,
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

  contextBridge.exposeInMainWorld("conductorIpcRenderer", conductorIpcRenderer);
}
