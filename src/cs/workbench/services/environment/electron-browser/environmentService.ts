import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { NativeHostService } from "src/cs/platform/native/electron-browser/nativeHostService";
import { getWorkbenchEnvironment, setWorkbenchEnvironment } from "src/cs/workbench/services/environment/browser/environmentService";
import {
    IWorkbenchEnvironmentService,
    normalizeWorkbenchEnvironment,
    type IWorkbenchEnvironmentService as IWorkbenchEnvironmentServiceType,
} from "src/cs/workbench/services/environment/common/environmentService";

export class WorkbenchEnvironmentService extends Disposable implements IWorkbenchEnvironmentServiceType {
    public declare readonly _serviceBrand: undefined;

    private readonly nativeHostService = this._register(new NativeHostService());

    constructor() {
        super();

        void this.refreshEnvironment();
    }

    public get environment() {
        return getWorkbenchEnvironment();
    }

    public get isDesktop(): boolean {
        return this.environment?.isDesktop === true;
    }

    public get isWindowsDesktop(): boolean {
        return this.environment?.isDesktop === true && this.environment.platform === "win32";
    }

    public get isPackaged(): boolean {
        return this.environment?.isPackaged === true;
    }

    private async refreshEnvironment(): Promise<void> {
        setWorkbenchEnvironment(normalizeWorkbenchEnvironment(await this.nativeHostService.getEnvironment()));
    }
}

registerSingleton(IWorkbenchEnvironmentService, WorkbenchEnvironmentService, InstantiationType.Delayed);
