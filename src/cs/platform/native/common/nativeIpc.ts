export const nativeHostIpcChannels = {
    environmentGet: "conductor:nativeHost:environment:get",
    openDialog: "conductor:nativeHost:openDialog",
    windowCommand: "conductor:nativeHost:windowCommand",
} as const;

export const nativeWindowCommands = {
    toggleDevTools: "toggleDevTools",
    reloadWindow: "reloadWindow",
    closeWindow: "closeWindow",
    minimizeWindow: "minimizeWindow",
    toggleWindowMaximized: "toggleWindowMaximized",
} as const;

export type NativeWindowCommand = (typeof nativeWindowCommands)[keyof typeof nativeWindowCommands];

export interface INativeWindowCommandPayload {
    readonly command: NativeWindowCommand;
}

export interface INativeHostEnvironment {
    readonly isDesktop: boolean;
    readonly platform: string;
    readonly isPackaged: boolean;
    readonly appVersion: string | null;
}
