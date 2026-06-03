import { contextBridge, ipcRenderer, webFrame, webUtils } from "electron";

import {
    DefaultURITransformer,
    transformAndReviveIncomingURIs,
    transformOutgoingURIs,
} from "src/cs/base/common/uriIpc";
import type { ISandboxConfiguration } from "src/cs/base/parts/sandbox/common/sandboxTypes";

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

function parseArgv(key: string): string | undefined {
    const prefix = `--${key}=`;

    for (const arg of process.argv) {
        if (arg.startsWith(prefix)) {
            return arg.slice(prefix.length);
        }
    }

    return undefined;
}

let configuration: ISandboxConfiguration | undefined;

const resolveConfiguration = (async (): Promise<ISandboxConfiguration> => {
    const windowConfigIpcChannel = parseArgv("conductor-window-config");

    if (!windowConfigIpcChannel) {
        return {
            windowId: 1,
            appRoot: "",
            userEnv: {},
            product: {},
            nls: {
                messages: {},
                language: undefined,
            },
        };
    }

    validateIpc(windowConfigIpcChannel);

    const resolvedConfiguration = await ipcRenderer.invoke(windowConfigIpcChannel) as ISandboxConfiguration;
    configuration = resolvedConfiguration;

    Object.assign(process.env, resolvedConfiguration.userEnv);
    webFrame.setZoomLevel(resolvedConfiguration.zoomLevel ?? 0);

    return resolvedConfiguration;
})();

const resolveShellEnv = (async (): Promise<Record<string, string | undefined>> => {
    const userEnv = (await resolveConfiguration).userEnv;
    let shellEnv: Record<string, string | undefined> = {};

    try {
        shellEnv = await ipcRenderer.invoke("conductor:fetchShellEnv") as Record<string, string | undefined>;
    }
    catch {
        shellEnv = {};
    }

    return { ...process.env, ...shellEnv, ...userEnv };
})();

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

const conductorGlobals = {
    ipcRenderer: conductorIpcRenderer,

    webFrame: {
        setZoomLevel(level: number): void {
            if (typeof level === "number") {
                webFrame.setZoomLevel(level);
            }
        },
    },

    webUtils: {
        getPathForFile(file: File): string {
            return webUtils.getPathForFile(file);
        },
    },

    process: {
        platform: process.platform,
        arch: process.arch,
        versions: process.versions,
        type: "renderer",
        execPath: process.execPath,

        env(): Record<string, string | undefined> {
            return { ...process.env };
        },

        cwd(): string {
            return process.env["CONDUCTOR_CWD"] ?? process.cwd();
        },

        shellEnv(): Promise<Record<string, string | undefined>> {
            return resolveShellEnv;
        },

        getProcessMemoryInfo(): Promise<Electron.ProcessMemoryInfo> {
            return process.getProcessMemoryInfo();
        },

        on(type: string, callback: (...args: unknown[]) => void): void {
            process.on(type, callback);
        },
    },

    context: {
        configuration(): ISandboxConfiguration | undefined {
            return configuration;
        },

        resolveConfiguration(): Promise<ISandboxConfiguration> {
            return resolveConfiguration;
        },
    },
};

contextBridge.exposeInMainWorld("conductor", conductorGlobals);
contextBridge.exposeInMainWorld("conductorIpcRenderer", conductorIpcRenderer);
