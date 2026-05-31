import { contextBridge, ipcRenderer, webUtils } from "electron";

import { createSandboxConfiguration } from "../src/cs/base/parts/sandbox/electron-browser/sandboxConfiguration.js";
import { createDesktopAppBridge } from "./preload-app.js";
import { exposeConductorGlobals } from "./preload-conductor.js";
import { createDesktopImportBridge } from "./preload-import.js";
import { createDesktopOriginBridge } from "./preload-origin.js";

const preloadStartMs =
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

function logPreloadBoot(stage: string, extra = ""): void {
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
