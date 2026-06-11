import { ProxyChannel } from "../../../base/parts/ipc/common/ipc.js";
import { IMainProcessService, type IMainProcessService as IMainProcessServiceType } from "../../ipc/common/mainProcessService.js";
import type { INativeHostService as INativeHostServiceType } from "./native.js";

const nativeHostChannelName = "nativeHost";

// @ts-expect-error: interface is implemented via proxy
export class NativeHostService implements INativeHostServiceType {
    public declare readonly _serviceBrand: undefined;

    constructor(
        readonly windowId: number,
        @IMainProcessService mainProcessService: IMainProcessServiceType,
    ) {
        const properties = new Map<string, unknown>();
        properties.set("_serviceBrand", undefined);
        properties.set("windowId", windowId);

        return ProxyChannel.toService<INativeHostServiceType>(
            mainProcessService.getChannel(nativeHostChannelName),
            { properties },
        );
    }
}
