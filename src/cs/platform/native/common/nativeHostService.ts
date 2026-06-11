import type { IChannel } from "../../../base/parts/ipc/common/ipc.js";
import {
    type INativeHostService as INativeHostServiceType,
    type INativeOpenDialogOptions,
    type INativeOpenDialogResult,
    type INativeWindowControlsOptions,
} from "./native.js";

export interface INativeHostMainProcessService {
    getChannel(channelName: string): IChannel;
}

export const nativeHostChannelName = "nativeHost";

export const nativeHostIpcChannels = {
    environmentGet: "conductor:nativeHost:environment:get",
    openDialog: "conductor:nativeHost:openDialog",
    showItemInFolder: "conductor:nativeHost:showItemInFolder",
    windowCommand: "conductor:nativeHost:windowCommand",
    windowControlsUpdate: "conductor:nativeHost:windowControls:update",
    windowState: "conductor:nativeHost:windowState",
} as const;

export const nativeWindowCommands = {
    toggleDevTools: "toggleDevTools",
    reloadWindow: "reloadWindow",
    closeWindow: "closeWindow",
    minimizeWindow: "minimizeWindow",
    maximizeWindow: "maximizeWindow",
    unmaximizeWindow: "unmaximizeWindow",
} as const;

export type NativeWindowCommand = (typeof nativeWindowCommands)[keyof typeof nativeWindowCommands];

export interface INativeWindowCommandPayload {
    readonly command: NativeWindowCommand;
}

export interface INativeWindowControlsUpdatePayload {
    readonly height?: number;
    readonly backgroundColor?: string;
    readonly foregroundColor?: string;
}

export interface INativeHostEnvironment {
    readonly isDesktop: boolean;
    readonly platform: string;
    readonly isPackaged: boolean;
    readonly appVersion: string | null;
    readonly userDataPath: string | null;
}

export class NativeHostService implements INativeHostServiceType {
    public declare readonly _serviceBrand: undefined;

    private readonly channel: IChannel;

    constructor(
        mainProcessService: INativeHostMainProcessService,
        public readonly windowId = 1,
    ) {
        this.channel = mainProcessService.getChannel(nativeHostChannelName);
    }

    public async getEnvironment(): Promise<INativeHostEnvironment> {
        const environment = await this.channel.call("getEnvironment");
        return normalizeNativeHostEnvironment(environment);
    }

    public async showOpenDialog(options: INativeOpenDialogOptions): Promise<INativeOpenDialogResult> {
        const result = await this.channel.call("showOpenDialog", options);
        return normalizeOpenDialogResult(result);
    }

    public showItemInFolder(path: string): void {
        const filePath = String(path ?? "").trim();
        if (!filePath) {
            return;
        }

        void this.channel.call("showItemInFolder", filePath).catch(() => undefined);
    }

    public toggleDevTools(): void {
        this.sendWindowCommand(nativeWindowCommands.toggleDevTools);
    }

    public reloadWindow(): void {
        this.sendWindowCommand(nativeWindowCommands.reloadWindow);
    }

    public async isMaximized(): Promise<boolean> {
        const result = await this.channel.call("isMaximized");
        return !!(result && typeof result === "object" && (result as { isMaximized?: unknown }).isMaximized === true);
    }

    public maximizeWindow(): void {
        this.sendWindowCommand(nativeWindowCommands.maximizeWindow);
    }

    public unmaximizeWindow(): void {
        this.sendWindowCommand(nativeWindowCommands.unmaximizeWindow);
    }

    public closeWindow(): void {
        this.sendWindowCommand(nativeWindowCommands.closeWindow);
    }

    public minimizeWindow(): void {
        this.sendWindowCommand(nativeWindowCommands.minimizeWindow);
    }

    public updateWindowControls(options: INativeWindowControlsOptions): void {
        void this.channel.call("updateWindowControls", normalizeWindowControlsOptions(options)).catch(() => undefined);
    }

    private sendWindowCommand(command: NativeWindowCommand): void {
        void this.channel.call("windowCommand", command).catch(() => undefined);
    }
}

function normalizeWindowControlsOptions(
    options: INativeWindowControlsOptions,
): INativeWindowControlsOptions {
    return {
        height: typeof options.height === "number" && Number.isFinite(options.height)
            ? Math.max(0, Math.round(options.height))
            : undefined,
        backgroundColor: typeof options.backgroundColor === "string"
            ? options.backgroundColor
            : undefined,
        foregroundColor: typeof options.foregroundColor === "string"
            ? options.foregroundColor
            : undefined,
    };
}

function normalizeOpenDialogResult(value: unknown): INativeOpenDialogResult {
    const record = value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};

    return {
        canceled: record.canceled === true,
        filePaths: Array.isArray(record.filePaths)
            ? record.filePaths.filter((path): path is string => typeof path === "string")
            : [],
    };
}

function normalizeNativeHostEnvironment(value: unknown): INativeHostEnvironment {
    const record = value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};

    return {
        isDesktop: record.isDesktop === true,
        platform: typeof record.platform === "string" ? record.platform : "",
        isPackaged: record.isPackaged === true,
        appVersion: typeof record.appVersion === "string" ? record.appVersion : null,
        userDataPath: typeof record.userDataPath === "string" ? record.userDataPath : null,
    };
}
