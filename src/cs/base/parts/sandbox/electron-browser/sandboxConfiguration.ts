import type { IpcRenderer } from "electron";

import { product } from "../../../../../bootstrap-meta.js";
import {
  workbenchBootstrapIpcChannels,
  type ISandboxConfiguration,
} from "../common/sandboxTypes.js";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function readInitialWorkbenchSettings(ipcRenderer: IpcRenderer): JsonRecord | null {
  try {
    return asRecord(ipcRenderer.sendSync(workbenchBootstrapIpcChannels.settingsGet));
  } catch (error) {
    console.warn("[boot][preload] Failed to get initial workbench settings:", error);
    return null;
  }
}

export function createSandboxConfiguration(ipcRenderer: IpcRenderer): ISandboxConfiguration {
  return {
    windowId: 1,
    appRoot: "",
    userEnv: {},
    product: { ...product },
    nls: {
      messages: [],
      language: undefined,
    },
    initialWorkbenchSettings: readInitialWorkbenchSettings(ipcRenderer),
  };
}
