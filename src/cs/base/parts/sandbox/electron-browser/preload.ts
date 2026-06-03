import { contextBridge, ipcRenderer, webFrame, webUtils } from "electron";

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
        ipcRenderer.send(channel, ...args);
    },

    sendSync(channel: string, ...args: unknown[]): unknown {
        validateIpc(channel);
        return ipcRenderer.sendSync(channel, ...args);
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
