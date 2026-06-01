import { Disposable } from "src/cs/base/common/lifecycle";
import { mainWindow } from "src/cs/base/browser/window";
import { ipcRenderer } from "src/cs/base/parts/sandbox/electron-browser/globals";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { INativeHostService, type INativeHostService as INativeHostServiceType } from "src/cs/platform/native/common/native";
import {
    nativeHostIpcChannels,
    nativeWindowCommands,
    type INativeHostEnvironment,
    type NativeWindowCommand,
} from "src/cs/platform/native/common/nativeIpc";

export class NativeHostService extends Disposable implements INativeHostServiceType {
    public declare readonly _serviceBrand: undefined;

    public readonly windowId = mainWindow.conductorWindowId;

    public async getEnvironment(): Promise<INativeHostEnvironment> {
        const environment = await ipcRenderer.invoke(nativeHostIpcChannels.environmentGet);
        return normalizeNativeHostEnvironment(environment);
    }

    public toggleDevTools(): void {
        this.sendWindowCommand(nativeWindowCommands.toggleDevTools);
    }

    public reloadWindow(): void {
        this.sendWindowCommand(nativeWindowCommands.reloadWindow);
    }

    public closeWindow(): void {
        this.sendWindowCommand(nativeWindowCommands.closeWindow);
    }

    public minimizeWindow(): void {
        this.sendWindowCommand(nativeWindowCommands.minimizeWindow);
    }

    public toggleWindowMaximized(): void {
        this.sendWindowCommand(nativeWindowCommands.toggleWindowMaximized);
    }

    private sendWindowCommand(command: NativeWindowCommand): void {
        ipcRenderer.send(nativeHostIpcChannels.windowCommand, { command });
    }
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
    };
}

registerSingleton(INativeHostService, NativeHostService, InstantiationType.Delayed);
