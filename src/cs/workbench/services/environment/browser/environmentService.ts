import { normalizeWorkbenchEnvironment, type WorkbenchEnvironment } from "src/cs/workbench/services/environment/common/environmentService";
import { nativeHostIpcChannels } from "src/cs/platform/native/common/nativeIpc";

type SyncIpcRenderer = {
    sendSync(channel: string, ...args: unknown[]): unknown;
};

type EnvironmentWindow = Window & typeof globalThis & {
    conductor?: {
        ipcRenderer?: Partial<SyncIpcRenderer>;
    };
};

function readInitialWorkbenchEnvironment(): WorkbenchEnvironment | null {
    if (typeof window === "undefined") {
        return null;
    }

    const ipcRenderer = (window as EnvironmentWindow).conductor?.ipcRenderer;
    if (typeof ipcRenderer?.sendSync !== "function") {
        return null;
    }

    try {
        return normalizeWorkbenchEnvironment(ipcRenderer.sendSync(nativeHostIpcChannels.environmentGet));
    } catch {
        return null;
    }
}

let environmentSnapshot: WorkbenchEnvironment | null = readInitialWorkbenchEnvironment();

export function getWorkbenchEnvironment(): WorkbenchEnvironment | null {
    return environmentSnapshot;
}

export function setWorkbenchEnvironment(environment: WorkbenchEnvironment | null): void {
    environmentSnapshot = environment;
}
