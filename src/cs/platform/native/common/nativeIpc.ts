export const nativeHostIpcChannels = {
    environmentGet: "conductor:nativeHost:environment:get",
} as const;

export interface INativeHostEnvironment {
    readonly isDesktop: boolean;
    readonly platform: string;
    readonly isPackaged: boolean;
    readonly appVersion: string | null;
}
