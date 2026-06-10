/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { contextBridge, ipcRenderer, webUtils } from "electron";

import { createSandboxConfiguration } from "./sandboxConfiguration.js";
import { createDesktopAppBridge } from "./preload-app.js";
import { exposeConductorGlobals } from "./preload-conductor.js";
import { createDesktopImportBridge } from "./preload-import.js";
import { createDesktopOriginBridge } from "./preload-origin.js";

const preloadStartMs =
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

function isTruthyFlag(value: unknown): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on"
  );
}

function isPreloadBootProfileEnabled(): boolean {
  const host = globalThis as {
    location?: { search?: unknown };
    localStorage?: { getItem?: (key: string) => string | null };
  };

  try {
    const params = new URLSearchParams(String(host.location?.search ?? ""));
    if (isTruthyFlag(params.get("bootProfile"))) {
      return true;
    }
  } catch {
    // Boot profiling is optional; query failures should not block preload.
  }

  try {
    return isTruthyFlag(host.localStorage?.getItem?.("conductor.bootProfile"));
  } catch {
    return false;
  }
}

function logPreloadBoot(stage: string, extra = ""): void {
  if (!isPreloadBootProfileEnabled()) return;

  const nowMs =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  const elapsedMs = Math.round(nowMs - preloadStartMs);
  const suffix = extra ? ` ${extra}` : "";
  console.info(`[boot][preload] +${elapsedMs}ms ${stage}${suffix}`);
}

logPreloadBoot("bootstrap:ready");

const sandboxConfiguration = createSandboxConfiguration(ipcRenderer);

contextBridge.exposeInMainWorld("desktopApp", createDesktopAppBridge(ipcRenderer));
contextBridge.exposeInMainWorld("desktopOrigin", createDesktopOriginBridge(ipcRenderer));
contextBridge.exposeInMainWorld("desktopImport", createDesktopImportBridge(ipcRenderer));
exposeConductorGlobals(contextBridge, ipcRenderer, webUtils, sandboxConfiguration);
