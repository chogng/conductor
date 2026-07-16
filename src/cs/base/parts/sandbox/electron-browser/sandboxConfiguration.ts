import type { IpcRenderer } from "electron";

import { product } from "../../../../../bootstrap-meta.js";
import {
  DEFAULT_SANDBOX_PROFILE_ID,
  DEFAULT_SANDBOX_WORKSPACE_ID,
  workbenchBootstrapIpcChannels,
  type ISandboxConfiguration,
  type ISandboxStorageConfiguration,
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

function readInitialStorage(
  ipcRenderer: IpcRenderer,
): ISandboxStorageConfiguration | undefined {
  try {
    const value = asRecord(
      ipcRenderer.sendSync(workbenchBootstrapIpcChannels.storageGet),
    );
    if (value) {
      const initial = asRecord(value.initial);
      return {
        profileId: typeof value.profileId === "string"
          ? value.profileId
          : DEFAULT_SANDBOX_PROFILE_ID,
        workspaceId: typeof value.workspaceId === "string"
          ? value.workspaceId
          : DEFAULT_SANDBOX_WORKSPACE_ID,
        initial: {
          application: asStringRecord(initial?.application),
          profile: asStringRecord(initial?.profile),
          workspace: asStringRecord(initial?.workspace),
        },
      };
    }
  } catch (error) {
    console.warn("[boot][preload] Failed to get initial storage:", error);
  }

  return undefined;
}

export function createSandboxConfiguration(ipcRenderer: IpcRenderer): ISandboxConfiguration {
  const initialWorkbenchSettings = readInitialWorkbenchSettings(ipcRenderer);
  const storage = readInitialStorage(ipcRenderer);

  return {
    windowId: 1,
    appRoot: "",
    userEnv: {},
    product: { ...product },
    nls: {
      messages: {},
      language: undefined,
    },
    initialWorkbenchSettings,
    storage,
  };
}

function asStringRecord(value: unknown): Record<string, string> {
  const record = asRecord(value);
  if (!record) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(record).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}
