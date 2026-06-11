import type { IChannel } from "../../../base/parts/ipc/common/ipc.js";
import type { INativeHostService as INativeHostServiceType } from "./native.js";

type NativeHostEnvironment = Awaited<ReturnType<INativeHostServiceType["getEnvironment"]>>;
type NativeOpenDialogOptions = Parameters<INativeHostServiceType["showOpenDialog"]>[0];
type NativeOpenDialogResult = Awaited<ReturnType<INativeHostServiceType["showOpenDialog"]>>;
type NativeWindowControlsOptions = Parameters<INativeHostServiceType["updateWindowControls"]>[0];

interface INativeHostMainProcessService {
    getChannel(channelName: string): IChannel;
}

const nativeHostChannelName = "nativeHost";

export class NativeHostService implements INativeHostServiceType {
    public declare readonly _serviceBrand: undefined;

    private readonly channel: IChannel;

    constructor(
        mainProcessService: INativeHostMainProcessService,
        public readonly windowId = 1,
    ) {
        this.channel = mainProcessService.getChannel(nativeHostChannelName);
    }

    public async getEnvironment(): Promise<NativeHostEnvironment> {
        const environment = await this.channel.call("getEnvironment");
        return normalizeNativeHostEnvironment(environment);
    }

    public async showOpenDialog(options: NativeOpenDialogOptions): Promise<NativeOpenDialogResult> {
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
        void this.channel.call("toggleDevTools").catch(() => undefined);
    }

    public reloadWindow(): void {
        void this.channel.call("reloadWindow").catch(() => undefined);
    }

    public async isMaximized(): Promise<boolean> {
        const result = await this.channel.call("isMaximized");
        return !!(result && typeof result === "object" && (result as { isMaximized?: unknown }).isMaximized === true);
    }

    public maximizeWindow(): void {
        void this.channel.call("maximizeWindow").catch(() => undefined);
    }

    public unmaximizeWindow(): void {
        void this.channel.call("unmaximizeWindow").catch(() => undefined);
    }

    public closeWindow(): void {
        void this.channel.call("closeWindow").catch(() => undefined);
    }

    public minimizeWindow(): void {
        void this.channel.call("minimizeWindow").catch(() => undefined);
    }

    public updateWindowControls(options: NativeWindowControlsOptions): void {
        void this.channel.call("updateWindowControls", normalizeWindowControlsOptions(options)).catch(() => undefined);
    }
}

function normalizeWindowControlsOptions(
    options: NativeWindowControlsOptions,
): NativeWindowControlsOptions {
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

function normalizeOpenDialogResult(value: unknown): NativeOpenDialogResult {
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

function normalizeNativeHostEnvironment(value: unknown): NativeHostEnvironment {
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
