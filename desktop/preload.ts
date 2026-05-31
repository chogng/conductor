import { contextBridge, ipcRenderer, webUtils } from "electron";

import { createDesktopAppBridge } from "./preload-app.js";
import {
  exposeDesktopBootGlobals,
  readDesktopAutoUpdateStatus,
  readDesktopBootstrap,
  readDesktopMeta,
} from "./preload-boot.js";
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

const desktopBootstrap = readDesktopBootstrap(ipcRenderer);
const desktopMeta = readDesktopMeta(ipcRenderer);
const desktopAutoUpdateStatus = readDesktopAutoUpdateStatus(ipcRenderer);

exposeDesktopBootGlobals(contextBridge, ipcRenderer, desktopBootstrap, desktopMeta);
contextBridge.exposeInMainWorld("desktopApp", createDesktopAppBridge(ipcRenderer, desktopAutoUpdateStatus));
contextBridge.exposeInMainWorld("desktopOrigin", createDesktopOriginBridge(ipcRenderer));
contextBridge.exposeInMainWorld("desktopImport", createDesktopImportBridge(ipcRenderer));
exposeConductorGlobals(contextBridge, ipcRenderer, webUtils);
