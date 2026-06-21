import { createDecorator } from "../../instantiation/common/instantiation.js";

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

export interface INativeMessageBoxOptions {
    readonly buttons?: readonly string[];
    readonly cancelId?: number;
    readonly checkboxChecked?: boolean;
    readonly checkboxLabel?: string;
    readonly detail?: string;
    readonly message: string;
    readonly title?: string;
    readonly type?: "none" | "info" | "error" | "question" | "warning";
}

export interface INativeMessageBoxResult {
    readonly checkboxChecked?: boolean;
    readonly response: number;
}

export interface INativeWindowControlsOptions {
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

export interface INativeHostService {
    readonly _serviceBrand: undefined;
    readonly windowId: number;

    getEnvironment(): Promise<INativeHostEnvironment>;
    showOpenDialog(options: INativeOpenDialogOptions): Promise<INativeOpenDialogResult>;
    showMessageBox(options: INativeMessageBoxOptions): Promise<INativeMessageBoxResult>;
    showItemInFolder(path: string): Promise<void>;
    toggleDevTools(): Promise<void>;
    reloadWindow(): Promise<void>;
    isMaximized(): Promise<boolean>;
    maximizeWindow(): Promise<void>;
    unmaximizeWindow(): Promise<void>;
    closeWindow(): Promise<void>;
    minimizeWindow(): Promise<void>;
    updateWindowControls(options: INativeWindowControlsOptions): Promise<void>;
}
