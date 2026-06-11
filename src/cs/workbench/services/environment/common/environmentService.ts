import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { INativeHostEnvironment } from "src/cs/platform/native/common/nativeHostService";

export type WorkbenchEnvironment = INativeHostEnvironment;

export const IWorkbenchEnvironmentService = createDecorator<IWorkbenchEnvironmentService>("workbenchEnvironmentService");

export interface IWorkbenchEnvironmentService {
    readonly _serviceBrand: undefined;
    readonly environment: WorkbenchEnvironment | null;
    readonly isDesktop: boolean;
    readonly isWindowsDesktop: boolean;
    readonly isPackaged: boolean;
}

export function normalizeWorkbenchEnvironment(value: unknown): WorkbenchEnvironment | null {
    const record = value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;

    if (!record) {
        return null;
    }

    return {
        isDesktop: record.isDesktop === true,
        platform: typeof record.platform === "string" ? record.platform : "",
        isPackaged: record.isPackaged === true,
        appVersion: typeof record.appVersion === "string" ? record.appVersion : null,
        userDataPath: typeof record.userDataPath === "string" ? record.userDataPath : null,
    };
}
