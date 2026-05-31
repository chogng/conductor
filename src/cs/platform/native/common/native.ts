import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { INativeHostEnvironment } from "src/cs/platform/native/common/nativeIpc";

export const INativeHostService = createDecorator<INativeHostService>("nativeHostService");

export interface INativeHostService {
    readonly _serviceBrand: undefined;
    readonly windowId: number;

    getEnvironment(): Promise<INativeHostEnvironment>;
}
