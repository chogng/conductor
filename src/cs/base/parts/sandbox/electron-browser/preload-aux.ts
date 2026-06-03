import { contextBridge, ipcRenderer, webFrame } from "electron";

import {
    DefaultURITransformer,
    transformAndReviveIncomingURIs,
    transformOutgoingURIs,
} from "src/cs/base/common/uriIpc";

type IpcListener = (event: Electron.IpcRendererEvent, ...args: unknown[]) => void;

interface PreloadIpcRenderer {
    send(channel: string, ...args: unknown[]): void;
    sendSync(channel: string, ...args: unknown[]): unknown;
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

const listenerWrappers = new WeakMap<IpcListener, Map<string, IpcListener>>();

function transformOutgoingArgs(args: unknown[]): unknown[] {
    return transformOutgoingURIs(args, DefaultURITransformer);
}

function transformIncomingValue<T>(value: T): T {
    return transformAndReviveIncomingURIs(value, DefaultURITransformer);
}

function wrapListener(channel: string, listener: IpcListener): IpcListener {
    let wrappedListeners = listenerWrappers.get(listener);
    if (!wrappedListeners) {
        wrappedListeners = new Map<string, IpcListener>();
        listenerWrappers.set(listener, wrappedListeners);
    }

    const wrappedListener = wrappedListeners.get(channel);
    if (wrappedListener) {
        return wrappedListener;
    }

    const wrapped: IpcListener = (event, ...args) => {
        listener(event, ...transformIncomingValue(args));
    };
    wrappedListeners.set(channel, wrapped);
    return wrapped;
}

function removeWrappedListener(channel: string, listener: IpcListener): IpcListener {
    const wrappedListeners = listenerWrappers.get(listener);
    const wrappedListener = wrappedListeners?.get(channel);
    if (!wrappedListeners || !wrappedListener) {
        return listener;
    }

    wrappedListeners.delete(channel);
    if (wrappedListeners.size === 0) {
        listenerWrappers.delete(listener);
    }
    return wrappedListener;
}

const conductorIpcRenderer: PreloadIpcRenderer = {
    send(channel: string, ...args: unknown[]): void {
        validateIpc(channel);
        ipcRenderer.send(channel, ...transformOutgoingArgs(args));
    },

    sendSync(channel: string, ...args: unknown[]): unknown {
        validateIpc(channel);
        return transformIncomingValue(ipcRenderer.sendSync(channel, ...transformOutgoingArgs(args)));
    },

    invoke(channel: string, ...args: unknown[]): Promise<unknown> {
        validateIpc(channel);
        return ipcRenderer
            .invoke(channel, ...transformOutgoingArgs(args))
            .then(result => transformIncomingValue(result));
    },

    on(channel: string, listener: IpcListener): typeof conductorIpcRenderer {
        validateIpc(channel);
        ipcRenderer.on(channel, wrapListener(channel, listener));
        return conductorIpcRenderer;
    },

    once(channel: string, listener: IpcListener): typeof conductorIpcRenderer {
        validateIpc(channel);
        ipcRenderer.once(channel, wrapListener(channel, listener));
        return conductorIpcRenderer;
    },

    removeListener(channel: string, listener: IpcListener): typeof conductorIpcRenderer {
        validateIpc(channel);
        ipcRenderer.removeListener(channel, removeWrappedListener(channel, listener));
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
