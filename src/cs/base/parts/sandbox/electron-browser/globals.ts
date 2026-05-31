export interface IpcRendererLike {
    send(channel: string, ...args: unknown[]): void;
    on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
    once(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
    removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
}

type ElectronGlobals = typeof globalThis & {
    readonly ipcRenderer?: IpcRendererLike;
    readonly conductorIpcRenderer?: IpcRendererLike;
    readonly conductor?: {
        readonly ipcRenderer?: IpcRendererLike;
    };
    readonly electron?: {
        readonly ipcRenderer?: IpcRendererLike;
    };
};

function resolveIpcRenderer(): IpcRendererLike {
    const globals = globalThis as ElectronGlobals;
    const ipcRenderer = globals.conductorIpcRenderer ?? globals.conductor?.ipcRenderer ?? globals.ipcRenderer ?? globals.electron?.ipcRenderer;

    if (!ipcRenderer) {
        throw new Error("Electron ipcRenderer global is not available.");
    }

    return ipcRenderer;
}

export const ipcRenderer = resolveIpcRenderer();
