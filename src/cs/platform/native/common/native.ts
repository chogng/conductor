import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { INativeHostEnvironment } from "src/cs/platform/native/common/nativeIpc";

export const INativeHostService = createDecorator<INativeHostService>("nativeHostService");

export type NativeOpenDialogProperty =
    | "openFile"
    | "openDirectory"
    | "multiSelections"
    | "showHiddenFiles"
    | "createDirectory"
    | "promptToCreate"
    | "noResolveAliases"
    | "treatPackageAsDirectory"
    | "dontAddToRecent";

export interface INativeOpenDialogOptions {
    readonly buttonLabel?: string;
    readonly defaultPath?: string;
    readonly filters?: readonly {
        readonly extensions: readonly string[];
        readonly name: string;
    }[];
    readonly properties?: readonly NativeOpenDialogProperty[];
    readonly title?: string;
}

export interface INativeOpenDialogResult {
    readonly canceled: boolean;
    readonly filePaths: readonly string[];
}

export interface INativeWindowControlsOptions {
    readonly height?: number;
    readonly backgroundColor?: string;
    readonly foregroundColor?: string;
}

export interface INativeHostService {
    readonly _serviceBrand: undefined;
    readonly windowId: number;

    getEnvironment(): Promise<INativeHostEnvironment>;
    showOpenDialog(options: INativeOpenDialogOptions): Promise<INativeOpenDialogResult>;
    showItemInFolder(path: string): void;
    toggleDevTools(): void;
    reloadWindow(): void;
    isMaximized(): Promise<boolean>;
    maximizeWindow(): void;
    unmaximizeWindow(): void;
    closeWindow(): void;
    minimizeWindow(): void;
    updateWindowControls(options: INativeWindowControlsOptions): void;
}
