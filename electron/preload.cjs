const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopMeta", {
  isDesktop: true,
  platform: process.platform,
});

contextBridge.exposeInMainWorld("desktopApp", {
  sendCommand(command, payload) {
    if (typeof command !== "string" || command.trim().length === 0) return;
    ipcRenderer.send("desktop-command", { command, payload });
  },
});
