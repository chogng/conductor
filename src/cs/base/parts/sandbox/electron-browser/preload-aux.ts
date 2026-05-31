import { contextBridge, ipcRenderer, webFrame } from "electron";

type IpcListener = (event: Electron.IpcRendererEvent, ...args: unknown[]) => void;

interface PreloadIpcRenderer {
    send(channel: string, ...args: unknown[]): void;
    invoke(channel: string, ...args: unknown[]): Promise<unknown>;
    on(channel: string, listener: IpcListener): PreloadIpcRenderer;
    once(channel: string, listener: IpcListener): PreloadIpcRenderer;
    removeListener(channel: string, listener: IpcListener): PreloadIpcRenderer;
}

function validateIpc(channel: string): true {
    if (!channel?.startsWith("conductor:")) {
        throw new Error(`Unsupported IPC channel '${channel}'.`);
    }

    return true;
}

const conductorIpcRenderer: PreloadIpcRenderer = {
    send(channel: string, ...args: unknown[]): void {
        validateIpc(channel);
        ipcRenderer.send(channel, ...args);
    },

    invoke(channel: string, ...args: unknown[]): Promise<unknown> {
        validateIpc(channel);
        return ipcRenderer.invoke(channel, ...args);
    },

    on(channel: string, listener: IpcListener): typeof conductorIpcRenderer {
        validateIpc(channel);
        ipcRenderer.on(channel, listener);
        return conductorIpcRenderer;
    },

    once(channel: string, listener: IpcListener): typeof conductorIpcRenderer {
        validateIpc(channel);
        ipcRenderer.once(channel, listener);
        return conductorIpcRenderer;
    },

    removeListener(channel: string, listener: IpcListener): typeof conductorIpcRenderer {
        validateIpc(channel);
        ipcRenderer.removeListener(channel, listener);
        return conductorIpcRenderer;
    },
};

contextBridge.exposeInMainWorld("conductor", {
    ipcRenderer: conductorIpcRenderer,
    webFrame: {
        setZoomLevel(level: number): void {
            if (typeof level === "number") {
                webFrame.setZoomLevel(level);
            }
        },
    },
});
contextBridge.exposeInMainWorld("conductorIpcRenderer", conductorIpcRenderer);
