import { URI } from "src/cs/base/common/uri";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { AbstractPathService, IPathService, isWindowsFileSystem } from "src/cs/workbench/services/path/common/pathService";

export class NativePathService extends AbstractPathService {
    constructor() {
        super(URI.file("/"), isWindowsFileSystem());
    }
}

registerSingleton(IPathService, NativePathService, InstantiationType.Delayed);
