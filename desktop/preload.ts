import { contextBridge, ipcRenderer } from "electron";
import { ipcChannels } from "./ipc-channels.js";

const DESKTOP_BOOTSTRAP_ARG_PREFIX = "--conductor-bootstrap=";
const preloadStartMs =
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

function logPreloadBoot(stage, extra = "") {
  const nowMs =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  const elapsedMs = Math.round(nowMs - preloadStartMs);
  const suffix = extra ? ` ${extra}` : "";
  console.info(`[boot][preload] +${elapsedMs}ms ${stage}${suffix}`);
}

function readDesktopBootstrap() {
  const argv = Array.isArray(process.argv) ? process.argv : [];

  for (const arg of argv) {
    if (
      typeof arg !== "string" ||
      !arg.startsWith(DESKTOP_BOOTSTRAP_ARG_PREFIX)
    ) {
      continue;
    }

    const encodedPayload = arg.slice(DESKTOP_BOOTSTRAP_ARG_PREFIX.length);
    if (!encodedPayload) return {};

    try {
      const decodedPayload = decodeURIComponent(encodedPayload);
      const parsedPayload = JSON.parse(decodedPayload);
      return parsedPayload &&
        typeof parsedPayload === "object" &&
        !Array.isArray(parsedPayload)
        ? parsedPayload
        : {};
    } catch {
      return {};
    }
  }

  return {};
}

const desktopBootstrap = readDesktopBootstrap();
logPreloadBoot(
  "bootstrap:ready",
  `(settings=${desktopBootstrap?.initialDeviceAnalysisSettings ? "yes" : "no"})`,
);

contextBridge.exposeInMainWorld("desktopBootstrap", desktopBootstrap);

contextBridge.exposeInMainWorld("desktopMeta", {
  isDesktop: true,
  platform: process.platform,
  isPackaged: !process.defaultApp,
});

contextBridge.exposeInMainWorld("desktopApp", {
  sendCommand(command, payload) {
    if (typeof command !== "string" || command.trim().length === 0) return;
    ipcRenderer.send("desktop-command", { command, payload });
  },
});

contextBridge.exposeInMainWorld("desktopStore", {
  async getDeviceAnalysisTemplates() {
    return ipcRenderer.invoke(ipcChannels.templatesGet);
  },
  async createDeviceAnalysisTemplate(template) {
    return ipcRenderer.invoke(ipcChannels.templatesCreate, template);
  },
  async deleteDeviceAnalysisTemplate(id) {
    return ipcRenderer.invoke(ipcChannels.templatesDelete, id);
  },
  async getDeviceAnalysisSettings() {
    return ipcRenderer.invoke(ipcChannels.settingsGet);
  },
  async updateDeviceAnalysisSettings(updates) {
    return ipcRenderer.invoke(ipcChannels.settingsPatch, updates);
  },
  async getDeviceAnalysisPersistencePath() {
    return ipcRenderer.invoke(ipcChannels.persistencePathGet);
  },
  async updateDeviceAnalysisPersistencePath(path) {
    return ipcRenderer.invoke(ipcChannels.persistencePathSet, { path });
  },
  async chooseDeviceAnalysisPersistencePath() {
    return ipcRenderer.invoke(ipcChannels.persistencePathChoose);
  },
});

contextBridge.exposeInMainWorld("desktopOrigin", {
  async getOriginExePath() {
    return ipcRenderer.invoke(ipcChannels.originExeGet);
  },
  async setOriginExePath(path) {
    return ipcRenderer.invoke(ipcChannels.originExeSet, { path });
  },
  async pickOriginExePath() {
    return ipcRenderer.invoke(ipcChannels.originExePick);
  },
  async checkOriginHealth(payload) {
    return ipcRenderer.invoke(ipcChannels.originHealthCheck, payload);
  },
  async runOriginCsv(payload) {
    return ipcRenderer.invoke(ipcChannels.originRunCsv, payload);
  },
  async runOriginRuntimeCleanup(payload) {
    return ipcRenderer.invoke(ipcChannels.originRuntimeCleanupRun, payload);
  },
});
