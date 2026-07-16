export const DEFAULT_SANDBOX_PROFILE_ID = "default";
export const DEFAULT_SANDBOX_WORKSPACE_ID = "empty-window";

export interface ISandboxStorageConfiguration {
    readonly profileId: string;
    readonly workspaceId: string;
    readonly initial: {
        readonly application: Record<string, string>;
        readonly profile: Record<string, string>;
        readonly workspace: Record<string, string>;
    };
}

export interface ISandboxConfiguration {
    readonly windowId: number;
    readonly appRoot: string;
    readonly userEnv: Record<string, string | undefined>;
    readonly product: Record<string, unknown>;
    readonly zoomLevel?: number;
    readonly codeCachePath?: string;
    readonly nls: {
        readonly messages: Record<string, string>;
        readonly language: string | undefined;
    };
    readonly cssModules?: string[];
    readonly initialWorkbenchSettings?: Record<string, unknown> | null;
    readonly storage?: ISandboxStorageConfiguration;
}

export interface ISandboxMemoryInfo {
    readonly heapLimitBytes: number;
    readonly heapUsedBytes: number;
    readonly processPrivateBytes: number;
    readonly processResidentSetBytes?: number;
    readonly systemFreeBytes: number;
    readonly systemTotalBytes: number;
}

export const workbenchBootstrapIpcChannels = {
    settingsGet: "conductor:workbench-bootstrap:settings:get",
    storageGet: "conductor:workbench-bootstrap:storage:get",
    storageFlushRequest: "conductor:workbench-bootstrap:storage:flush-request",
    storageFlushComplete: "conductor:workbench-bootstrap:storage:flush-complete",
    uiReady: "conductor:workbench-bootstrap:ui-ready",
} as const;

export const nativeHostBootstrapIpcChannels = {
    environmentGet: "conductor:nativeHost:environment:get",
    windowCommand: "conductor:nativeHost:windowCommand",
} as const;
