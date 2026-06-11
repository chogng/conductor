export const nativeHostBootstrapIpcChannels = {
    environmentGet: "conductor:nativeHost:environment:get",
    windowCommand: "conductor:nativeHost:windowCommand",
} as const;

export const nativeHostBootstrapWindowCommands = {
    toggleDevTools: "toggleDevTools",
} as const;
